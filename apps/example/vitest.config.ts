import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxConcurrency: 2,
    reporters: ["json", "tree", ...(process.env.GITHUB_ACTIONS === "true" ? ["github-actions"] : [])],
    outputFile: {
      json: "./artifacts/invoker-results.json",
    },
  },
});
