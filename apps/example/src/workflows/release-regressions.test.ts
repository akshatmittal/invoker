import { defineWorkflow } from "@akshatmittal/invoker";

import { scoreModels } from "../tasks/score-models.js";

defineWorkflow({
  name: "release-regressions",
  metadata: {
    commit: process.env.GITHUB_SHA ?? "local",
    runner: process.env.GITHUB_ACTIONS === "true" ? "github-actions" : "local",
    release: "candidate",
  },
  tasks: [scoreModels],
});
