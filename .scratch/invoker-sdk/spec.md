# Invoker SDK Specification

## Summary

`@akshatmittal/invoker` is a thin, strictly typed regression-suite DSL over Vitest. Authors define reusable Tasks in TypeScript, compose them into Workflows, expand GitHub-style matrix axes into Cases, and run them through ordinary Vitest test modules. Vitest owns discovery, workers, scheduling, filtering, assertions, retries, status, errors, timing, and process exit. Invoker owns the regression-specific authoring contract, matrix expansion, shared Task lifecycle, JSON Output capture, stable metadata envelope, and an optional Slack reporter built on Vitest's public reporter API.

The package is intended for organization-wide reuse and public npm publication. It has no application, website, custom runner, CLI, hosted service, or persistence backend.

## Domain language

- **Workflow**: a named collection of Tasks registered as one top-level Vitest suite.
- **Task**: a reusable named regression definition registered as a sequential child suite.
- **Matrix**: named axes of JSON values expanded into Cases.
- **Case**: one concurrent Task execution for one expanded coordinate object.
- **Output**: the JSON value returned by a successfully completed Case.

[`CONTEXT.md`](../../CONTEXT.md) is the canonical glossary.

## Public API

The package has two ESM entry points:

```ts
import { defineTask, defineWorkflow } from "@akshatmittal/invoker";
import { slackReporter } from "@akshatmittal/invoker/slack";
```

It exports these public types:

```ts
export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type JsonObject = {
  readonly [key: string]: JsonValue;
};

export type Matrix = {
  readonly [axis: string]: readonly JsonValue[];
};

export type CaseCoordinates<M extends Matrix> = {
  readonly [K in keyof M]: M[K][number];
};

export interface InvokerMeta<
  Coordinates extends JsonObject,
  Output extends JsonValue,
  Metadata extends JsonObject = JsonObject,
> {
  schema: 1;
  matrix: Coordinates;
  metadata?: Metadata;
  output?: Output;
}
```

`TaskDefinition` and `TaskContext` are also public integration types. Internal conditional-input, expansion, validation, canonicalization, and registration helpers are not exported.

### `defineTask`

`defineTask` is side-effect-free. It accepts one definition object and returns a deeply readonly, precisely inferred `TaskDefinition`. It supports two compile-time states.

Without setup:

```ts
defineTask({
  name: "health-check",
  matrix: { region: ["us", "eu"] },
  run: ({ matrix, setup, vitest }) => {
    // matrix: { readonly region: "us" | "eu" }
    // setup: undefined
    // vitest: TestContext
    return { region: matrix.region, healthy: true };
  },
});
```

With setup and optional teardown:

```ts
export const evaluateModels = defineTask({
  name: "evaluate-models",
  matrix: {
    model: ["gpt-5", "gpt-5-mini"],
    dataset: ["support", "sales"],
  },
  setup: async ({ cases }) => loadFixtures(cases),
  run: async ({ matrix, setup, vitest }) => {
    vitest.expect(setup.has(matrix.dataset)).toBe(true);

    return {
      model: matrix.model,
      dataset: matrix.dataset,
      score: await evaluate(matrix, setup),
    };
  },
  teardown: async ({ setup, cases }) => {
    await setup.close();
  },
});
```

Contract:

- `name` is a non-empty string literal preserved verbatim.
- `matrix` is optional and synchronously known during collection.
- `setup`, `run`, and `teardown` may return synchronously or asynchronously.
- `teardown` is illegal without `setup` at compile time and runtime.
- `setup({ cases })` receives the complete expanded readonly coordinate array.
- `run({ matrix, setup, vitest })` receives one exact coordinate, the exact inferred setup value or `undefined`, and Vitest's public `TestContext`.
- `teardown({ setup, cases })` receives the same setup reference and expanded Cases.
- `run` must return a non-`undefined` `JsonValue`; its exact awaited Output type is inferred.
- The returned definition is readonly. Runtime deep-freezing is not required; mutation is unsupported.

Matrix literals determine the exact coordinate type, setup determines its exact shared value type, and both flow into `run`, whose exact Output is retained on the Task definition. Authors normally supply no generics.

### `defineWorkflow`

```ts
defineWorkflow({
  name: "model-regressions",
  metadata: {
    commit: process.env.GITHUB_SHA ?? "local",
    baseline: "2026-08-01",
  },
  tasks: [evaluateModels],
});
```

Contract:

- Accept only `name`, optional `metadata`, and `tasks`.
- `name` is non-empty and preserved verbatim.
- `metadata`, when present, is an exact `JsonObject` used only for reporting.
- `tasks` is a non-empty readonly tuple of `TaskDefinition`s with unique non-empty names.
- Preserve the heterogeneous Task tuple, literal names, metadata shape, matrices, setup values, and Outputs through const-generic inference.
- Validate the entire Workflow boundary before registering any Vitest suite.
- Synchronously register the Vitest hierarchy and return `void`.
- Do not accept concurrency, timeout, retry, reporter, worker, persistence, or other Vitest options.
- Do not pass Workflow metadata into Task callbacks. A Task needing configuration closes over it when defined.
- Permit a Task definition to be reused in multiple Workflows.
- Permit several Workflows in one module, while documenting one Workflow per `*.test.ts` file as the normal layout.

## Project layout and execution

Recommended consuming-project layout:

```text
regressions/
  tasks/
    evaluate-models.ts
    compare-baseline.ts
  workflows/
    model-regressions.test.ts
    release-regressions.test.ts
```

Each Workflow test file explicitly imports its Tasks and calls `defineWorkflow` once. Vitest discovers every matching test file; Invoker performs no directory scanning or central index loading.

Run normally through Vitest:

```bash
vitest run regressions/workflows/model-regressions.test.ts
```

Run one Task through Vitest's full-name regex:

```bash
vitest run regressions/workflows/model-regressions.test.ts \
  -t '^model-regressions > evaluate-models(?: >|$)'
```

Names may contain any non-whitespace content and are preserved verbatim. Slug-like stable names are recommended because `-t` is a regular expression; Invoker does not add a selection API or escape names.

One command is one Vitest invocation inside one CI job. Vitest may use its normal worker processes or threads. Different Workflow files may run in parallel; Tasks are sequential within their Workflow.

## Matrix model

V1 accepts axes only:

```ts
matrix: {
  model: ["gpt-5", "gpt-5-mini"],
  dataset: ["support", "sales"],
}
```

Rules:

- An omitted matrix or `{}` expands to one Case with coordinate `{}`.
- Each axis name is a non-empty, enumerable string that is not an array index, and each value is a non-empty
  readonly array of JSON values.
- Structured JSON objects may be axis values, allowing correlated parameters on one axis.
- There is no explicit-Case mode and no `include`, `exclude`, asynchronous discovery, custom naming callback, or Case-count ceiling.
- Expansion is the Cartesian product.
- Preserve axis object insertion order and value array order.
- The first axis changes slowest; the last changes fastest.
- Coordinates are the semantic Case identity. Vitest owns internal IDs.
- Snapshot each axis value before expansion so later caller mutation cannot affect Cases.
- Reject duplicate values within each axis before expanding the Cartesian product. Object key order is ignored for
  duplicate comparison; array order is significant.

For the example, expansion order is:

```ts
[
  { model: "gpt-5", dataset: "support" },
  { model: "gpt-5", dataset: "sales" },
  { model: "gpt-5-mini", dataset: "support" },
  { model: "gpt-5-mini", dataset: "sales" },
];
```

Case display names use a one-based index and compact JSON values in axis order:

```text
[1] model="gpt-5", dataset="support"
```

A matrixless Case is named `[1]`.

## Vitest registration algorithm

`defineWorkflow` performs these steps synchronously:

1. Validate the Workflow name and metadata.
2. Validate every Task definition, enforce unique Task names, expand every matrix, and construct every Case name and static metadata. Do not partially register an invalid Workflow.
3. Register `describe(workflow.name, { concurrent: false }, ...)`.
4. In Task tuple order, register one `describe(task.name, { concurrent: false }, ...)` per Task.
5. Inside each Task suite, keep a shared setup value.
6. When setup exists, register `beforeAll` to call it once with all expanded Cases, await it, and retain its exact value by reference.
7. Register every expanded Case individually with `test.concurrent(caseName, { meta }, callback)`. Do not use `test.concurrent.for`, because each Case needs distinct static metadata before setup or execution.
8. At the start of every Case attempt, remove any prior `meta.invoker.output`.
9. Call `run` with its coordinate, shared setup value or `undefined`, and the current `TestContext`.
10. Snapshot and validate the returned Output in one traversal, then assign that snapshot to
    `vitest.task.meta.invoker.output`.
11. When teardown exists, return it as the `beforeAll` cleanup; Vitest calls it only after setup completed successfully with the same setup reference and Cases.

Invoker attaches this static metadata during collection:

```ts
meta: {
  invoker: {
    schema: 1,
    matrix: coordinates,
    metadata: workflowMetadata, // omitted when absent
  },
}
```

`vitest.task.meta.invoker` is reserved for Invoker. Authors may otherwise use the supplied `TestContext`, including native expectations, dynamic skips, annotations, and artifacts.

## JSON validation

Runtime validation backs every compile-time JSON constraint because JavaScript callers and widened TypeScript values can bypass types.

Accept:

- `null`, booleans, strings, and finite numbers.
- Dense arrays containing valid JSON values.
- Plain objects, including null-prototype objects, with string keys and valid JSON values.

Reject with the owning Workflow or Task and exact property path:

- `undefined`, `bigint`, symbols, and functions.
- `NaN`, positive infinity, and negative infinity.
- Sparse array holes.
- Cyclic values.
- `Date`, class instances, maps, sets, typed arrays, and other non-plain objects.
- Non-enumerable, symbol, or array-index matrix axes; non-array axes; empty axis arrays; empty/whitespace-only
  names; and duplicate coordinates.

Matrix values, Workflow metadata, and Task definitions are snapshotted before registration so later caller mutation has
no effect. Output validation occurs after `run` resolves and fails that Case through an ordinary thrown validation
error.

Use a small internal recursive validator and canonical JSON key generator; add no validation or serialization dependency. Canonicalization recursively sorts object keys for duplicate comparison while preserving array order.

## Lifecycle and failure semantics

Vitest owns all execution status:

- A setup exception is a native `beforeAll` failure. Case callbacks do not run, but collected Cases retain static matrix and Workflow metadata.
- A Task exception or assertion is a native failed test. Output is absent unless the callback returned successfully.
- Invalid Output makes the wrapper throw, producing a native failed test.
- A teardown exception is a native one-time cleanup failure. Completed Case statuses and Outputs remain intact; Invoker synthesizes no Case failures.
- User teardown runs only after successful setup. Setup code that partially allocates before throwing must clean up its own partial work.
- Skips, todos, filters, retries, cancellation, interruption, suite status, run reason, error serialization, and process exit remain Vitest-owned.
- At every retry attempt, clear prior Output and set a snapshot only after successful return and validation. Final
  metadata cannot retain stale Output from an earlier attempt or later mutation.
- Collected but unexecuted Cases retain static Invoker metadata and have no Output.
- Do not repair partial metadata after cancellation or process interruption.

Recommend Vitest's default `bail: 0` for complete regression reports, but do not enforce it. Explicit project configuration may stop early.

The shared setup value is not cloned or serialized before Cases receive it. Concurrent mutation safety belongs to the Task author.

## Vitest configuration and reporting

Invoker exports no configuration helper. A consuming project configures Vitest directly:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxConcurrency: 5,
    reporters: ["default", "json", ...(process.env.GITHUB_ACTIONS === "true" ? ["github-actions" as const] : [])],
    outputFile: {
      json: "./artifacts/invoker-results.json",
    },
  },
});
```

The project owns the output directory and all Vitest settings, including `maxConcurrency`, `testTimeout`, `hookTimeout`, `teardownTimeout`, retries, bail, pools, and workers.

Reporter responsibilities:

- `default`: local progress, failures, and summary.
- `json`: one Jest-compatible report for the whole Vitest invocation, written to the configured stable path.
- `github-actions`: failure annotations, test statistics, flaky retry information, and GitHub job summary when `GITHUB_ACTIONS === "true"`.

Because reporters are explicitly configured, the GitHub reporter must also be explicitly included. Do not configure `filterMeta`; consumers query `assertionResults[].meta.invoker` and its `schema: 1` envelope. Vitest's report remains authoritative for status, errors, timing, hierarchy, retries, and IDs.

### Slack reporter

The optional Slack reporter is a separate subpath so the core authoring API does not load Slack code:

```ts
import { slackReporter } from "@akshatmittal/invoker/slack";
import { defineConfig } from "vitest/config";

const runUrl =
  process.env.GITHUB_ACTIONS === "true"
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : undefined;

export default defineConfig({
  test: {
    reporters: [
      "tree",
      slackReporter({
        token: process.env.SLACK_BOT_TOKEN!,
        channel: process.env.SLACK_CHANNEL_ID!,
        runUrl,
      }),
    ],
  },
});
```

The public options are only `token`, `channel`, and optional `runUrl`. The reporter:

- Uses `@slack/web-api` with a bot token and channel ID; it does not support incoming webhooks.
- Filters collected Vitest Cases by `meta.invoker` and derives Workflow and Task names from their registered suite hierarchy.
- Posts one top-level `Invoker Report` message after the Vitest run. Additional status-colored Workflow cards are
  threaded so each message remains within Slack's table row and character limits. Each card's headline contains
  aggregate passed/total counts followed by Workflow metadata.
- Renders one native Slack table row per Task with final passed, retried, failed, and skipped Case counts plus the Task's Case execution duration. One shared footer contains the elapsed span from the first Case start to the final Case completion, a Slack-localized completion timestamp, and the optional run link.
- Counts a Case in `retried` when its final Vitest diagnostic has a retry count greater than zero. Retried overlaps final status, so a successful retry is both passed and retried.
- Uses a green status when all Cases pass without retries, yellow when Cases were retried, skipped, or left incomplete, and red when any Case or Workflow-level error remains failed.
- Posts failure replies in the report thread. Each Workflow gets one red card reply per failed Task combining all of that Task's final failed Cases, with the Task failure count, Workflow metadata, Case name, matrix coordinate, and concise final error messages. Workflow-level errors get their own card. Unhandled Vitest errors are reported once at Run level. Split a group into numbered replies only when required by Slack's message length limits.
- Escapes Slack markup in all names, matrices, and errors, and chunks failure details to Slack's message limits.
- Disables automatic retries because an uncertain `chat.postMessage` result could duplicate a message. Explicit rate-limit
  rejections are safe to reattempt after Slack's required delay. A failed threaded message emits a sanitized aggregate
  warning without preventing later messages or changing Vitest's result.
- Sends nothing when no Invoker Workflow was collected. A module that fails before any Invoker Case is collected has no Workflow identity and cannot be reported.

The Slack app needs `chat:write`; it must be a member of private target channels. `runUrl`, when supplied, is rendered as a link to the CI run. Hard process termination cannot trigger `onTestRunEnd` and therefore cannot notify Slack.

The CI workflow creates the output directory, runs Vitest, and uploads `artifacts/invoker-results.json` even when tests fail. The artifact service supplies run identity and retention. Invoker does not generate Run IDs, upload artifacts, index results, read history, or render Task Outputs in GitHub's job summary.

## Package and repository layout

Target workspace:

```text
/
  .changeset/config.json
  apps/
    example/
      src/
      package.json
      tsconfig.json
      vitest.config.ts
  packages/
    invoker/
      src/
        index.ts
        json.ts
        matrix.ts
        slack.ts
        slack/
          report.ts
          reporter.ts
        task.ts
        types.ts
        workflow.ts
      package.json
      tsconfig.json
      tsdown.config.ts
      README.md
  tooling/
    tsconfig/
  LICENSE
  package.json
  pnpm-workspace.yaml
  turbo.json
  tsconfig.json
```

Implementation changes:

- Replace `packages/app-config` with `packages/invoker`.
- Delete `apps/web-start` and `packages/ui` completely.
- Keep only the non-web `apps/example` consumer in `apps/*`.
- Remove every web-only dependency, catalog entry, override, shared DOM/JSX compiler option, root TypeScript reference, build output, and lockfile entry.
- Keep pnpm, Changesets, Turbo, tsdown, TypeScript, linting, formatting, and release management.
- Rename the private root package to `invoker-workspace`.
- Keep strict Node/ESM shared TypeScript configuration.
- Add the missing standard Changesets configuration for a public independently versioned package.
- Add a root MIT `LICENSE` and focused SDK README.

`packages/invoker/package.json` contract:

- Name `@akshatmittal/invoker`.
- Initial version `0.1.0`.
- Public npm access and MIT license.
- ESM-only, `sideEffects: false`, and the existing GitHub repository metadata.
- Node engine aligned with the root's Node 24 requirement.
- `"."` and `"./slack"` exports with compiled ESM and declarations.
- Publish only `dist`, `README.md`, and license material.
- Reuse tsdown for `src/index.ts` and `src/slack.ts` entries, ESM output, and declarations.
- Depend directly on `@slack/web-api` for the optional reporter implementation; do not add Bolt or a Slack abstraction
  layer.
- Require `vitest: ^4.1.10` as a peer dependency and a development dependency.
- Reference Vitest directly rather than adding it to the workspace catalog.
- Import runtime/types only from documented public `vitest` entry points; never depend directly on internal Vitest packages.

Keep `index.ts` and `slack.ts` as the public package interfaces. Internal modules own one cohesive concern each: public data contracts, Task definition, JSON validation, matrix expansion, Workflow registration, Slack report aggregation, and Slack delivery. Do not add pass-through layers or plugin abstractions.

## Out of scope for v1

- Parallel Task suites or per-Task concurrency limits.
- Custom runner, collector, worker pool, scheduler, or CLI.
- Directory discovery or generated test modules.
- Matrix `include`, `exclude`, explicit Cases, async discovery, custom names, or arbitrary limits.
- Invoker-specific status, retry, timing, error, or process-exit model.
- General reporter framework, reporter formatting callbacks, job-summary Output rendering, normalized result file, or config helper.
- Run IDs, immutable per-run files, artifact upload, retention, hosted storage, indexing, history readers, or query helpers.
- Website, app, UI package, or web dependency graph.

Add any of these only when a concrete regression suite demonstrates that Vitest's public surface and the retained JSON artifact are insufficient.

## Implementation sequence

1. Remove the web template and simplify workspace/package/TypeScript configuration.
2. Create the publishable `packages/invoker` shell by adapting the existing tsdown package configuration.
3. Define the public JSON, Matrix, context, and metadata types in `src/types.ts`, and the Task contract in `src/task.ts`.
4. Implement JSON validation and canonical coordinate comparison with JavaScript/Node primitives.
5. Implement deterministic matrix expansion and Case display names.
6. Implement `defineTask` inference and readonly definition output.
7. Implement `defineWorkflow` boundary validation and Vitest registration, setup, retries-safe Output capture, and teardown.
8. Add the README usage, Vitest configuration, filtering, GitHub Actions artifact guidance, and explicit v1 limits.
9. Build declarations and inspect the npm tarball contents.
10. Add the optional Slack reporter subpath, Workflow/Task aggregation, threaded failure delivery, README usage, and example configuration.

Repository instructions prohibit creating tests. Handoff verification is therefore limited to existing static/build/package checks:

```bash
pnpm typecheck
pnpm build
pnpm --filter @akshatmittal/invoker pack --dry-run
```

The implementation is complete when the public declarations preserve the specified inference, the package builds as ESM, only intended files appear in the tarball, no web package or dependency remains, and the README documents a runnable Vitest Workflow plus artifact configuration.
