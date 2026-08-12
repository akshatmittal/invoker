# Define scheduling and Task lifecycle semantics

Type: grilling
Status: resolved
Blocked by: 02

## Question

How does `defineWorkflow` map Tasks into sequential Vitest suites and Cases into concurrent tests; how does Invoker relate to Vitest concurrency configuration; exactly what matrix information does `beforeAll` setup receive; and how are shared setup and teardown typed?

## Answer

`defineWorkflow` registers Tasks in tuple order as ordinary, sequential Vitest `describe` suites. Separate Workflow modules remain under Vitest's normal file-worker scheduling and may execute in parallel.

Invoker expands each Task's matrix during collection, then registers each Case individually with `test.concurrent(name, { meta }, callback)`. It does not use `test.concurrent.for`: individual registration lets Invoker attach that Case's distinct static `meta.invoker.matrix` and optional Workflow metadata before setup or user execution, so coordinates survive setup failures. The generated callback awaits `run` and writes its validated JSON Output into the existing metadata envelope.

Invoker does not own or proxy concurrency, timeout, retry, worker, or other generic runner settings. Authors configure Vitest's `maxConcurrency`, `testTimeout`, `hookTimeout`, `teardownTimeout`, retry, and worker options directly. The configured `maxConcurrency` bounds the Cases registered as concurrent tests.

Optional Task setup runs once in the Task suite's `beforeAll`:

```ts
setup: async ({ cases }) => sharedValue;
```

`cases` is the complete expanded readonly coordinate array. The exact inferred setup value is retained by reference and passed to every concurrent Case as `run({ matrix, setup })`; Invoker does not clone or serialize it. Concurrent mutation safety belongs to the Task author. When setup is omitted, `setup` is consistently typed and passed as `undefined`.

Optional Task teardown requires setup and runs once through `afterAll` after every Case in the Task has settled:

```ts
teardown: async ({ setup, cases }) => {
  /* cleanup */
};
```

It receives the same setup reference and expanded readonly Cases, retains their exact types, and is awaited before Vitest advances past the Task suite. Its failure is a native Vitest hook failure. Invoker adds no per-Case lifecycle hooks; Task code may use Vitest's own APIs where necessary.
