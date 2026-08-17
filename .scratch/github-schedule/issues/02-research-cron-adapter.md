# Research the cron scheduling adapter

Type: research
Status: resolved

## Question

Against primary package documentation and source, identify the smallest maintained Node 24 ESM cron adapter that supports five-field expressions, IANA timezones, concurrent callbacks, cancellation, and the agreed daylight-saving behavior: nonexistent wall-clock times are skipped and repeated wall-clock times run twice. Compare this with a minimal standard-library implementation, verify exact semantics and failure behavior, and recommend the narrowest dependency or implementation suitable for the single-process best-effort scheduler.

## Answer

The initial research found that no maintained turnkey scheduler met the original requirement to skip nonexistent wall-clock times and Dispatch twice during repeated wall-clock times. `cron-fast.isMatch()` plus a native minute timer could meet it, but only by making Invoker own scheduling logic.

The user chose the simpler conventional daylight-saving contract instead: nonexistent wall-clock times are skipped and a repeated specific wall-clock time runs once at its first occurrence. Use `croner@10.0.1`, a maintained, zero-dependency scheduler supporting Node 18+, ESM, five-field mode, IANA timezones, callback failure handling, and job cancellation. One Croner job owns each GitHub Schedule; the module owns no timer or cron-matching loop.

The original comparison remains at branch `research/cron-adapter`, commit `bcfe653e4cb19ea707bd38f2579a64851ac6401d`, note `docs/research/cron-adapter.md`. Croner maintenance was reverified on 2026-08-16: stable 10.0.1 was released in February 2026 and 10.0.2 development releases continued through June 2026.
