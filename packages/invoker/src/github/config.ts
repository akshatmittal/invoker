import { Cron } from "croner";
import { createPrivateKey } from "node:crypto";

export const GITHUB_SCHEDULE_OWNER = "GitHub Schedule";

type WorkflowInput = string | number | boolean;

export type NormalizedSchedule = {
  readonly cron: string;
  readonly timezone: string;
  readonly repository: string;
  readonly workflow: string | number;
  readonly ref: string;
  readonly inputs?: Readonly<Record<string, WorkflowInput>>;
  readonly owner: string;
  readonly repo: string;
};

export type NormalizedDefinition = {
  readonly app: {
    readonly id: number;
    readonly privateKey: string;
  };
  readonly schedules: readonly NormalizedSchedule[];
};

const validationErrors = new WeakSet<Error>();

export function normalizeDefinition(value: unknown): NormalizedDefinition {
  assertPlainObject(value, "");
  assertOnlyKeys(value, ["app", "schedules"], "");

  assertPlainObject(value.app, ".app");
  assertOnlyKeys(value.app, ["id", "privateKey"], ".app");

  if (!Number.isSafeInteger(value.app.id) || (value.app.id as number) <= 0) {
    fail(".app.id", "expected a positive safe integer");
  }
  if (typeof value.app.privateKey !== "string" || value.app.privateKey.trim() === "") {
    fail(".app.privateKey", "expected a PEM private key");
  }
  try {
    createPrivateKey(value.app.privateKey);
  } catch {
    fail(".app.privateKey", "expected a PEM private key");
  }

  if (!Array.isArray(value.schedules) || value.schedules.length === 0) {
    fail(".schedules", "expected a non-empty schedule tuple");
  }

  const schedules = value.schedules.map((entry, index) => normalizeSchedule(entry, index));
  return Object.freeze({
    app: Object.freeze({ id: value.app.id as number, privateKey: value.app.privateKey }),
    schedules: Object.freeze(schedules),
  });
}

export function workflowKey(schedule: Pick<NormalizedSchedule, "repository" | "workflow">): string {
  return `${schedule.repository}\0${String(schedule.workflow)}`;
}

export function localError(error: unknown): TypeError {
  if (error instanceof TypeError && validationErrors.has(error)) {
    return error;
  }
  return new TypeError(`${GITHUB_SCHEDULE_OWNER}: configuration validation failed`);
}

function normalizeSchedule(value: unknown, index: number): NormalizedSchedule {
  const path = `.schedules[${index}]`;
  assertPlainObject(value, path);
  assertOnlyKeys(value, ["cron", "timezone", "repository", "workflow", "ref", "inputs"], path);

  if (typeof value.repository !== "string") {
    fail(`${path}.repository`, "expected owner/name");
  }
  const repositoryParts = value.repository.split("/");
  if (
    repositoryParts.length !== 2 ||
    repositoryParts.some((part) => part === "" || part.trim() !== part || /\s/.test(part))
  ) {
    fail(`${path}.repository`, "expected owner/name");
  }
  const [owner, repo] = repositoryParts as [string, string];

  if (
    !(
      (typeof value.workflow === "number" && Number.isSafeInteger(value.workflow) && value.workflow > 0) ||
      (typeof value.workflow === "string" &&
        value.workflow.trim() !== "" &&
        value.workflow.trim() === value.workflow &&
        !value.workflow.includes("/"))
    )
  ) {
    fail(`${path}.workflow`, "expected a non-empty filename or positive safe integer");
  }

  assertNonEmptyString(value.ref, `${path}.ref`);
  assertNonEmptyString(value.cron, `${path}.cron`);

  const timezone = value.timezone ?? "UTC";
  assertNonEmptyString(timezone, `${path}.timezone`);
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0);
  } catch {
    fail(`${path}.timezone`, "expected a valid IANA timezone");
  }

  let validationJob: Cron | undefined;
  try {
    validationJob = new Cron(value.cron, { mode: "5-part", paused: true, timezone });
    validationJob.nextRun();
  } catch {
    fail(`${path}.cron`, "expected a valid five-field cron expression");
  } finally {
    validationJob?.stop();
  }

  let inputs: Readonly<Record<string, WorkflowInput>> | undefined;
  if (value.inputs !== undefined) {
    const inputObject = value.inputs;
    assertPlainObject(inputObject, `${path}.inputs`);
    const entries = Reflect.ownKeys(inputObject).map((key) => {
      if (typeof key !== "string") {
        fail(`${path}.inputs`, "input keys must be strings");
      }
      const descriptor = Object.getOwnPropertyDescriptor(inputObject, key)!;
      if (!descriptor.enumerable) {
        fail(`${path}.inputs.${key}`, "input properties must be enumerable");
      }
      const input = inputObject[key];
      if (
        typeof input !== "string" &&
        typeof input !== "boolean" &&
        !(typeof input === "number" && Number.isFinite(input))
      ) {
        fail(`${path}.inputs.${key}`, "expected a string, boolean, or finite number");
      }
      return [key, input] as const;
    });
    if (entries.length > 25) {
      fail(`${path}.inputs`, "expected at most 25 inputs");
    }
    inputs = Object.freeze(Object.fromEntries(entries));
    if (JSON.stringify(inputs).length > 65_535) {
      fail(`${path}.inputs`, "expected at most 65,535 serialized characters");
    }
  }

  return Object.freeze({
    cron: value.cron,
    timezone,
    repository: value.repository,
    workflow: value.workflow as string | number,
    ref: value.ref,
    ...(inputs === undefined ? {} : { inputs }),
    owner,
    repo,
  });
}

function assertPlainObject(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "expected a plain object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(path, "expected a plain object");
  }
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key)) {
      fail(`${path}.${String(key)}`, "unknown property");
    }
  }
}

function assertNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(path, "expected a non-empty string");
  }
}

function fail(path: string, message: string): never {
  const error = new TypeError(`${GITHUB_SCHEDULE_OWNER}${path}: ${message}`);
  validationErrors.add(error);
  throw error;
}
