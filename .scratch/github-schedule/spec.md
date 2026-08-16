# GitHub Schedule Specification

## Summary

`@akshatmittal/invoker/github` is an independent, long-running Node.js scheduler for creating GitHub Actions `workflow_dispatch` events from code-defined GitHub Schedules. A caller passes one GitHub App and a non-empty static schedule list to `defineGitHubSchedule()`. The function validates every target before scheduling, Dispatches due entries through repository-scoped installation tokens, logs each operation through evlog, and shuts down gracefully on process signals.

The module is part of the existing `@akshatmittal/invoker` package but has no runtime or type dependency on the Vitest SDK entry. It is a single-process, best-effort scheduler intended to run as exactly one replica. It has no database, control plane, HTTP server, CLI, persistence, catch-up, distributed coordination, automatic Dispatch retries, or GitHub Actions Run monitoring.

## Domain language

- **GitHub Actions Workflow**: a GitHub-hosted automation definition that may expose the `workflow_dispatch` event.
- **GitHub Schedule**: a code-defined rule that identifies one GitHub Actions Workflow, ref, static input map, and cron occurrence.
- **Dispatch**: one request to GitHub to create a Run of a GitHub Actions Workflow through `workflow_dispatch`.
- **Run**: one GitHub-created execution resulting from a successful Dispatch. The scheduler reports its identity and URL but does not monitor it.

[`CONTEXT.md`](../../CONTEXT.md) is the canonical glossary. “Workflow” without the “GitHub Actions” qualifier retains the existing Invoker SDK meaning.

## Public module and interface

The package adds one ESM subpath:

```ts
import { defineGitHubSchedule } from "@akshatmittal/invoker/github";
```

Its declaration is:

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

export function defineGitHubSchedule(
  definition: GitHubScheduleDefinition,
): Promise<void>;
```

Only `defineGitHubSchedule` is exported. Its supporting aliases remain declaration-private. There is no public class, generic, handle, logger, client, callback, installation ID, adapter, signal, or lifecycle API.

The returned promise remains pending while the scheduler runs. It rejects only when local validation or GitHub startup validation fails. It resolves after a graceful `SIGINT` or `SIGTERM` shutdown. A post-start Dispatch failure is logged, consumed, and never rejects the long-running promise.

Only one invocation may be active per loaded module instance. A concurrent invocation rejects. A new invocation is allowed after the previous invocation resolves or rejects.

## Configuration contract

The complete definition is a trust boundary. Before any network request, validate it synchronously and copy it into an immutable internal snapshot so later caller mutation has no effect.

Validation rejects unknown keys and requires ordinary, non-array objects at every object boundary. A local error is a path-specific `TypeError`, for example:

```text
GitHub Schedule.schedules[0].cron: expected a valid five-field cron expression
```

Rules:

- `app.id` is a positive safe integer.
- `app.privateKey` is a non-empty PEM private key string.
- `schedules` is non-empty.
- `repository` is exactly `owner/name`, with two non-empty path segments.
- `workflow` is either a non-empty filename string or a positive safe integer GitHub Actions Workflow ID.
- `ref` is a non-empty string and is always explicit.
- `cron` is a valid five-field cron expression accepted by Croner's five-field mode.
- `timezone`, when present, is a valid IANA timezone; omission normalizes to `UTC`.
- `inputs`, when present, is an ordinary object with at most 25 own string properties.
- Every input is a string, boolean, or finite number.
- The serialized input payload is no larger than GitHub's 65,535-character limit.

Each array entry is an independent GitHub Schedule. Identical entries intentionally produce separate Dispatches; the module does not name, merge, or deduplicate them. Inputs remain static for the process lifetime. GitHub validates the configured ref, `workflow_dispatch` declaration, and input schema when a Dispatch becomes due.

## GitHub App contract

The caller supplies one GitHub App ID and private key explicitly. The module never reads environment variables. Credentials remain in memory for the process lifetime and are discarded when the scheduler becomes unreachable; rotating the private key requires restarting the process.

The GitHub App requires only repository `Actions: read and write`. It needs no Contents, Workflows, organization, user, or webhook permission and no client secret, OAuth flow, user authorization, webhook URL, or inbound event handling. Installing the App on selected repositories is preferred. A wider installation is acceptable because every installation token is narrowed to one configured repository and `actions: write`.

Support GitHub.com only. All REST requests send the fixed GitHub API version `2026-03-10`.

Use one `@octokit/auth-app` auth instance with `@octokit/request`. The private GitHub adapter performs only these operations:

1. Resolve the installation for a configured repository with an App JWT.
2. Fetch and validate a configured GitHub Actions Workflow with a repository-scoped installation token.
3. Dispatch the validated Workflow with a current repository-scoped installation token.

Before every Dispatch, ask auth-app for installation authentication narrowed to the target repository with `actions: write`. Its in-memory 59-minute cache refreshes GitHub's one-hour installation tokens. Do not introduce another token cache, persist tokens, or revoke them explicitly during shutdown.

Treat every GitHub response as untrusted. Validate only fields consumed by the implementation:

- a positive installation ID;
- a non-suspended installation with Actions write;
- a positive GitHub Actions Workflow ID whose state is `active`;
- valid installation-token metadata;
- a successful Dispatch response containing a positive Run ID, API URL, and web URL.

With Actions-only permission, startup cannot prove that the ref exists, inspect the YAML `workflow_dispatch` declaration, or validate the declared input schema. Those failures remain due-time GitHub errors.

## Startup and scheduling

Startup is all-or-nothing and follows this order:

1. Validate and snapshot the complete local definition.
2. Claim the module's active-scheduler slot.
3. Install `SIGINT` and `SIGTERM` handlers.
4. Authenticate the GitHub App.
5. Resolve each unique repository installation sequentially.
6. Mint a repository-scoped token and verify every unique repository/Workflow target sequentially.
7. Create one Croner job per GitHub Schedule only after every target passes.
8. Emit one successful `github_schedule.startup` event.

No timer starts when any local or GitHub startup validation fails. Release the active-scheduler slot, remove signal handlers, emit one sanitized failed startup event, and reject.

A signal during startup aborts pending GitHub requests, drains them, releases the slot, emits shutdown, and resolves normally rather than reporting a startup failure.

Use `croner@10.0.1`. One Croner job owns each GitHub Schedule. Configure five-field mode, the normalized timezone, and callback failure capture. Croner owns timers, next-run calculation, timezone conversion, and cancellation; the module contains no timer or cron-matching loop.

Scheduling semantics:

- Wait for the next complete scheduled occurrence; do not evaluate the partial startup minute.
- Skip nonexistent daylight-saving wall-clock times.
- Run a repeated specific daylight-saving wall-clock time once, at its first occurrence.
- Do not recover occurrences missed during process downtime or suspension.
- Start every due Dispatch immediately.
- Allow separate jobs and overlapping occurrences to run concurrently, with no ordering, queue, mutex, or overlap prevention.

A due-time authentication, permission, rate-limit, transport, malformed-response, or GitHub server failure affects only that Dispatch. Sanitize and log it once through the job's failure path, do not retry it, and keep every job active. A Dispatch has no idempotency key, so retrying an uncertain response could create a duplicate Run.

## Shutdown

The first `SIGINT` or `SIGTERM`:

1. Marks the scheduler as stopping so no new Dispatch can start.
2. Stops every Croner job.
3. Removes the module's signal handlers.
4. Captures the number of in-flight Dispatches.
5. Awaits every in-flight promise with settled semantics.
6. Releases the active-scheduler slot.
7. Emits one `github_schedule.shutdown` event.
8. Resolves `defineGitHubSchedule()`.

Removing the handlers lets a second signal use Node's default immediate termination. Graceful shutdown has no internal timeout. It does not revoke installation tokens or monitor Runs already created by GitHub.

## Observability and error safety

Use scheduler-owned `evlog.createLogger()` operations. Never call `evlog.initLogger()` or change process-global logging configuration.

Emit exactly three wide-event families, once per operation:

- `github_schedule.startup`: schedule, repository, and unique GitHub Actions Workflow counts, plus success or a sanitized failure.
- `github_schedule.dispatch`: configured repository, Workflow identifier, ref, cron, normalized timezone, scheduled time, plus the validated Run ID and web URL or a sanitized failure.
- `github_schedule.shutdown`: received signal and the number of in-flight Dispatches drained.

Do not emit timer-tick, no-match, token-refresh, or per-target-validation events.

Never retain, log, throw, or attach as an error `cause` any private key, App JWT, installation token, authorization header, GitHub Actions Workflow input, raw request or response body, GitHub message, or raw Octokit error. A sanitized GitHub failure contains only:

- operation;
- configured repository;
- configured Workflow identifier;
- HTTP status, when present;
- GitHub request ID, when present.

A `404` is described only as “not found or inaccessible.” Successful Dispatch logs may additionally contain the validated Run ID and web URL.

## Package contract

Keep the existing npm package and build two independent ESM entries:

```ts
// tsdown.config.ts
export default defineConfig({
  entry: ["src/index.ts", "src/github.ts"],
  format: ["esm"],
  dts: true,
});
```

Add the subpath export beside the existing root export:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.mts",
      "import": "./dist/index.mjs"
    },
    "./github": {
      "types": "./dist/github.d.mts",
      "import": "./dist/github.mjs"
    }
  }
}
```

The `src/github.ts` source graph imports nothing from `src/index.ts`, the root SDK implementation, or Vitest. Mark the existing Vitest peer optional with `peerDependenciesMeta`, allowing GitHub-only consumers to install without Vitest while preserving the documented peer for root SDK consumers.

Add these direct package dependencies with package-local semver ranges, not workspace catalog entries:

- `@octokit/auth-app` for GitHub App and installation authentication;
- `@octokit/request` for the narrow REST client;
- `croner` for scheduling;
- `evlog` for operation-scoped structured logging.

Import every declared runtime dependency directly. `@t3-oss/env-core`, Zod, Docker, and the host application are consumer concerns and do not belong to the package dependency graph. Because both exports share one npm package, root-only users also download the GitHub dependencies; splitting the install graph requires a separate npm package and is outside this specification.

The implementation change adds a minor Changeset.

## Minimal host application

The README documents a plain ESM host with no TypeScript build:

```bash
npm install @akshatmittal/invoker @t3-oss/env-core zod
```

```js
// schedule.mjs
import { createEnv } from "@t3-oss/env-core";
import { defineGitHubSchedule } from "@akshatmittal/invoker/github";
import { z } from "zod";

const env = createEnv({
  server: {
    GITHUB_APP_ID: z.coerce.number().int().positive(),
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
      inputs: { dataset: "weekly" },
    },
  ],
});
```

The host supplies the real multiline PEM value at runtime. The module accepts credentials only through `app`; it neither loads `.env` files nor initializes evlog globally.

## Docker deployment example

The README documents, but the repository does not ship or publish, this minimal Dockerfile:

```dockerfile
FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY schedule.mjs ./

USER node
CMD ["node", "schedule.mjs"]
```

The build context excludes `.env`, PEM, and private-key files. Deploy exactly one replica and inject `GITHUB_APP_ID` and the actual multiline `GITHUB_APP_PRIVATE_KEY` through the runtime platform's secret mechanism. Use process liveness, evlog output, and the platform restart policy. Do not add an HTTP server, health endpoint, readiness protocol, committed deployment, Docker build pipeline, or published image.

## Implementation sequence

1. Add the independent `src/github.ts` entry, package export, optional Vitest peer metadata, and four direct runtime dependencies.
2. Implement local validation, normalization, and snapshotting at the public boundary.
3. Implement the private three-operation GitHub adapter and sanitized error translation.
4. Implement all-or-nothing startup, Croner job creation, concurrent in-flight tracking, and signal-driven shutdown.
5. Add the three evlog operation families without global logger initialization.
6. Document GitHub App creation, Actions-write permission, selected-repository installation, the host file, one-replica invariant, failure behavior, and Docker deployment in the README.
7. Add a minor Changeset.

Do not create a public adapter interface or dependency injection seam for the single GitHub implementation. Keep validation and cron matching in-process, and keep timers, logging, signals, Octokit types, and token lifecycle private.

## Verification and completion criteria

The implementation is complete when:

- `@akshatmittal/invoker/github` imports from the packed package and its declaration exposes only `defineGitHubSchedule`;
- importing the GitHub subpath does not load Vitest or the root SDK entry;
- a GitHub-only consumer can install without Vitest;
- local typecheck and package build succeed;
- packed-file inspection includes the two intended ESM entries and declarations;
- the README covers every setup and deployment obligation above;
- no tests are added or run, per repository instructions.

## Out of scope

- Runtime registration, configuration reload, an API, UI, database, or control plane.
- Persistent missed-run recovery, leader election, distributed locking, multi-replica operation, or cross-process duplicate prevention.
- Automatic Dispatch retries, Run monitoring, result or artifact collection, or scheduler-owned GitHub Actions concurrency.
- GitHub Enterprise Server or configurable GitHub API URLs.
- A CLI, webhook server, hosted scheduler, workspace example app, committed deployment, or published container image.
- GitHub events other than `workflow_dispatch`.
