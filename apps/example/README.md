# Invoker example

This private workspace package demonstrates two Invoker regression Workflows
in separate Vitest-discovered files. They reuse one Task with required typed
parameters, a Task Matrix, shared setup, concurrent Cases, teardown, and JSON
Output. The example Workflow expands staging and production into eight Cases;
the release Workflow binds production directly and produces four Cases.

Schema 2 results retain Workflow coordinates, Task coordinates, and all bound
parameters. Setup and teardown run separately for each coordinate/Task pair.

```text
src/
  tasks/
    score-models.ts
  workflows/
    example-regressions.test.ts
    release-regressions.test.ts
```

Each `*.test.ts` file defines one Workflow. Vitest discovers both files
automatically; Invoker does not need a central index or scan the directory.

Run it from the repository root:

```sh
pnpm --filter @workspace/invoker-example test
```

Vitest writes the queryable report to
`apps/example/artifacts/invoker-results.json`. Run only the example Task with:

```sh
pnpm --filter @workspace/invoker-example test -- -t score-models
```

Set `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` to also post one combined Slack
report with a card per Workflow and threaded failure, retry, skip, and unhandled
error details.

Set `INVOKER_EXAMPLE_FAILURE=true` to make the candidate Cases fail and exercise
the grouped Slack replies.
