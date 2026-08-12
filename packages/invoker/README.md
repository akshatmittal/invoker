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
// regressions/workflows/model-regressions.test.ts
import { defineWorkflow } from "@akshatmittal/invoker";
import { evaluateModels } from "../tasks/evaluate-models.js";

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
Axis names must be non-empty, enumerable strings that are not array indexes.
Omitting `matrix` creates one Case with `{}`. Setup runs once per Task, Cases
within that Task run concurrently, and teardown runs once after successful
setup. Tasks run sequentially in their Workflow.

## Configure Vitest

The JSON reporter includes each Case's data at
`assertionResults[].meta.invoker`:

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
pnpm vitest run regressions/workflows/model-regressions.test.ts -t evaluate-models
```

Define additional Workflows in separate `*.test.ts` files. Vitest discovers
them automatically; Invoker does not scan directories or require a central
index.

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

## Notify Slack

Invoker's optional Slack reporter posts one `Invoker Report` message per Vitest
run, containing one status-colored card per Workflow. Each card includes
aggregate results, Workflow metadata, and a table of Task counts and durations.
A shared footer contains total duration, a localized timestamp, and the
optional run link. Final failures are posted in one thread with one reply per
failed Task in each Workflow. Each reply uses a red card with the Task failure
count, Workflow metadata, matrix coordinates, and concise errors.

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

Create a Slack app with the `chat:write` bot scope, install it to the workspace,
and expose its bot token and target channel ID as `SLACK_BOT_TOKEN` and
`SLACK_CHANNEL_ID`. Invite the bot to private target channels. Slack delivery
failures produce a warning but do not change Vitest's exit status.

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

Invoker does not provide a CLI, directory discovery, custom runner, general
reporter framework, configuration helper, Task-level parallelism, matrix
include/exclude, or hosted result storage. Use Vitest configuration and your CI
runner for those concerns.
