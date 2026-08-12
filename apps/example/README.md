# Invoker example

This private workspace package demonstrates a complete Invoker regression
Workflow: a typed matrix, shared Task setup, concurrent Cases, teardown, Vitest
assertions, and JSON Output metadata.

Run it from the repository root:

```sh
pnpm --filter @workspace/invoker-example test
```

Vitest writes the queryable report to
`apps/example/artifacts/invoker-results.json`. Run only the example Task with:

```sh
pnpm --filter @workspace/invoker-example test -- -t score-models
```
