import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxConcurrency: 2,
    reporters: ["default", "json", ...(process.env.GITHUB_ACTIONS === "true" ? ["github-actions" as const] : [])],
    outputFile: {
      json: "./artifacts/invoker-results.json",
    },
  },
});
