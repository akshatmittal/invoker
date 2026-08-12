import { defineWorkflow } from "@akshatmittal/invoker";

import { scoreModels } from "../tasks/score-models.js";

defineWorkflow({
  name: "example-regressions",
  metadata: {
    commit: process.env.GITHUB_SHA ?? "local",
    runner: process.env.GITHUB_ACTIONS === "true" ? "gha" : "local",
  },
  tasks: [scoreModels],
});
