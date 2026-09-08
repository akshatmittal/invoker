# Workflow matrices and typed Task parameters

Status: ready for implementation — approved 2026-09-08

## Purpose

Allow a Workflow to repeat its Task sequence for each Workflow Matrix coordinate and explicitly pass typed parameters into reusable Tasks. Workflow axes combine with each Task's own Matrix: two environments and three models produce six Cases for that Task.

This is an implementation handoff, not an implementation. The authoritative decisions are [parameter binding](issues/01-define-typed-parameter-binding.md), [expansion and lifecycle](issues/02-define-expansion-and-lifecycle.md), and [identity and reporting](issues/03-define-case-identity-and-reporting.md). Final readiness is tracked in [Confirm the Workflow Matrix specification is ready for implementation](issues/04-confirm-specification-readiness.md).

## Public API

```ts
import { defineTask, defineWorkflow } from "@akshatmittal/invoker";

type EvaluateParams = {
  environment: "staging" | "production";
  baseline: string;
};

const evaluate = defineTask<EvaluateParams>()({
  name: "evaluate",
  matrix: async ({ params }) => ({
    model: await discoverModels(params.environment),
  }),
  setup: async ({ params, cases }) => openEvaluator(params.environment, params.baseline, cases),
  run: async ({ params, matrix, setup, vitest }) => {
    const score = await setup.evaluate(matrix.model);
    vitest.expect(score).toBeGreaterThanOrEqual(0);
    return { baseline: params.baseline, score };
  },
  teardown: async ({ setup }) => setup.close(),
});

const healthCheck = defineTask()({
  name: "health-check",
  run: async () => ({ healthy: true }),
});

defineWorkflow({
  name: "regressions",
  metadata: { purpose: "baseline comparison" },
  matrix: async () => ({
    environment: ["staging", "production"],
  }),
  tasks: ({ matrix }) => [
    healthCheck(),
    evaluate({
      environment: matrix.environment,
      baseline: "2026-09-01",
    }),
  ],
});

// Reuse the same Task with a different fixed input and no Workflow Matrix.
defineWorkflow({
  name: "production-baseline",
  tasks: () => [evaluate({ environment: "production", baseline: "2026-08-01" })],
});
```

`discoverModels` and `openEvaluator` above represent application-owned functions. Their exact return types flow into Task Matrix and setup inference.

- `defineTask<Params>()(definition)` declares a reusable Task and returns a callable parameter binder. Calling that binder returns a bound Task; it does not execute work or discover its Matrix.
- `defineTask()(definition)` declares a parameterless Task, bound with no argument. Its callback `params` is an exact empty object.
- Every declared parameter field is required. Optional parameter properties are unsupported; reject them at declaration time. There is no SDK parameter defaults mechanism. All parameter values must be JSON-compatible; `undefined` is not a parameter value.
- Each binding is statically checked against its Task's parameter type. Missing fields, wrong value types, and values outside a declared literal union fail compilation. Parameter types must not erase independently inferred Matrix coordinates, setup values, or Output.
- Workflow axes infer their literal coordinate types. The synchronous `tasks: ({ matrix }) => [...]` callback receives those coordinates and returns a nonempty list of bound Tasks. It can select different Tasks for different coordinates using ordinary TypeScript.
- Task names must be unique within each Workflow coordinate. Reusing a Task in another coordinate or Workflow is supported; binding the same Task name twice within one coordinate is rejected. There is no alias API.
- Workflow `matrix` is an optional `async () => Matrix`. Task `matrix` is an optional `async ({ params }) => Matrix`. Omission of either gives `{}` and therefore one coordinate.
- Task callback contexts are `matrix({ params })`, `setup({ params, cases })`, `run({ params, matrix, setup, vitest })`, and `teardown({ params, cases, setup })`.
- `cases` contains only the bound Task's expanded Task coordinates. Task `matrix` contains only its own coordinate. Workflow coordinates enter Tasks exclusively through explicit parameters; no merging or implicit inheritance occurs.
- Parameters are readonly snapshots. Setup values retain their exact application-owned types and shared references. Teardown requires setup; without setup, run receives `setup: undefined` as today.
- Workflow reporting metadata remains separate from execution parameters. Existing native Vitest context and JSON Output behavior remain.
- Update the existing exported Task/context/metadata types to express this contract. Keep binding and registration machinery internal unless a type is needed to describe a public return value. No runner settings are added to Invoker.

The new declaration and binding forms replace the old forms directly. Backward compatibility is not required.

## Collection and execution

1. Register the outer Workflow suite with enough identity for reporting even if collection fails.
2. Validate Workflow identity and reporting metadata. Resolve the Workflow Matrix once and expand it with the existing Matrix expansion rules.
3. In coordinate order, invoke the synchronous Task-list callback once per coordinate. Validate nonempty lists, bound Tasks, and unique Task names within each list. Validate JSON compatibility and snapshot each binding's parameters before Task discovery.
4. Resolve each bound Task's Matrix exactly once. These discovery calls may run concurrently across Tasks and Workflow coordinates. Validate and expand all Task matrices before registering executable Task suites.
5. Register Workflow coordinate suites in expansion order, and Task suites within each coordinate in returned list order. Register each Case individually as a concurrent Vitest test with static schema 2 metadata.
6. Execute the complete Task sequence for one Workflow coordinate before proceeding to the next. Each bound Task runs setup once, its Cases concurrently under Vitest's limits, and teardown once after successful setup.

Reuse the existing Cartesian expansion: axes preserve insertion order, the last axis varies fastest, `{}` produces one coordinate, empty axes and duplicate axis values are errors. Existing JSON and axis-name validation applies at both Matrix scopes. No include/exclude language, per-Task dependencies, or custom scheduling is introduced.

Task setup receives only its binding's Cases. Its result and the parameter snapshot are shared across those Cases and retries. Mutation of parameters is unsupported; there is no new deep-freezing mechanism. Concurrency safety for mutable setup resources belongs to the Task author.

Separate Workflow modules remain subject to Vitest's own worker scheduling. Concurrency limits, retries, timeouts, filtering, bail, interruption, and exit status remain Vitest configuration and behavior.

## Failure behavior

| Failure                                                              | Result                                                                                                                           |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Workflow discovery, binding, parameter validation, or Task discovery | Workflow collection fails before any of its Tasks execute; no partial Workflow execution.                                        |
| Setup                                                                | Native Vitest hook failure; no Case callback for that binding executes; static Case coordinates and parameters remain available. |
| Case execution or invalid Output                                     | Native failed Case; successful JSON Output is retained only for a successful attempt.                                            |
| Teardown                                                             | Native hook failure; completed Case results and Outputs remain intact.                                                           |

Later Tasks and Workflow coordinates continue after execution failures under normal Vitest behavior; explicit bail configuration may stop them. A failing setup is responsible for cleaning up resources allocated before it threw. Teardown runs only after successful setup.

Retries reuse the collected Matrix, binding, parameter snapshot, and Task setup result. Clear previous Output at the start of each Case attempt. Invoker adds no independent retry, cancellation, or failure status model.

## Identity and result metadata

The hierarchy is always Workflow → Workflow coordinate → Task → Case:

```text
regressions
  [1] environment="staging"
    evaluate
      [1] model="small"
      [2] model="medium"
      [3] model="large"
  [2] environment="production"
    evaluate
      [1] model="small"
      [2] model="medium"
      [3] model="large"
```

Reuse the current numbered coordinate-name formatter at both scopes. An empty coordinate is named `[1]`, including the Workflow coordinate suite when its Matrix is omitted. The full hierarchy identifies each Case and supports ordinary Vitest name filtering by environment, Task, or Case. No new hash or persistent identifier is introduced.

Each Case has schema 2 metadata at `meta.invoker`:

```json
{
  "schema": 2,
  "matrix": {
    "workflow": { "environment": "staging" },
    "task": { "model": "small" }
  },
  "params": {
    "environment": "staging",
    "baseline": "2026-09-01"
  },
  "metadata": { "purpose": "baseline comparison" },
  "output": { "baseline": "2026-09-01", "score": 0.95 }
}
```

`matrix.workflow`, `matrix.task`, and `params` are always present. Empty scopes and parameterless Tasks use `{}`. Workflow metadata remains optional; Output is present only after a successful JSON-valid attempt. Both coordinate scopes and all bound parameters, including fixed inputs, are persisted before execution. There is no automatic redaction or persistence toggle.

Workflow and Task axes may have identical names without collision. Parameter types and both coordinate types should remain expressible in the exported metadata type. Update the Slack metadata parser and other consumers to schema 2 directly; do not retain a schema 1 reader.

## Reporting

- Produce one logical report per Workflow. Within Slack, use one row per Workflow coordinate/Task pair, with the coordinates and Task name in the label. Keep existing table pagination.
- Counts belong to each binding and aggregate into Workflow totals. Row duration retains the existing elapsed Case span; Workflow elapsed time spans its executed Cases.
- Case failure, successful retry, and skip details identify Workflow and Task coordinates separately. Setup and teardown errors identify the Workflow coordinate and Task without inventing a Case coordinate.
- A collection failure still produces a failed Workflow summary with available identity and discovery context even when there are no registered Cases. Identify failed Workflows from suite information rather than relying only on Case traversal. Do not fabricate Case counts or durations for undiscovered work.
- Preserve existing reporter delivery and unhandled-error behavior. Generic errors that cannot be attributed to a Workflow retain the existing run-level error reporting.
- Persist `params` in JSON results. Slack shows coordinates, status, selected Workflow metadata, and error details; it does not automatically print full parameter objects.

## Implementation scope

- `packages/invoker/src/task.ts`: curried declarations, callable typed binders, required JSON parameter contracts, parameterless binding, and exact callback inference.
- `packages/invoker/src/workflow.ts`: coordinate-specific binding and preparation, parameter snapshots, nested sequential suites, failure attribution, and static schema 2 Case metadata.
- `packages/invoker/src/types.ts` and `index.ts`: update public contexts, Task definitions, and result metadata types while keeping internal mechanics private.
- `packages/invoker/src/matrix.ts` and `json.ts`: reuse existing expansion, naming, and JSON snapshotting helpers; change only where the new scopes require it.
- `packages/invoker/src/slack/report.ts` and any affected reporter caller: new hierarchy and envelope, coordinate-specific rows and error context, and reporting for collection failures without Cases.
- `packages/invoker/README.md` and existing usage sites: replace old declaration/registration examples and document parameter persistence and both coordinate scopes.
- Add the required implementation Changeset. No new packages, tests, or dev servers are required by this effort.

## Acceptance criteria

- One Task with three discovered models bound for two environments produces six Cases. A matrixless health-check Task included in both environments adds two Cases, for eight total.
- The same declared Task binds in a second Workflow with another baseline, and each binding is typechecked independently.
- Required parameter properties, Workflow literal coordinates, Task coordinates, setup values, and Output remain precisely typed. Optional parameter properties, missing required values at binding, and incompatible bindings are rejected by TypeScript; parameterless binding takes no argument.
- Conditional Task selection is allowed, but an empty list or duplicate Task name within one coordinate fails collection.
- All discovery completes before execution, and every discovery function runs the agreed number of times. A production discovery failure prevents staging execution within the same Workflow and appears as a collection failure in reporting.
- Execution order is staging A → B, then production A → B. Setup and teardown occur per binding; retries reuse setup and parameters. Runtime failure does not add an Invoker-specific stop rule.
- JSON results retain both Matrix scopes and all bound parameters even for collected Cases whose setup fails. Retried Output cannot leak from an earlier attempt.
- Slack groups all coordinates under one Workflow, distinguishes coordinate/Task rows and failures, and reports a Workflow with no Cases after collection failure.
- Run the repository's applicable typecheck/build checks during implementation. Do not create tests or start a dev server. Review actual inferred types and runtime paths against these criteria.
