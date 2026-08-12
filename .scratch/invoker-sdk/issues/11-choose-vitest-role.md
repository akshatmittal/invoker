# Choose Vitest's role in Invoker

Type: grilling
Status: resolved
Blocked by: 10

## Question

Should Invoker use Vitest as its execution foundation, remain a purpose-built Node runner with an optional Vitest adapter, or exclude Vitest entirely? Decide whether Vitest's TypeScript execution, scheduling, lifecycle, reporting, and test ecosystem benefits justify its collection model, worker lifecycle, result translation, missing per-Task concurrency, ignored callback returns, dependency footprint, and reliance on experimental APIs for deeper extension.

## Answer

Invoker will be a thin, opinionated regression DSL on Vitest rather than an independent workflow engine. Vitest owns discovery, collection, execution, workers, filtering, lifecycle, failure status, process exit, and reporting. One runner invocation inside one CI job satisfies the execution boundary; Vitest may use its normal workers internally.

Each Workflow is a normal Vitest test module that imports Tasks and calls `defineWorkflow`. Invoker maps each stable, uniquely named Task to a sequential `describe` block, expands its typed GitHub-style matrix into Cases, and registers those Cases with `test.concurrent.for`. Once-per-Task setup maps to `beforeAll`; Invoker retains its typed return value and passes it to every Case. A Task can be selected independently with Vitest's full-name `-t` filter.

Case matrix coordinates, caller metadata, and JSON Task output live under `task.meta.invoker`. Vitest's built-in JSON reporter produces the artifact, and its built-in GitHub Actions reporter owns annotations and the job summary. V1 uses one Workflow-wide `maxConcurrency`; it has no per-Task limiter, custom collector, runner, pool, CLI, persistence layer, or reporter.

Only documented public Vitest test, hook, metadata, reporter, and configuration APIs may be used. The earlier research recommendation against Vitest assumed a general-purpose direct `runWorkflow` engine; the clarified regression-suite destination makes Vitest's ownership a feature rather than a mismatch.
