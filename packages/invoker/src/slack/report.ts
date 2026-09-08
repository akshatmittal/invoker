import { z } from "zod";

import type { JsonObject } from "../types.js";
import type { TaskReport, WorkflowReport } from "./collect.js";

import { errorMessage } from "../errors.js";
import { timeSpan } from "./collect.js";

const stringSchema = z.string();
const TABLE_ROW_LIMIT = 100;
const TABLE_CHARACTER_LIMIT = 10_000;
const SECTION_CHARACTER_LIMIT = 3_000;
const NAME_CHARACTER_LIMIT = 200;
const METADATA_CHARACTER_LIMIT = 1_800;

type WorkflowStatus = {
  readonly emoji: string;
  readonly color: "danger" | "warning" | "good";
};

type RawCell = {
  readonly type: "raw_text";
  readonly text: string;
};

export function summaryMessage(reports: readonly WorkflowReport[], runUrl?: string) {
  const timestamp = Math.floor(Date.now() / 1_000);
  const { startedAt, endedAt } = timeSpan(reports);
  const duration = startedAt === undefined || endedAt === undefined ? 0 : endedAt - startedAt;
  const footer = [
    `Elapsed: ${formatDuration(duration)}`,
    `<!date^${timestamp}^{date_short_pretty} at {time}|${new Date(timestamp * 1_000).toISOString()}>`,
    ...(runUrl ? [`<${escapeSlackControl(runUrl)}|View run>`] : []),
  ].join(" • ");
  const attachments = reports.flatMap(workflowAttachments);

  return {
    text: "Invoker Report",
    attachments: [
      ...attachments,
      {
        blocks: [
          {
            type: "context" as const,
            elements: [{ type: "mrkdwn" as const, text: footer }],
          },
        ],
      },
    ],
  };
}

function workflowAttachments(report: WorkflowReport) {
  const tables = taskTables(report.tasks);

  return tables.map((rows, index) => workflowAttachment(report, rows, index, tables.length));
}

function workflowAttachment(
  report: WorkflowReport,
  rows: readonly (readonly RawCell[])[],
  index: number,
  pages: number,
) {
  const totals = taskTotals(report.tasks);
  const status = workflowStatus(report);
  const metadata = metadataText(report.metadata);
  const page = pages > 1 ? ` (${index + 1}/${pages})` : "";
  const result = report.tasks.length === 0 ? "Collection failed" : `${totals.passed}/${totals.total} passed`;
  const headline = `${status.emoji} *${escapeSlack(truncate(report.name, NAME_CHARACTER_LIMIT))} — ${result}${page}*`;

  return {
    color: status.color,
    blocks: [
      {
        type: "section" as const,
        text: { type: "mrkdwn" as const, text: headline },
      },
      ...(metadata
        ? [
            {
              type: "context" as const,
              elements: [{ type: "mrkdwn" as const, text: metadata }],
            },
          ]
        : []),
      {
        type: "table" as const,
        column_settings: [
          { is_wrapped: true },
          { align: "right" as const },
          { align: "right" as const },
          { align: "right" as const },
          { align: "right" as const },
          { align: "right" as const },
        ],
        rows,
      },
    ],
  };
}

export function failureMessages(report: WorkflowReport) {
  return [...Map.groupBy(report.failures, (failure) => failure.task)].flatMap(([task, failures]) => {
    const entries = failures.map((failure) => {
      const scope = failure.caseName
        ? `*${escapeSlack(failure.caseName)}*`
        : task
          ? "*Task error*"
          : "*Workflow error*";
      const matrix = failure.matrix ? `\nMatrix: ${escapeSlack(JSON.stringify(failure.matrix))}` : "";
      const messages = failure.messages.map((message) => `\n• ${escapeSlack(message)}`).join("");
      return `${scope}${matrix}${messages}`;
    });
    return detailMessages(report, task, "failed", entries);
  });
}

export function retryMessages(report: WorkflowReport) {
  return [...Map.groupBy(report.retries, (retry) => retry.task)].flatMap(([task, retries]) => {
    const entries = retries.map((retry) => {
      const matrix = `\nMatrix: ${escapeSlack(JSON.stringify(retry.matrix))}`;
      const messages = retry.messages.map((message) => `\n• ${escapeSlack(message)}`).join("");
      return `*${escapeSlack(retry.caseName)}*\nRetries: ${retry.count}${matrix}${messages}`;
    });
    return detailMessages(report, task, "retried", entries);
  });
}

export function skipMessages(report: WorkflowReport) {
  return [...Map.groupBy(report.skips, (skip) => skip.task)].flatMap(([task, skips]) => {
    const entries = skips.map((skip) => {
      const matrix = `\nMatrix: ${escapeSlack(JSON.stringify(skip.matrix))}`;
      return `*${escapeSlack(skip.caseName)}*${matrix}\nReason: ${escapeSlack(skip.reason)}`;
    });
    return detailMessages(report, task, "skipped", entries);
  });
}

function detailMessages(
  report: WorkflowReport,
  task: string | undefined,
  outcome: "failed" | "retried" | "skipped",
  entries: readonly string[],
) {
  const title = escapeSlack(truncate(task ?? "Workflow errors", NAME_CHARACTER_LIMIT));
  const workflow = `*Workflow:* ${escapeSlack(truncate(report.name, NAME_CHARACTER_LIMIT))}`;
  const metadata = metadataText(report.metadata);
  const context = metadata ? `${workflow}  •  ${metadata}` : workflow;
  const emoji = outcome === "failed" ? "🔴" : "🟡";

  return chunk(entries, SECTION_CHARACTER_LIMIT).map((details, index, messages) => {
    const part = messages.length > 1 ? ` (${index + 1}/${messages.length})` : "";
    const count = `${entries.length} ${outcome}${part}`;
    return {
      text: `${truncate(report.name, NAME_CHARACTER_LIMIT)} › ${truncate(task ?? "Workflow", NAME_CHARACTER_LIMIT)} — ${count}`,
      attachments: [
        {
          color: outcome === "failed" ? "danger" : "warning",
          blocks: [
            {
              type: "section" as const,
              text: { type: "mrkdwn" as const, text: `${emoji} *${title} — ${count}*` },
            },
            {
              type: "context" as const,
              elements: [{ type: "mrkdwn" as const, text: context }],
            },
            {
              type: "section" as const,
              text: { type: "mrkdwn" as const, text: details },
            },
          ],
        },
      ],
    };
  });
}

export function unhandledErrorMessages(errors: readonly unknown[]) {
  const messages = [...new Set(errors.map(errorMessage))];
  const entries = messages.map((message) => `• ${escapeSlack(message)}`);

  return chunk(entries, SECTION_CHARACTER_LIMIT).map((details, index, chunks) => {
    const part = chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : "";
    return {
      text: `Invoker run — ${messages.length} unhandled error${messages.length === 1 ? "" : "s"}${part}`,
      attachments: [
        {
          color: "danger",
          blocks: [
            {
              type: "section" as const,
              text: { type: "mrkdwn" as const, text: `🔴 *Run errors${part}*` },
            },
            {
              type: "section" as const,
              text: { type: "mrkdwn" as const, text: details },
            },
          ],
        },
      ],
    };
  });
}

function escapeSlack(value: string): string {
  return escapeSlackControl(value).replaceAll("*", "∗").replaceAll("_", "＿").replaceAll("~", "∼").replaceAll("`", "ˋ");
}

function escapeSlackControl(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function taskTotals(tasks: readonly TaskReport[]): Pick<TaskReport, "total" | "passed"> {
  return tasks.reduce((totals, task) => ({ total: totals.total + task.total, passed: totals.passed + task.passed }), {
    total: 0,
    passed: 0,
  });
}

function workflowStatus(report: WorkflowReport): WorkflowStatus {
  if (report.failures.length > 0 || report.tasks.some((task) => task.failed > 0)) {
    return { emoji: "🔴", color: "danger" };
  }

  if (report.tasks.some((task) => task.retried > 0 || task.skipped > 0 || task.incomplete > 0)) {
    return { emoji: "🟡", color: "warning" };
  }

  return { emoji: "🟢", color: "good" };
}

function metadataText(metadata: JsonObject | undefined): string | undefined {
  if (!metadata || Object.keys(metadata).length === 0) return undefined;

  const text = Object.entries(metadata)
    .map(([key, value]) => {
      const string = stringSchema.safeParse(value);
      return `*${escapeSlack(key)}:* ${escapeSlack(string.success ? string.data : JSON.stringify(value))}`;
    })
    .join("  •  ");

  return truncate(text, METADATA_CHARACTER_LIMIT);
}

function rawCell(text: string): RawCell {
  return { type: "raw_text", text };
}

function taskTables(tasks: readonly TaskReport[]): readonly (readonly (readonly RawCell[])[])[] {
  const header = ["Task", "Passed", "Retries", "Failed", "Skipped", "Time"].map(rawCell);
  const headerCharacters = rowCharacters(header);
  const tables: RawCell[][][] = [];
  let rows: RawCell[][] = [header];
  let characters = headerCharacters;

  for (const task of tasks) {
    const values = [
      String(task.passed),
      String(task.retried),
      String(task.failed),
      String(task.skipped),
      formatDuration(task.duration),
    ];
    const taskNameLimit =
      TABLE_CHARACTER_LIMIT - headerCharacters - values.reduce((total, value) => total + value.length, 0);
    const row = [truncate(task.name, taskNameLimit), ...values].map(rawCell);
    const rowLength = rowCharacters(row);

    if (rows.length === TABLE_ROW_LIMIT || characters + rowLength > TABLE_CHARACTER_LIMIT) {
      tables.push(rows);
      rows = [header];
      characters = headerCharacters;
    }
    rows.push(row);
    characters += rowLength;
  }

  tables.push(rows);
  return tables;
}

function rowCharacters(row: readonly RawCell[]): number {
  return row.reduce((total, cell) => total + cell.text.length, 0);
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`;
  return `${(milliseconds / 1_000).toFixed(1)}s`;
}

function chunk(entries: readonly string[], limit: number): string[] {
  const chunks: string[] = [];

  for (const entry of entries) {
    const value = truncate(entry, limit);
    const previous = chunks.at(-1);

    if (previous && previous.length + value.length + 2 <= limit) {
      chunks[chunks.length - 1] = `${previous}\n\n${value}`;
    } else {
      chunks.push(value);
    }
  }

  return chunks;
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}
