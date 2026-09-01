# @akshatmittal/invoker

A strictly typed TypeScript DSL for matrix-driven regression workflows. Invoker
expands Tasks into Vitest tests, runs each Task's Cases concurrently, and stores
validated JSON Output in Vitest metadata for reporters and later analysis.

## Install

```sh
pnpm add -D @akshatmittal/invoker vitest
```

Invoker supports Node 24.18.1 or newer within Node 24 and Vitest 4.1.10 or newer within Vitest 4.

## Schedule GitHub Actions

`@akshatmittal/invoker/github` runs code-defined GitHub Actions schedules from
a small, long-running Node process. It is independent from the Vitest SDK, so a
scheduler-only installation does not need Vitest.

Create a GitHub App with repository **Actions: read and write**, disable its
webhook, install it on the selected repositories, and generate a private key.
No other repository, organization, user, OAuth, or webhook permissions are
needed.

Install the scheduler with t3-env and Zod in a plain ESM application:

```sh
npm install @akshatmittal/invoker @t3-oss/env-core zod
```

```js
// schedule.mjs
import { createEnv } from "@t3-oss/env-core";
import { defineGitHubSchedule } from "@akshatmittal/invoker/github";
import { z } from "zod";

const env = createEnv({
  server: {
    GITHUB_APP_ID: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  },
  runtimeEnv: process.env,
});

await defineGitHubSchedule({
  app: {
    id: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_APP_PRIVATE_KEY,
  },
  schedules: [
    {
      cron: "0 9 * * 1",
      timezone: "UTC",
      repository: "acme/regressions",
      workflow: "invoker.yml",
      ref: "main",
      inputs: { dataset: "weekly", publish: true },
    },
  ],
});
```

Schedules use five-field cron expressions and default to UTC when `timezone`
is omitted. Configuration is fixed at startup. Every repository installation
and active workflow is validated before timers begin; GitHub validates the ref,
`workflow_dispatch` declaration, and input schema when a Dispatch is due.

Run exactly one replica. Dispatches may overlap, are not persisted or retried,
and failures do not stop later occurrences. The process emits events through
evlog's shared logger, so the host's filtering, sampling, redaction, and drain
configuration applies. The module does not initialize or configure evlog.
`SIGINT` and `SIGTERM` stop new Dispatches, await in-flight requests, and
resolve the long-running promise.

### Docker

Keep `package.json`, `package-lock.json`, and `schedule.mjs` in a deployment
directory and build this image:

```dockerfile
FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY schedule.mjs ./

USER node
CMD ["node", "schedule.mjs"]
```

Exclude `.env`, PEM, and private-key files from the build context. Inject
`GITHUB_APP_ID` and the real multiline `GITHUB_APP_PRIVATE_KEY` through the
runtime platform's secret mechanism; never bake them into the image. Use the
platform's process-liveness check and restart policy with one replica. The
scheduler intentionally has no HTTP health endpoint.

## Define a Workflow

```ts
// regressions/model/tasks/evaluate-models.ts
import { defineTask } from "@akshatmittal/invoker";

export const evaluateModels = defineTask({
  name: "evaluate-models",
  matrix: async () => ({
    model: ["gpt-5", "gpt-5-mini"],
    dataset: ["support", "sales"],
  }),
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

The Matrix function runs during collection and its returned literal determines the exact
`matrix` type. `setup` determines the exact
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

Invoker's optional Slack reporter posts one `Invoker Report` parent message per
Vitest run. It places additional Workflow cards in the message thread so every
Task table remains within Slack's row and character limits. Each card includes
aggregate results, Workflow metadata, and a table of Task counts and durations.
A shared footer contains the elapsed span from the first Case start to the final
Case completion, a localized timestamp, and the optional run link. Final
failures are posted in the same thread with one reply per failed Task in each
Workflow. Unhandled run errors are reported once. Delivery failures are
isolated to the affected reply. Ambiguous transport failures are not retried;
an explicit Slack rate-limit rejection is reattempted only after its required
delay.

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
