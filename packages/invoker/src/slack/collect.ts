import type { TestSuite, TestModule } from "vitest/node";

import { z } from "zod";

import type { JsonObject } from "../types.js";

const jsonObjectSchema = z.record(z.string(), z.json());
const workflowInfoSchema = z.object({ name: z.string(), metadata: jsonObjectSchema.optional() });
const workflowMetaSchema = z.object({ invokerWorkflow: workflowInfoSchema });
const collectionErrorSchema = z.object({ invokerCollectionError: workflowInfoSchema });
const testMetaSchema = z.object({
  invoker: z.strictObject({
    schema: z.literal(2),
    matrix: z.strictObject({ workflow: jsonObjectSchema, task: jsonObjectSchema }),
    params: jsonObjectSchema,
    metadata: jsonObjectSchema.optional(),
    output: z.json().optional(),
  }),
});
const errorMessageSchema = z.object({ message: z.string() });
const errorStackSchema = z.object({ stack: z.string() });

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

type Skip = {
  readonly task: string;
  readonly caseName: string;
  readonly matrix: JsonObject;
  readonly reason: string;
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
  readonly skips: readonly Skip[];
  readonly startedAt?: number;
  readonly endedAt?: number;
};

export function collectWorkflowReports(modules: ReadonlyArray<TestModule>): WorkflowReport[] {
  const workflows: WorkflowReport[] = [];
  for (const module of modules) {
    for (const suite of module.children.allSuites()) {
      const meta = workflowMetaSchema.safeParse(suite.meta());
      if (!meta.success) continue;
      const tasks = [...suite.children.suites()].flatMap((coordinate) =>
        [...coordinate.children.suites()].map((task) => collectTask(task, coordinate.name)),
      );
      const failures: Failure[] = [];
      addErrors(failures, suite.errors());
      for (const coordinate of suite.children.suites()) {
        addErrors(failures, coordinate.errors(), coordinate.name);
      }
      workflows.push({
        ...meta.data.invokerWorkflow,
        tasks: tasks.map((task) => task.report),
        failures: deduplicateFailures([...failures, ...tasks.flatMap((task) => task.failures)]),
        retries: tasks.flatMap((task) => task.retries),
        skips: tasks.flatMap((task) => task.skips),
        ...timeSpan(tasks),
      });
    }
    const collection = collectionErrorSchema.safeParse(module.meta());
    if (collection.success) {
      const failures: Failure[] = [];
      addErrors(failures, module.errors());
      workflows.push({
        ...collection.data.invokerCollectionError,
        tasks: [],
        failures,
        retries: [],
        skips: [],
      });
    }
  }
  return workflows;
}

function collectTask(suite: TestSuite, coordinateName: string) {
  const name = `${coordinateName} · ${suite.name}`;
  const report = { name, total: 0, passed: 0, retried: 0, failed: 0, skipped: 0, incomplete: 0, duration: 0 };
  const failures: Failure[] = [];
  const retries: Retry[] = [];
  const skips: Skip[] = [];
  let startedAt: number | undefined;
  let endedAt: number | undefined;

  for (const testCase of suite.children.tests()) {
    const meta = testMetaSchema.safeParse(testCase.meta());
    if (!meta.success) continue;
    const { invoker } = meta.data;
    const result = testCase.result();
    const diagnostic = testCase.diagnostic();
    report.total += 1;
    report[result.state === "pending" ? "incomplete" : result.state] += 1;
    const retryCount = diagnostic?.retryCount ?? 0;
    if (retryCount > 0) {
      report.retried += 1;
      if (result.state === "passed") {
        retries.push({
          task: name,
          caseName: testCase.name,
          matrix: invoker.matrix,
          count: retryCount,
          messages: (result.errors ?? []).map(errorMessage),
        });
      }
    }
    if (diagnostic) {
      startedAt = Math.min(startedAt ?? diagnostic.startTime, diagnostic.startTime);
      endedAt = Math.max(endedAt ?? 0, diagnostic.startTime + diagnostic.duration);
    }
    if (result.state === "failed") {
      failures.push({
        task: name,
        caseName: testCase.name,
        matrix: invoker.matrix,
        messages: result.errors.map(errorMessage),
      });
    } else if (result.state === "skipped") {
      skips.push({
        task: name,
        caseName: testCase.name,
        matrix: invoker.matrix,
        reason: result.note || "No reason provided",
      });
    }
  }
  addErrors(failures, suite.errors(), name);
  report.duration = startedAt === undefined || endedAt === undefined ? 0 : endedAt - startedAt;
  return { report, failures, retries, skips, startedAt, endedAt };
}

function addErrors(failures: Failure[], errors: readonly unknown[], task?: string): void {
  const messages = errors.map(errorMessage);
  if (messages.length > 0) failures.push({ task, messages });
}

export function errorMessage(cause: unknown): string {
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

export function timeSpan(values: readonly { readonly startedAt?: number; readonly endedAt?: number }[]) {
  let startedAt: number | undefined;
  let endedAt: number | undefined;
  for (const value of values) {
    if (value.startedAt !== undefined) startedAt = Math.min(startedAt ?? value.startedAt, value.startedAt);
    if (value.endedAt !== undefined) endedAt = Math.max(endedAt ?? value.endedAt, value.endedAt);
  }
  return { startedAt, endedAt };
}
