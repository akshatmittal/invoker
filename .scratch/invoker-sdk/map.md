## Destination

Produce an implementation-ready specification for `@akshatmittal/invoker`: an organization-owned TypeScript SDK for defining async, matrix-driven regression Tasks and Workflows; registering and executing them through one Vitest invocation with bounded concurrency; and producing structured results suitable for CI reporting and later querying.

## Notes

- Use the language in [`CONTEXT.md`](../../CONTEXT.md) and invoke `/domain-modeling` whenever it changes.
- This map plans the SDK; it does not implement it.
- Invoker is a thin regression DSL over Vitest; Vitest owns discovery, execution, workers, filtering, lifecycle, exit status, and reporting.
- A normal Vitest test module explicitly imports Tasks and calls `defineWorkflow`, which registers each Task as a sequential suite and each expanded Case as an individually named concurrent test with static metadata.
- Stable, unique Task names support independent execution through Vitest's full-name filter.
- A Task's setup maps to `beforeAll`; its typed result is shared by every Case for that Task.
- Concurrency, timeouts, retries, workers, and other generic execution settings belong directly to Vitest configuration; Invoker does not proxy them.
- Task output is JSON stored with matrix coordinates and caller metadata under `task.meta.invoker`.
- Vitest's JSON reporter produces the artifact; its GitHub Actions reporter produces annotations and a job summary. Workflow configuration owns artifact upload and retention.

## Decisions so far

- [Research portable runner reporting mechanisms](issues/01-research-portable-runner-reporting.md) — established GitHub annotation, summary, metadata, and workflow-owned artifact boundaries.
- [Research Vitest as Invoker's foundation](issues/10-research-vitest-foundation.md) — established which Vitest capabilities are public, partial, or experimental and exposed the execution-ownership tradeoff.
- [Choose Vitest's role in Invoker](issues/11-choose-vitest-role.md) — make Invoker a thin regression DSL over Vitest's public collection, execution, metadata, and reporter APIs.
- [Define matrix shape and expansion rules](issues/02-define-matrix-model.md) — expand synchronous JSON axes deterministically into typed, uniquely identified Vitest Cases; omit advanced matrix transformations in v1.
- [Define Invoker's result metadata schema](issues/03-define-run-result-schema.md) — add only a versioned matrix/metadata/output envelope to Vitest results while preserving exact Task types through the JSON boundary.
- [Define scheduling and Task lifecycle semantics](issues/04-define-scheduling-and-lifecycle.md) — register sequential Task suites and concurrent Cases with static metadata; map typed setup/teardown to Vitest hooks and leave runner settings to Vitest.
- [Define failure and output semantics](issues/05-define-failure-and-exit-semantics.md) — surface setup, Task, validation, and teardown failures through Vitest; retain static coordinates, clear retried Output, and avoid a parallel status model.
- [Define Vitest reporter configuration](issues/06-define-runner-reporter-contract.md) — use Vitest's default, JSON, and conditional GitHub reporters directly; retain one artifact-ready report and add no Invoker reporter.
- [Define the public TypeScript API](issues/08-define-public-typescript-api.md) — expose only strictly inferred `defineTask` definitions and side-effecting `defineWorkflow` registration; leave all generic execution options to Vitest.
- [Define package placement and exports](issues/09-define-package-and-export-layout.md) — publish one ESM `packages/invoker` entry with Vitest as a peer, strip the web template, and retain pnpm, Changesets, Turbo, and tsdown.
- [Assemble the implementation-ready Invoker specification](issues/12-assemble-implementation-ready-spec.md) — consolidate the resolved map into the canonical [`spec.md`](spec.md) handoff with no remaining decision frontier.

## Not yet specified

None.

## Out of scope

- Parallel Tasks and per-Task concurrency limits.
- A custom runner, collector, worker pool, scheduler, CLI, or directory discovery.
- [Define result persistence and reading responsibilities](issues/07-define-result-persistence-and-reading.md) — ruled beyond v1 because Vitest writes the result file and CI or downstream consumers own retention and querying.
- Invoker-owned reporters beyond metadata consumed by Vitest's built-in JSON and GitHub Actions reporters.
- A website or app.
