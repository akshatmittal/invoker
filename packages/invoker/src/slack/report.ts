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

type Failure = {
  readonly task?: string;
  readonly caseName?: string;
  readonly matrix?: JsonObject;
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

export function collectWorkflowReports(
  modules: ReadonlyArray<TestModule>,
  unhandledErrors: readonly unknown[],
): WorkflowReport[] {
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
        };
        workflow.tasks.set(taskSuite, task);
      }

      task.total += 1;
      const result = testCase.result();
      const diagnostic = testCase.diagnostic();
      task[result.state === "pending" ? "incomplete" : result.state] += 1;
      if ((diagnostic?.retryCount ?? 0) > 0) task.retried += 1;

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
    addErrors(failures, workflow.suite.errors());
    addErrors(failures, workflow.module.errors());
    addErrors(failures, unhandledErrors);

    for (const task of workflow.tasks.values()) {
      failures.push(...task.failures);
      addErrors(failures, task.suite.errors(), task.name);
    }

    return {
      name: workflow.name,
      metadata: workflow.metadata,
      tasks: [...workflow.tasks.values()].map(
        ({ suite: _suite, failures: _failures, startedAt, endedAt, ...task }) => ({
          ...task,
          duration: startedAt === undefined || endedAt === undefined ? 0 : endedAt - startedAt,
        }),
      ),
      failures: deduplicateFailures(failures),
    };
  });
}

export function parentMessage(reports: readonly WorkflowReport[], runUrl?: string) {
  const timestamp = Math.floor(Date.now() / 1_000);
  const duration = reports.reduce(
    (total, report) => total + report.tasks.reduce((workflow, task) => workflow + task.duration, 0),
    0,
  );
  const footer = [
    `Total: ${formatDuration(duration)}`,
    `<!date^${timestamp}^{date_short_pretty} at {time}|${new Date(timestamp * 1_000).toISOString()}>`,
    ...(runUrl ? [`<${escapeSlackControl(runUrl)}|View run>`] : []),
  ].join(" • ");

  return {
    text: "Invoker Report",
    attachments: [
      ...reports.map(workflowAttachment),
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

function workflowAttachment(report: WorkflowReport) {
  const totals = taskTotals(report.tasks);
  const status = workflowStatus(report);
  const metadata = metadataText(report.metadata);
  const headline = `${status.emoji} *${escapeSlack(report.name)} — ${totals.passed}/${totals.total} passed*`;

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
        rows: [
          ["Task", "Passed", "Retries", "Failed", "Skipped", "Time"].map(rawCell),
          ...report.tasks.map((task) =>
            [
              task.name,
              String(task.passed),
              String(task.retried),
              String(task.failed),
              String(task.skipped),
              formatDuration(task.duration),
            ].map(rawCell),
          ),
        ],
      },
    ],
  };
}

export function failureMessages(report: WorkflowReport) {
  const groups = Map.groupBy(report.failures, (failure) => failure.task);

  return [...groups].flatMap(([task, failures]) => {
    const title = escapeSlack(task ?? "Workflow errors");
    const workflow = `*Workflow:* ${escapeSlack(report.name)}`;
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
      const summary = `${report.name} › ${task ?? "Workflow"} — ${failures.length} failed${part}`;

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

  return text.length > 2_900 ? `${text.slice(0, 2_899)}…` : text;
}

function rawCell(text: string): RawCell {
  return { type: "raw_text", text };
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
