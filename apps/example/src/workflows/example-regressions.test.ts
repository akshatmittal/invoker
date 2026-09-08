import { defineWorkflow } from "@akshatmittal/invoker";

import { scoreModels } from "../tasks/score-models.js";

defineWorkflow({
  name: "example-regressions",
  metadata: {
    commit: process.env.GITHUB_SHA ?? "local",
    runner: process.env.GITHUB_ACTIONS === "true" ? "gha" : "local",
  },
  matrix: async () => ({ environment: ["staging", "production"] }),
  tasks: ({ matrix }) => [scoreModels({ environment: matrix.environment, baseline: "2026-09-01" })],
});
