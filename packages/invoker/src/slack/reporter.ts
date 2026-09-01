import type { ChatPostMessageArguments } from "@slack/web-api";
import type { Reporter } from "vitest/reporters";

import { WebAPIRateLimitedError, WebClient } from "@slack/web-api";
import { setTimeout } from "node:timers/promises";

import {
  collectWorkflowReports,
  failureMessages,
  retryMessages,
  skipMessages,
  summaryMessage,
  unhandledErrorMessages,
} from "./report.js";

export type SlackReporterOptions = {
  readonly token: string;
  readonly channel: string;
  readonly runUrl?: string;
};

export function slackReporter(options: SlackReporterOptions): Reporter {
  const client = new WebClient(options.token, {
    rejectRateLimitedCalls: true,
    retryConfig: { retries: 0 },
    timeout: 10_000,
  });
  const postMessage = async (arguments_: ChatPostMessageArguments) => {
    try {
      return await client.chat.postMessage(arguments_);
    } catch (error) {
      if (!(error instanceof WebAPIRateLimitedError)) throw error;
      await setTimeout(error.retryAfter * 1_000);
      return client.chat.postMessage(arguments_);
    }
  };

  return {
    async onTestRunEnd(modules, unhandledErrors) {
      const reports = collectWorkflowReports(modules);
      if (reports.length === 0) return;

      const parentMessage = summaryMessage(reports, options.runUrl);

      let parentTimestamp: string | undefined;
      try {
        const parentArguments = {
          channel: options.channel,
          ...parentMessage,
          mrkdwn: false,
          unfurl_links: false,
        } satisfies ChatPostMessageArguments;
        const parent = await postMessage(parentArguments);
        parentTimestamp = parent.ts;
      } catch {
        console.warn("[invoker] Could not post the Slack report.");
        return;
      }

      const replies = [
        ...reports.flatMap(failureMessages),
        ...reports.flatMap(retryMessages),
        ...reports.flatMap(skipMessages),
        ...unhandledErrorMessages(unhandledErrors),
      ];
      if (replies.length > 0 && !parentTimestamp) {
        console.warn("[invoker] Slack did not return a timestamp for the report thread.");
        return;
      }

      let failedMessages = 0;
      for (const reply of replies) {
        try {
          await postMessage({
            channel: options.channel,
            ...reply,
            thread_ts: parentTimestamp,
            mrkdwn: false,
            unfurl_links: false,
          });
        } catch {
          failedMessages += 1;
        }
      }
      if (failedMessages > 0) {
        console.warn(
          `[invoker] Could not post ${failedMessages} Slack report message${failedMessages === 1 ? "" : "s"}.`,
        );
      }
    },
  };
}
