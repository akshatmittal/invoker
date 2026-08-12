# Define the public TypeScript API

Type: grilling
Status: resolved
Blocked by: 02, 03, 04, 05, 06, 11

## Question

What are the final signatures and inference relationships for `defineTask` and `defineWorkflow`; how are explicitly imported Tasks registered as Vitest suites and parameterized tests; which options belong to Invoker versus Vitest; and which types are public?

## Answer

V1 exposes two functions and no builder, class, plugin surface, CLI, or execution call:

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
    return { score: await evaluate(matrix, setup) };
  },
  teardown: async ({ setup }) => setup.close(),
});
```

```ts
defineWorkflow({
  name: "model-regressions",
  metadata: { commit: process.env.GITHUB_SHA ?? "local" },
  tasks: [evaluateModels],
});
```

`defineTask` is side-effect-free and returns a deeply readonly, precisely inferred `TaskDefinition`. Runtime deep-freezing is unnecessary; mutation is unsupported and `defineWorkflow` validates the consumed definition. A Task may be reused in multiple Workflows.

Task input has two strictly typed states:

- Without setup, `setup` and `teardown` are absent and `run` receives `setup: undefined`.
- With setup, its exact awaited return type flows into `run`; optional teardown requires setup and receives that same type.

`setup`, `run`, and `teardown` accept synchronous or asynchronous returns through a private `Awaitable<T>` helper. Matrix literals determine exact readonly Case coordinates; a matrixless Task receives an exact empty record rather than TypeScript's broad `{}` type. `run` infers its exact awaited Output and constrains it to `JsonValue`.

The `run` callback receives `{ matrix, setup, vitest }`, where `vitest` is Vitest's exact public `TestContext`. Invoker does not wrap or narrow it. `vitest.task.meta.invoker` is reserved by convention for Invoker's envelope.

`defineWorkflow` accepts only a non-empty literal `name`, optional exact `JsonObject` `metadata`, and a non-empty readonly `tasks` tuple. It validates Workflow metadata and all Task definitions before registering anything, rejects duplicate or empty Task names, then synchronously registers the Vitest hierarchy and returns `void`. It has no runner, concurrency, timeout, retry, reporter, or worker options. Workflow metadata is reporting context and is not passed to Task callbacks.

Multiple Workflows may be registered in one test module, though one Workflow per `index.test.ts` is the documented convention. Names are preserved verbatim; slug-like names are recommended but not enforced. A Task is independently selected through Vitest's full-name filter:

```bash
vitest run regressions/model/index.test.ts \
  -t '^model-regressions > evaluate-models(?: >|$)'
```

The public type surface is limited to `JsonPrimitive`, `JsonValue`, `JsonObject`, `Matrix`, `CaseCoordinates<M>`, `TaskDefinition`, `TaskContext`, and `InvokerMeta`. Internal conditional-input, expansion, validation, and registration helpers remain private. Workflow definitions and heterogeneous Task tuples use const-generic inference so literal names, metadata, matrices, setup values, and distinct Outputs are not widened before the JSON boundary.
