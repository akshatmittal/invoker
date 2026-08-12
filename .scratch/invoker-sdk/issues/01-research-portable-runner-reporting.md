# Research portable runner reporting mechanisms

Type: research
Status: resolved

## Question

Which output and reporting mechanisms can a Node.js process use without binding Invoker to one CI runner, and which GitHub Actions environment, workflow-command, annotation, and job-summary mechanisms can a GitHub reporter use without owning workflow configuration or artifact upload? Use primary sources, record relevant constraints, and recommend the smallest portable reporter boundary.

## Answer

Use a completed-Run callback as the entire reporter boundary: `type Reporter = (run: Readonly<Run>) => void | Promise<void>`. Persist canonical JSON before reporting; always emit a concise console view, and augment it only when `GITHUB_ACTIONS === "true"` with escaped stdout annotations (at most 10 errors and 10 warnings per step) and one UTF-8 job summary kept below 1 MiB. Invoker should not own `GITHUB_OUTPUT`, `GITHUB_ENV`, `GITHUB_STATE`, Checks API calls, artifact upload, or retention. Workflow configuration uploads the result file; later reports must download and parse retained JSON because GitHub's artifact API exposes archive metadata/downloads, not queries over file contents.

Context: branch `research/portable-runner-reporting`, commit `429a0751e7f67c79db41a8fb19940d427e8f9934`, note `docs/research/portable-runner-reporting.md`.
