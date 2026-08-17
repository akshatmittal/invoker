## Destination

Produce an implementation-ready specification for an independent `@akshatmittal/invoker/github` module whose code-defined GitHub Schedules use a GitHub App to Dispatch GitHub Actions Workflows from a minimal long-running Node.js process deployable anywhere, including Docker.

## Notes

- Use the language in [`CONTEXT.md`](../../CONTEXT.md) and invoke `/domain-modeling` whenever it changes.
- This map plans the GitHub Schedule module; it does not implement it.
- Export one long-running `defineGitHubSchedule()` function from `@akshatmittal/invoker/github`; do not import or expose the Vitest SDK implementation.
- Callers explicitly pass one GitHub App's ID and private key. A tiny host app may validate environment variables with `@t3-oss/env-core` and Zod.
- A process may target every configured repository where that GitHub App is installed; resolve installation IDs from repositories rather than requiring them in configuration.
- GitHub Schedules are fixed at startup and use five-field cron expressions with an optional IANA timezone defaulting to UTC.
- Use Croner's conventional daylight-saving behavior: skip nonexistent wall-clock times and run a repeated specific wall-clock time once at its first occurrence.
- The runtime is a single-process, best-effort scheduler: one replica, no persistence, catch-up, distributed locks, or cross-process duplicate prevention.
- Dispatch due GitHub Schedules concurrently. A failed Dispatch is logged and not retried; later occurrences continue.
- `defineGitHubSchedule()` validates all configuration and GitHub targets before starting timers, handles `SIGINT` and `SIGTERM`, awaits in-flight Dispatches, and then resolves.
- Use evlog's shared logger without initializing or changing its process-global configuration; host filtering, sampling, redaction, and drains apply. Never log credentials, access tokens, or GitHub Actions Workflow inputs.
- Dispatch only: log GitHub's returned Run URL, but do not monitor Runs or own their concurrency, retries, results, or artifacts.
- Support GitHub.com only.
- Deliver a library and documented Docker example, not a CLI, hosted app, or published image.

## Decisions so far

- [Research GitHub App workflow dispatch integration](issues/01-research-github-app-dispatch.md) — use narrow Octokit auth/request packages, repository-scoped installation tokens with Actions write, startup workflow checks, automatic token refresh, and no uncertain Dispatch retries.
- [Research the cron scheduling adapter](issues/02-research-cron-adapter.md) — use the maintained, zero-dependency Croner scheduler and accept its conventional run-once daylight-saving overlap behavior instead of owning a custom timer.
- [Define the public TypeScript interface](issues/03-define-public-typescript-interface.md) — export one long-running `defineGitHubSchedule()` function with explicit App credentials, a non-empty static schedule tuple, a Zod-parsed boundary, and no exposed lifecycle or adapter seams.
- [Define the authentication and trust contract](issues/04-define-authentication-and-trust-contract.md) — use an authentication-only App, repository-scoped Actions-write tokens, all-or-nothing startup checks, Octokit's generated response types, in-memory credential lifetimes, and strictly sanitized diagnostics.
- [Define runtime and observability semantics](issues/05-define-runtime-and-observability-semantics.md) — let Croner own timing, run due Dispatches concurrently, isolate operational failures, enforce one active scheduler, drain on process signals, and emit only startup/Dispatch/shutdown wide events.
- [Define the package and deployment contract](issues/06-define-package-and-deployment-contract.md) — ship an independent `./github` entry in the existing package, make Vitest optional for GitHub-only installs, keep runtime dependencies internal, and document a one-file Node/Docker host without publishing an app or image.
- [Assemble the implementation-ready GitHub Schedule specification](issues/07-assemble-implementation-ready-specification.md) — consolidate the resolved interface, trust, runtime, packaging, host, and deployment contracts in [`spec.md`](spec.md), with no remaining in-scope decisions.

## Not yet specified

None.

## Out of scope

- Runtime schedule registration, configuration reload, an API, UI, database, or control plane.
- Persistent missed-run recovery, leader election, distributed locking, or multi-replica operation.
- Automatic Dispatch retries, GitHub Actions Run monitoring, result collection, or scheduler-owned execution concurrency.
- GitHub Enterprise Server or configurable GitHub API URLs.
- A CLI, webhook server, hosted scheduler, or published container image.
- GitHub events other than `workflow_dispatch`.
