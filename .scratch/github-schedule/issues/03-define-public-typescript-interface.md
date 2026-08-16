# Define the public TypeScript interface

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

What is the exact `defineGitHubSchedule()` input and return contract for GitHub App credentials, GitHub Schedules, repositories, GitHub Actions Workflows, refs, cron expressions, timezones, and static workflow inputs; which types are public; and which invalid states should TypeScript prevent versus runtime validation reject?

## Answer

Export only `defineGitHubSchedule` from `@akshatmittal/invoker/github`. Keep its supporting aliases declaration-private, matching `defineWorkflow`; expose no generic, class, handle, logger, signal, callback, client, installation ID, or adapter.

```ts
type WorkflowInput = string | number | boolean;

type GitHubSchedule = {
  readonly cron: string;
  readonly timezone?: string;
  readonly repository: string;
  readonly workflow: string | number;
  readonly ref: string;
  readonly inputs?: Readonly<Record<string, WorkflowInput>>;
};

type GitHubScheduleDefinition = {
  readonly app: {
    readonly id: number;
    readonly privateKey: string;
  };
  readonly schedules: readonly [GitHubSchedule, ...GitHubSchedule[]];
};

export function defineGitHubSchedule(definition: GitHubScheduleDefinition): Promise<void>;
```

The App ID is a positive safe integer; callers using `t3-env` coerce their environment string before calling. `repository` remains a plain string and is runtime-validated as exactly `owner/name`. `workflow` accepts either a non-empty filename or positive numeric GitHub Actions Workflow ID. `ref` is always explicit. `timezone` is the only default and becomes `UTC` when omitted.

The non-empty readonly tuple prevents an empty literal at compile time. Each entry is an independent GitHub Schedule: identical entries intentionally produce separate Dispatches, with no name, deduplication, or merging. Inputs are static string, finite number, or boolean values. Startup validation enforces a plain input object, no more than 25 properties, and GitHub's payload-size limit; GitHub owns validation against the target GitHub Actions Workflow's declared inputs.

Before any network request, runtime validation requires plain objects, rejects unknown keys, validates every local value and five-field cron/IANA timezone, and snapshots the complete definition so later mutation has no effect. Invalid local configuration rejects with a path-specific `TypeError`. Authentication and target-validation failures reject with a sanitized `Error`; no raw Octokit error or custom public error hierarchy crosses the interface.

The returned `Promise<void>` remains pending while scheduling. It rejects only for local or GitHub startup failure. On `SIGINT` or `SIGTERM`, the module stops new Dispatches, awaits in-flight requests, removes its handlers, and resolves. A post-start Dispatch failure is sanitized, logged through a scheduler-scoped evlog operation, consumed without retry, and never rejects the long-running promise.

The external seam is intentionally deep: the one function hides validation, GitHub App authentication, installation resolution, token refresh, GitHub Actions Workflow checks, cron scheduling, concurrent Dispatch, logging, and graceful shutdown. GitHub remains a true external dependency behind a private internal adapter; Croner, evlog, and signals remain hidden in-process implementation details.
