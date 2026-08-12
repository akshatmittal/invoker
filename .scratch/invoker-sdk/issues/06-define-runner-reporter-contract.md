# Define Vitest reporter configuration

Type: grilling
Status: resolved
Blocked by: 01, 03, 05

## Question

Which built-in Vitest reporters are configured locally and under GitHub Actions, where does the JSON reporter write its artifact-ready file, and what minimal configuration is required to preserve `meta.invoker` without introducing an Invoker reporter?

## Answer

Invoker exports no reporter and no configuration helper. Projects use ordinary Vitest configuration with its built-in terminal, JSON, and GitHub Actions reporters:

```ts
export default defineConfig({
  test: {
    reporters: ["default", "json", ...(process.env.GITHUB_ACTIONS === "true" ? ["github-actions" as const] : [])],
    outputFile: {
      json: "./artifacts/invoker-results.json",
    },
  },
});
```

The terminal reporter supplies local progress and failures. Because configuring reporters disables Vitest's automatic reporter selection, the GitHub Actions reporter is added explicitly under `GITHUB_ACTIONS`; it owns failure annotations, test statistics, flaky-retry information, and the job summary. Invoker does not render Task Outputs into the job summary in v1.

Vitest's Jest-compatible JSON document is the canonical retained artifact. Its assertion results contain each Case's `meta.invoker` envelope; consumers use that envelope's `schema: 1` for Invoker-owned data while reading status, failures, timing, and hierarchy from Vitest's document. Invoker does not normalize or duplicate that report.

The JSON reporter writes one configured stable path, such as `artifacts/invoker-results.json`, for the entire Vitest invocation. CI artifact upload provides the durable run identity and retention. Invoker does not generate filenames, create per-Run files, or own upload configuration.

Invoker does not configure `filterMeta`; projects may filter unrelated metadata themselves. A custom Invoker reporter becomes justified only if a demonstrated requirement needs Task Outputs rendered directly in a job summary or needs a report shape Vitest cannot provide.
