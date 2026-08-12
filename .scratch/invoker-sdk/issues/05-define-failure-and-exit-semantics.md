# Define failure and output semantics

Type: grilling
Status: resolved
Blocked by: 03, 04

## Question

How do setup failures, Task exceptions, invalid JSON output, skipped Cases, retries, interruption, and partial execution map onto Vitest's native suite and test results; when is `meta.invoker` present; and which behavior is left entirely to Vitest?

## Answer

Invoker expresses failures through Vitest rather than maintaining a parallel status model:

- A setup exception is a native `beforeAll` failure. No Case callback runs, but every collected Case retains its static matrix and Workflow metadata.
- A Task exception or assertion is a native failed test. Output is absent unless the callback reached a successful return.
- A non-JSON return makes the wrapper throw a validation error naming the Task, Case, and invalid value path; Vitest reports that Case as failed.
- A teardown exception is a native `afterAll` failure. Previously completed Case results and Outputs remain intact; Invoker does not synthesize Case failures.
- Skips, todos, name/file filters, interruption, cancellation, retries, error serialization, suite status, run reason, and process exit remain Vitest-owned.

Invoker recommends Vitest's default `bail: 0` for complete regression reports but does not force it. Explicit Vitest configuration may stop early. Collected but unexecuted Cases retain static Invoker metadata and have no Output; Invoker does not repair or complete partial results after interruption.

At the start of every Case attempt, Invoker removes any existing `meta.invoker.output`. It assigns Output only after `run` resolves and runtime JSON validation succeeds. A retried Case therefore cannot retain a successful earlier attempt's Output after its final attempt fails; Vitest owns retry counts and prior errors.

Invoker records whether setup completed successfully and calls user teardown only when it did. Setup code that allocates partial resources before throwing must clean up that partial work itself before rethrowing.

Workflow metadata is validated once during `defineWorkflow`, before any Task suite is registered. Invalid metadata produces a Vitest collection error naming the Workflow and invalid path rather than a partially registered Workflow. Each Task's matrix is likewise validated and expanded before that Task suite is registered.

The Task callback receives the real typed Vitest `TestContext` under `vitest`, alongside `matrix` and `setup`. Authors may use native expectations, dynamic skips, annotations, artifacts, and other stable context features. Invoker reserves `vitest.task.meta.invoker` for its own envelope but does not wrap Vitest behavior.
