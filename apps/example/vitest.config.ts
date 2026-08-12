import { slackReporter } from "@akshatmittal/invoker/slack";
import { defineConfig } from "vitest/config";

const runUrl =
  process.env.GITHUB_ACTIONS === "true"
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : undefined;

const slack =
  process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID
    ? [
        slackReporter({
          token: process.env.SLACK_BOT_TOKEN,
          channel: process.env.SLACK_CHANNEL_ID,
          runUrl,
        }),
      ]
    : [];

export default defineConfig({
  test: {
    maxConcurrency: 2,
    reporters: ["json", "tree", ...slack, ...(process.env.GITHUB_ACTIONS === "true" ? ["github-actions"] : [])],
    outputFile: {
      json: "./artifacts/invoker-results.json",
    },
  },
});
