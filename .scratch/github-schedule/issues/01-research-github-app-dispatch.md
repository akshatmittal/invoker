# Research GitHub App workflow dispatch integration

Type: research
Status: resolved

## Question

Using only GitHub's current documentation and first-party SDK source, determine the smallest secure Node 24 ESM implementation for authenticating one GitHub App, resolving the installation for each configured repository, validating access to each target GitHub Actions Workflow, and creating `workflow_dispatch` events. Compare the narrow Octokit authentication/request packages with Node `fetch` and `node:crypto`; record permissions, token lifetime and refresh behavior, request and response types, input limits, API-version requirements, error modes, and recommend the minimum adapter and dependencies.

## Answer

Use only `@octokit/auth-app` and `@octokit/request`. Create one App auth/request pair pinned to GitHub API `2026-03-10`; resolve each repository installation with an App JWT; mint installation tokens narrowed to that repository and `actions: write`; verify that each configured GitHub Actions Workflow exists and is active; then ask auth-app for a current token on every due Dispatch so its 59-minute cache refreshes GitHub's one-hour tokens.

The startup check cannot prove that a ref exists or inspect `workflow_dispatch` and its input schema without requesting Contents access and parsing YAML, so leave those validations to the Dispatch endpoint. It currently accepts at most 25 inputs and 65,535 input characters. Pass `return_run_details: true` so a successful Dispatch returns the Run ID, API URL, and web URL instead of `204 No Content`. Never retry an uncertain Dispatch because the endpoint has no idempotency key. Sanitize request errors rather than passing Octokit errors to evlog, because request headers and bodies may contain tokens or inputs.

Context: branch `research/github-app-dispatch`, commit `53a51fe01e139d97e1d89dd4143075c165d767d5`, note `docs/research/github-app-dispatch.md`.
