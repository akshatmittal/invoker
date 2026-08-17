# Define runtime and observability semantics

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

What are the exact startup ordering, cron and timezone semantics, concurrent Dispatch behavior, post-start failure policy, process-signal handling, shutdown ordering, and scheduler-scoped evlog wide-event fields for `defineGitHubSchedule()`?

## Answer

Only one `defineGitHubSchedule()` invocation may be active per loaded module instance. A concurrent call rejects; another call is allowed after the active one resolves or rejects.

Startup validates and snapshots the complete definition, claims the active-scheduler slot, installs `SIGINT` and `SIGTERM` handlers, and verifies each unique repository and GitHub Actions Workflow sequentially. The first repository lookup authenticates the App. No schedule begins until every target passes. A signal during startup aborts pending GitHub requests, drains them, and resolves normally rather than reporting startup failure.

After successful validation, create one Croner job per GitHub Schedule with five-field mode, the normalized timezone, and failure capture. Croner owns timers, next-run calculation, timezone conversion, and cancellation. It waits for the next scheduled occurrence rather than evaluating the partial startup minute. Nonexistent daylight-saving wall-clock times are skipped; a repeated specific wall-clock time runs once at its first occurrence. Missed occurrences during downtime or suspension are not recovered.

Each due callback immediately starts its Dispatch and returns its tracked promise. Separate jobs due together and later occurrences run concurrently, with no ordering, queue, protection, or overlap prevention. A post-start authentication, permission, rate-limit, transport, validation, or GitHub server failure affects only that Dispatch: sanitize and log it once through Croner's failure path, do not retry, and keep later occurrences active even when the failure appears permanent.

The first `SIGINT` or `SIGTERM` marks the scheduler as stopping, stops every Croner job, removes the module's signal handlers, and awaits all in-flight Dispatch promises with settled semantics. Removing the handlers lets a second signal invoke Node's default immediate termination. Graceful shutdown has no internal timeout. After the in-flight set drains, release the active-scheduler slot, emit shutdown, and resolve `Promise<void>`.

Use scheduler-owned `evlog.createLogger()` operations without calling process-global `initLogger()`. Emit exactly three wide-event families, once per operation:

- `github_schedule.startup`: schedule, repository, and GitHub Actions Workflow counts plus success or sanitized failure.
- `github_schedule.dispatch`: configured repository, Workflow identifier, ref, cron, normalized timezone, scheduled time, and either validated Run ID/web URL or sanitized failure.
- `github_schedule.shutdown`: received signal and the number of in-flight Dispatches drained.

Do not emit timer-tick, no-match, authentication-refresh, or per-target-validation events. Never attach credentials, tokens, authorization headers, GitHub Actions Workflow inputs, raw GitHub responses, GitHub messages, or raw Octokit errors to an evlog operation.
