# Research Vitest as Invoker's foundation

Type: research
Status: resolved

## Question

Can the planned Invoker SDK be implemented by using Vitest's supported public APIs or by extending Vitest, while preserving Invoker's required authoring model, serial Tasks with bounded concurrent Cases, once-per-Task shared setup, JSON Task outputs, complete non-fail-fast Run results, immutable per-Run JSON files, and runner-neutral reporting? Identify what Vitest provides directly, what requires adapters, what requires unsupported internals or semantic compromises, and compare that path with a minimal purpose-built runner. Use current official documentation and first-party source code, distinguish stable public APIs from internal ones, and recommend use, extension, or rejection with explicit tradeoffs.

## Answer

Do not use or extend Vitest as Invoker's foundation. Its supported APIs can approximate Tasks as suites, concurrent Cases as tests, setup as `beforeAll`, non-fail-fast execution with `bail: 0`, and output transport through task metadata. Invoker would still own matrix expansion, typed setup/output plumbing, per-Task concurrency, its Run schema, immutable persistence, and reporter translation; its direct `runWorkflow` entrypoint also does not fit Vitest's test-module collection model. Closing those gaps with custom scheduling or in-process execution relies on Vitest's experimental Runner Tasks or custom-pool APIs. A small purpose-built Node runner is the lower-risk and smaller implementation.

Context: branch `research/vitest-foundation`, commit `031e441834c69b41812594069c35c3a4d02b6d61`, note `docs/research/vitest-foundation.md`.
