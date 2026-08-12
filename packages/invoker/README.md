# @akshatmittal/invoker

A strictly typed TypeScript DSL for matrix-driven regression workflows. Invoker
expands Tasks into Vitest tests, runs each Task's Cases concurrently, and stores
validated JSON Output in Vitest metadata for reporters and later analysis.

## Install

```sh
pnpm add -D @akshatmittal/invoker vitest
```

Invoker supports Node 24 and Vitest 4.1.10 or newer within Vitest 4.

## Define a Workflow

```ts
// regressions/model/tasks/evaluate-models.ts
import { defineTask } from "@akshatmittal/invoker";

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
  teardown: async ({ setup }) => {
    await setup.close();
  },
});
```

```ts
// regressions/model/index.test.ts
import { defineWorkflow } from "@akshatmittal/invoker";
import { evaluateModels } from "./tasks/evaluate-models.js";

defineWorkflow({
  name: "model-regressions",
  metadata: {
    commit: process.env.GITHUB_SHA ?? "local",
    baseline: "2026-08-01",
  },
  tasks: [evaluateModels],
});
```

Matrix literals determine the exact `matrix` type, `setup` determines the exact
shared setup type, and the exact JSON return type is retained on the Task.
Omitting `matrix` creates one Case with `{}`. Setup runs once per Task, Cases
within that Task run concurrently, and teardown runs once after successful
setup. Tasks run sequentially in their Workflow.

## Configure Vitest

Invoker uses Vitest's built-in reporters. The JSON reporter includes each
Case's data at `assertionResults[].meta.invoker`:

```ts
// vitest.config.ts
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

Run every Workflow or filter to one Task with ordinary Vitest commands:

```sh
pnpm vitest run
pnpm vitest run regressions/model/index.test.ts -t evaluate-models
```

The metadata envelope is stable and JSON-compatible:

```json
{
  "schema": 1,
  "matrix": { "model": "gpt-5", "dataset": "support" },
  "metadata": { "commit": "abc123" },
  "output": { "model": "gpt-5", "dataset": "support", "score": 0.92 }
}
```

`output` is present only after a successful, JSON-valid Task return. Vitest's
report remains authoritative for status, failures, timing, hierarchy, and
retries.

## GitHub Actions artifacts

Create the output directory before Vitest and upload the report even when the
run fails:

```yaml
- run: mkdir -p artifacts && pnpm vitest run
- if: always()
  uses: actions/upload-artifact@v4
  with:
    name: invoker-results
    path: artifacts/invoker-results.json
```

The artifact provides per-run retention and can be downloaded later for custom
queries or reports. Invoker does not upload, index, or persist results itself.

## v1 scope

Invoker does not provide a CLI, directory discovery, custom runner, custom
reporter, configuration helper, Task-level parallelism, matrix include/exclude,
or hosted result storage. Use Vitest configuration and your CI runner for those
concerns.
