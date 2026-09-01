## Destination

Let Tasks discover their Matrix asynchronously during Vitest collection while preserving exact coordinate inference and the existing Task lifecycle.

## Notes

- `matrix` remains optional; omitting it still creates one Case with `{}` coordinates.
- Vitest suite factories are awaitable, so Invoker can perform discovery during collection without changing `defineWorkflow`'s `void` API.

## Decisions so far

- [Make Task Matrix discovery asynchronous](issues/01-make-task-matrix-async.md) — resolve each Task's async Matrix function during Vitest collection while preserving `defineWorkflow`'s `void` API and exact coordinate inference.

## Fog

None.
