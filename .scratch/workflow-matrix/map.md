# Workflow matrices and typed Task parameters

Labels: wayfinder:map
Status: resolved

## Destination

Reach an implementation-ready specification for Workflow matrices and typed Task Parameters, covering the public API, expansion rules, lifecycle, and reporting.

## Notes

- Planning only. Use `/grilling` and `/domain-modeling` for decision sessions and the terminology in [CONTEXT.md](../../CONTEXT.md).
- Agreed while charting: Workflow Matrix axes multiply each Task's Matrix. Two environments and three models produce six Cases for that Task.
- A reusable Task declares its parameters. The Workflow explicitly binds each Task's parameters to fixed values or values from its Matrix.
- Parameters are available during Task Matrix discovery, setup, execution, and teardown. Passing a fixed parameter does not itself multiply executions.
- Repeat the Task sequence per Workflow coordinate: staging A → B, then production A → B. Each Task has separate setup/teardown in each environment.
- Keep one Workflow report, preserving both Workflow and Task coordinate scopes for each Case.
- Workflow metadata remains reporting context; Task Parameters are execution inputs.
- Existing Task matrices are asynchronous and resolve during collection. Consult [Make Task Matrix discovery asynchronous](../async-task-matrix/issues/01-make-task-matrix-async.md) when considering discovery timing; the original SDK's synchronous matrix decision is superseded.
- Current implementation entry points: `packages/invoker/src/task.ts`, `workflow.ts`, `matrix.ts`, and `types.ts`. The Slack reporter in `packages/invoker/src/slack/report.ts` assumes Workflow → Task → Case; inspect that assumption when deciding report hierarchy.
- Keep the API small, reuse existing expansion and Vitest execution capabilities, and preserve exact TypeScript inference. Do not create tests or start dev servers. Add a Changeset for changes.

## Decisions so far

- [Define typed Workflow-to-Task parameter binding](issues/01-define-typed-parameter-binding.md) — curried typed Task declarations produce callable binders; Workflow callbacks explicitly supply required JSON parameters while preserving inference.
- [Define Workflow Matrix expansion and lifecycle semantics](issues/02-define-expansion-and-lifecycle.md) — complete discovery before execution; run sequential coordinate-specific Task sequences with per-binding setup and native Vitest failures and retries.
- [Define Case identity and reporting across Workflow coordinates](issues/03-define-case-identity-and-reporting.md) — use a coordinate suite and schema 2, persist bound parameters, and report each coordinate/Task pair plus collection failures within one Workflow report.
- [Confirm the Workflow Matrix specification is ready for implementation](issues/04-confirm-specification-readiness.md) — approved the end-to-end contract and JSON-only parameter presentation; the [specification](spec.md) is ready for implementation.

## Not yet specified

None. All decision tickets are resolved.

## Out of scope

- Implementing the SDK changes during this map.
- A custom runner, scheduler, or execution controls duplicating Vitest configuration.
- Changes to GitHub Actions scheduling.
