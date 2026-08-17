import type { ChatPostMessageArguments } from "@slack/web-api";
import type { Reporter } from "vitest/reporters";

import { WebClient } from "@slack/web-api";

import { collectWorkflowReports, failureMessages, parentMessage } from "./report.js";

export type SlackReporterOptions = {
  readonly token: string;
  readonly channel: string;
  readonly runUrl?: string;
};

export function slackReporter(options: SlackReporterOptions): Reporter {
  const client = new WebClient(options.token, {
    retryConfig: { retries: 2, minTimeout: 500, maxTimeout: 2_000, randomize: true },
    timeout: 10_000,
  });

  return {
    async onTestRunEnd(modules, unhandledErrors) {
      const reports = collectWorkflowReports(modules, unhandledErrors);
      if (reports.length === 0) return;

      try {
        const parentArguments = {
          channel: options.channel,
          ...parentMessage(reports, options.runUrl),
          unfurl_links: false,
        } satisfies ChatPostMessageArguments;
        const parent = await client.chat.postMessage(parentArguments);
        const replies = reports.flatMap(failureMessages);

        if (replies.length > 0 && !parent.ts)
          throw new Error("Slack did not return a timestamp for the Invoker report");

        for (const reply of replies) {
          await client.chat.postMessage({
            channel: options.channel,
            ...reply,
            thread_ts: parent.ts,
            unfurl_links: false,
          });
        }
      } catch (error) {
        console.warn("[invoker] Could not post Slack report:", error);
      }
    },
  };
}
