import type { TestModule, TestSuite } from "vitest/node";

import { z } from "zod";

import type { JsonObject } from "../types.js";

const stringSchema = z.string();
const jsonObjectSchema = z.record(stringSchema, z.json());
const invokerMetaSchema = z.strictObject({
  schema: z.literal(1),
  matrix: jsonObjectSchema,
  metadata: jsonObjectSchema.optional(),
  output: z.json().optional(),
});
const testMetaSchema = z.object({ invoker: invokerMetaSchema.optional() });
const errorMessageSchema = z.object({ message: stringSchema });
const errorStackSchema = z.object({ stack: stringSchema });
const TABLE_ROW_LIMIT = 100;
const TABLE_CHARACTER_LIMIT = 10_000;
const SECTION_CHARACTER_LIMIT = 3_000;
const NAME_CHARACTER_LIMIT = 200;
const METADATA_CHARACTER_LIMIT = 1_800;

type Failure = {
  readonly task?: string;
  readonly caseName?: string;
  readonly matrix?: JsonObject;
  readonly messages: readonly string[];
};

type Retry = {
  readonly task: string;
  readonly caseName: string;
  readonly matrix: JsonObject;
  readonly count: number;
  readonly messages: readonly string[];
};

export type TaskReport = {
  readonly name: string;
  readonly total: number;
  readonly passed: number;
  readonly retried: number;
  readonly failed: number;
  readonly skipped: number;
  readonly incomplete: number;
  readonly duration: number;
};

export type WorkflowReport = {
  readonly name: string;
  readonly metadata?: JsonObject;
  readonly tasks: readonly TaskReport[];
  readonly failures: readonly Failure[];
  readonly retries: readonly Retry[];
  readonly startedAt?: number;
  readonly endedAt?: number;
};

type MutableTaskReport = {
  readonly name: string;
  readonly suite: TestSuite;
  total: number;
  passed: number;
  retried: number;
  failed: number;
  skipped: number;
  incomplete: number;
  startedAt?: number;
  endedAt?: number;
  readonly failures: Failure[];
  readonly retries: Retry[];
};

type MutableWorkflowReport = {
  readonly name: string;
  readonly module: TestModule;
  readonly suite: TestSuite;
  readonly metadata?: JsonObject;
  readonly tasks: Map<TestSuite, MutableTaskReport>;
};

type WorkflowStatus = {
  readonly emoji: string;
  readonly color: "danger" | "warning" | "good";
};

type RawCell = {
  readonly type: "raw_text";
  readonly text: string;
};

export function collectWorkflowReports(modules: ReadonlyArray<TestModule>): WorkflowReport[] {
  const workflows = new Map<TestSuite, MutableWorkflowReport>();

  for (const module of modules) {
    for (const testCase of module.children.allTests()) {
      const meta = testMetaSchema.safeParse(testCase.meta());
      const invoker = meta.success ? meta.data.invoker : undefined;
      const taskSuite = testCase.parent;
      const workflowSuite = taskSuite.type === "suite" ? taskSuite.parent : undefined;

      if (!invoker || taskSuite.type !== "suite" || workflowSuite?.type !== "suite") continue;

      let workflow = workflows.get(workflowSuite);
      if (!workflow) {
        workflow = {
          name: workflowSuite.name,
          module,
          suite: workflowSuite,
          metadata: invoker.metadata,
          tasks: new Map(),
        };
        workflows.set(workflowSuite, workflow);
      }

      let task = workflow.tasks.get(taskSuite);
      if (!task) {
        task = {
          name: taskSuite.name,
          suite: taskSuite,
          total: 0,
          passed: 0,
          retried: 0,
          failed: 0,
          skipped: 0,
          incomplete: 0,
          failures: [],
          retries: [],
        };
        workflow.tasks.set(taskSuite, task);
      }

      task.total += 1;
      const result = testCase.result();
      const diagnostic = testCase.diagnostic();
      task[result.state === "pending" ? "incomplete" : result.state] += 1;
      const retryCount = diagnostic?.retryCount ?? 0;
      if (retryCount > 0) {
        task.retried += 1;
        if (result.state === "passed") {
          task.retries.push({
            task: task.name,
            caseName: testCase.name,
            matrix: invoker.matrix,
            count: retryCount,
            messages: (result.errors ?? []).map(errorMessage),
          });
        }
      }

      if (diagnostic) {
        task.startedAt = Math.min(task.startedAt ?? diagnostic.startTime, diagnostic.startTime);
        task.endedAt = Math.max(task.endedAt ?? 0, diagnostic.startTime + diagnostic.duration);
      }

      if (result.state === "failed") {
        task.failures.push({
          task: task.name,
          caseName: testCase.name,
          matrix: invoker.matrix,
          messages: result.errors.map(errorMessage),
        });
      }
    }
  }

  return [...workflows.values()].map((workflow) => {
    const failures: Failure[] = [];
    const retries: Retry[] = [];
    addErrors(failures, workflow.suite.errors());
    addErrors(failures, workflow.module.errors());

    const collectedTasks = [...workflow.tasks.values()];
    for (const task of collectedTasks) {
      failures.push(...task.failures);
      retries.push(...task.retries);
      addErrors(failures, task.suite.errors(), task.name);
    }

    const { startedAt, endedAt } = timeSpan(collectedTasks);

    return {
      name: workflow.name,
      metadata: workflow.metadata,
      tasks: collectedTasks.map(
        ({ suite: _suite, failures: _failures, retries: _retries, startedAt, endedAt, ...task }) => ({
          ...task,
          duration: startedAt === undefined || endedAt === undefined ? 0 : endedAt - startedAt,
        }),
      ),
      failures: deduplicateFailures(failures),
      retries,
      startedAt,
      endedAt,
    };
  });
}

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
  const headline = `${status.emoji} *${escapeSlack(truncate(report.name, NAME_CHARACTER_LIMIT))} — ${totals.passed}/${totals.total} passed${page}*`;

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
  const groups = Map.groupBy(report.failures, (failure) => failure.task);

  return [...groups].flatMap(([task, failures]) => {
    const title = escapeSlack(truncate(task ?? "Workflow errors", NAME_CHARACTER_LIMIT));
    const workflow = `*Workflow:* ${escapeSlack(truncate(report.name, NAME_CHARACTER_LIMIT))}`;
    const metadata = metadataText(report.metadata);
    const context = metadata ? `${workflow}  •  ${metadata}` : workflow;
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

    return chunk(entries, 3_000).map((details, index, messages) => {
      const part = messages.length > 1 ? ` (${index + 1}/${messages.length})` : "";
      const summary = `${truncate(report.name, NAME_CHARACTER_LIMIT)} › ${truncate(task ?? "Workflow", NAME_CHARACTER_LIMIT)} — ${failures.length} failed${part}`;

      return {
        text: summary,
        attachments: [
          {
            color: "danger",
            blocks: [
              {
                type: "section" as const,
                text: {
                  type: "mrkdwn" as const,
                  text: `🔴 *${title} — ${failures.length} failed${part}*`,
                },
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
  });
}

export function retryMessages(report: WorkflowReport) {
  const groups = Map.groupBy(report.retries, (retry) => retry.task);

  return [...groups].flatMap(([task, retries]) => {
    const title = escapeSlack(truncate(task, NAME_CHARACTER_LIMIT));
    const workflow = `*Workflow:* ${escapeSlack(truncate(report.name, NAME_CHARACTER_LIMIT))}`;
    const metadata = metadataText(report.metadata);
    const context = metadata ? `${workflow}  •  ${metadata}` : workflow;
    const entries = retries.map((retry) => {
      const matrix = `\nMatrix: ${escapeSlack(JSON.stringify(retry.matrix))}`;
      const messages = retry.messages.map((message) => `\n• ${escapeSlack(message)}`).join("");
      return `*${escapeSlack(retry.caseName)}*\nRetries: ${retry.count}${matrix}${messages}`;
    });

    return chunk(entries, SECTION_CHARACTER_LIMIT).map((details, index, messages) => {
      const part = messages.length > 1 ? ` (${index + 1}/${messages.length})` : "";
      const summary = `${truncate(report.name, NAME_CHARACTER_LIMIT)} › ${truncate(task, NAME_CHARACTER_LIMIT)} — ${retries.length} retried${part}`;

      return {
        text: summary,
        attachments: [
          {
            color: "warning",
            blocks: [
              {
                type: "section" as const,
                text: {
                  type: "mrkdwn" as const,
                  text: `🟡 *${title} — ${retries.length} retried${part}*`,
                },
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

function addErrors(failures: Failure[], errors: readonly unknown[], task?: string): void {
  const messages = errors.map(errorMessage);
  if (messages.length > 0) failures.push({ task, messages });
}

function errorMessage(cause: unknown): string {
  const message = errorMessageSchema.safeParse(cause);
  if (message.success) return message.data.message;

  const stack = errorStackSchema.safeParse(cause);
  if (stack.success) return stack.data.stack.split("\n", 1)[0]!;

  return String(cause);
}

function deduplicateFailures(failures: Failure[]): Failure[] {
  const seen = new Set<string>();

  return failures.flatMap((failure) => {
    const messages = failure.messages.filter((message) => {
      const key = JSON.stringify([failure.task, failure.caseName, failure.matrix, message]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return messages.length > 0 ? [{ ...failure, messages }] : [];
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
    const value = entry.length > limit ? `${entry.slice(0, limit - 1)}…` : entry;
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

function timeSpan(values: readonly { readonly startedAt?: number; readonly endedAt?: number }[]) {
  let startedAt: number | undefined;
  let endedAt: number | undefined;
  for (const value of values) {
    if (value.startedAt !== undefined) startedAt = Math.min(startedAt ?? value.startedAt, value.startedAt);
    if (value.endedAt !== undefined) endedAt = Math.max(endedAt ?? value.endedAt, value.endedAt);
  }
  return { startedAt, endedAt };
}
