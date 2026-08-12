import type { TaskMeta, TestContext } from "vitest";

import { afterAll, beforeAll, describe, test } from "vitest";

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type JsonObject = {
  readonly [key: string]: JsonValue;
};

export type Matrix = {
  readonly [axis: string]: readonly JsonValue[];
};

export type CaseCoordinates<M extends Matrix> = {
  readonly [K in keyof M]: M[K][number];
};

export interface InvokerMeta<
  Coordinates extends JsonObject,
  Output extends JsonValue,
  Metadata extends JsonObject = JsonObject,
> {
  schema: 1;
  matrix: Coordinates;
  metadata?: Metadata;
  output?: Output;
}

export interface TaskContext<Coordinates, Setup> {
  readonly matrix: Coordinates;
  readonly setup: Setup;
  readonly vitest: TestContext;
}

type Awaitable<Value> = Value | PromiseLike<Value>;

type SetupContext<M extends Matrix> = {
  readonly cases: readonly CaseCoordinates<M>[];
};

type TeardownContext<M extends Matrix, Setup> = SetupContext<M> & {
  readonly setup: Setup;
};

const taskDefinitionBrand: unique symbol = Symbol("invoker.task");

export interface TaskDefinition<
  Name extends string = string,
  M extends Matrix = Matrix,
  Setup = unknown,
  Output extends JsonValue = JsonValue,
> {
  readonly name: Name;
  readonly matrix: M;
  readonly [taskDefinitionBrand]: {
    readonly setup: Setup;
    readonly output: Output;
  };
  readonly setup?: (context: SetupContext<M>) => Awaitable<Setup>;
  readonly run: (context: TaskContext<CaseCoordinates<M>, Setup>) => Awaitable<Output>;
  readonly teardown?: (context: TeardownContext<M, Setup>) => Awaitable<void>;
}

type TaskWithSetup<Name extends string, M extends Matrix, Setup, Output extends JsonValue> = {
  readonly name: Name;
  readonly matrix?: M;
  readonly setup: (context: SetupContext<M>) => Awaitable<Setup>;
  readonly run: (context: TaskContext<CaseCoordinates<M>, Setup>) => Awaitable<Output>;
  readonly teardown?: (context: TeardownContext<M, Setup>) => Awaitable<void>;
};

type TaskWithoutSetup<Name extends string, M extends Matrix, Output extends JsonValue> = {
  readonly name: Name;
  readonly matrix?: M;
  readonly setup?: never;
  readonly run: (context: TaskContext<CaseCoordinates<M>, undefined>) => Awaitable<Output>;
  readonly teardown?: never;
};

export function defineTask<
  const Name extends string,
  const M extends Matrix = Record<never, never>,
  Setup = unknown,
  const Output extends JsonValue = JsonValue,
>(definition: TaskWithSetup<Name, M, Setup, Output>): TaskDefinition<Name, M, Setup, Output>;

export function defineTask<
  const Name extends string,
  const M extends Matrix = Record<never, never>,
  const Output extends JsonValue = JsonValue,
>(definition: TaskWithoutSetup<Name, M, Output>): TaskDefinition<Name, M, undefined, Output>;

export function defineTask(definition: unknown): unknown {
  return {
    ...(definition as RuntimeTask),
    matrix: (definition as RuntimeTask).matrix ?? {},
    [taskDefinitionBrand]: true,
  };
}

type AnyTaskDefinition = {
  readonly name: string;
  readonly matrix: Matrix;
  readonly [taskDefinitionBrand]: {
    readonly setup: unknown;
    readonly output: JsonValue;
  };
};

type WorkflowDefinition<
  Tasks extends readonly [AnyTaskDefinition, ...AnyTaskDefinition[]],
  Metadata extends JsonObject,
> = {
  readonly name: string;
  readonly metadata?: Metadata;
  readonly tasks: Tasks;
};

type RuntimeTask = {
  readonly name: string;
  readonly matrix?: Matrix;
  readonly setup?: (context: SetupContext<Matrix>) => Awaitable<unknown>;
  readonly run: (context: TaskContext<JsonObject, unknown>) => Awaitable<JsonValue>;
  readonly teardown?: (context: TeardownContext<Matrix, unknown>) => Awaitable<void>;
  readonly [taskDefinitionBrand]?: true;
};

type RuntimeInvokerMeta = InvokerMeta<JsonObject, JsonValue, JsonObject>;

type PreparedTask = {
  readonly task: RuntimeTask;
  readonly cases: readonly JsonObject[];
  readonly names: readonly string[];
  readonly metadata: readonly RuntimeInvokerMeta[];
};

export function defineWorkflow<
  const Tasks extends readonly [AnyTaskDefinition, ...AnyTaskDefinition[]],
  const Metadata extends JsonObject = JsonObject,
>(definition: WorkflowDefinition<Tasks, Metadata>): void {
  const workflow = prepareWorkflow(definition);

  describe.sequential(workflow.name, () => {
    for (const prepared of workflow.tasks) {
      describe.sequential(prepared.task.name, () => {
        let setup: unknown;
        let setupSucceeded = false;

        if (prepared.task.setup) {
          beforeAll(async () => {
            setup = await prepared.task.setup!({ cases: prepared.cases });
            setupSucceeded = true;
          });
        }

        for (const [index, matrix] of prepared.cases.entries()) {
          const name = prepared.names[index]!;
          const invoker = prepared.metadata[index]!;

          test.concurrent(name, { meta: { invoker } as TaskMeta }, async (vitest) => {
            const meta = vitest.task.meta as TaskMeta & {
              invoker: RuntimeInvokerMeta;
            };

            delete meta.invoker.output;
            const output = await prepared.task.run({
              matrix,
              setup,
              vitest,
            });
            assertJson(output, `Task ${JSON.stringify(prepared.task.name)}`, ".output");
            meta.invoker.output = output;
          });
        }

        if (prepared.task.teardown) {
          afterAll(async () => {
            if (setupSucceeded) {
              await prepared.task.teardown!({
                cases: prepared.cases,
                setup,
              });
            }
          });
        }
      });
    }
  });
}

function prepareWorkflow(definition: unknown): {
  readonly name: string;
  readonly tasks: readonly PreparedTask[];
} {
  assertPlainObject(definition, "Workflow", "");
  assertOnlyKeys(definition, ["name", "metadata", "tasks"], "Workflow");
  assertName(definition.name, "Workflow", ".name");

  const metadata = definition.metadata;
  if (metadata !== undefined) {
    assertJson(metadata, `Workflow ${JSON.stringify(definition.name)}`, ".metadata");
    assertPlainObject(metadata, `Workflow ${JSON.stringify(definition.name)}`, ".metadata");
  }

  if (!Array.isArray(definition.tasks) || definition.tasks.length === 0) {
    fail("Workflow", ".tasks", "expected a non-empty Task tuple");
  }

  const names = new Set<string>();
  const tasks = definition.tasks.map((value, index) => {
    const owner = `Workflow ${JSON.stringify(definition.name)} Task ${index + 1}`;
    assertPlainObject(value, owner, "");

    const task = value as RuntimeTask;
    if (task[taskDefinitionBrand] !== true) {
      fail(owner, "", "expected a Task created by defineTask");
    }

    assertOnlyKeys(task, ["name", "matrix", "setup", "run", "teardown"], owner);
    assertName(task.name, owner, ".name");

    if (names.has(task.name)) {
      fail(owner, ".name", `duplicate Task name ${JSON.stringify(task.name)}`);
    }
    names.add(task.name);

    if (typeof task.run !== "function") {
      fail(owner, ".run", "expected a function");
    }
    if (task.setup !== undefined && typeof task.setup !== "function") {
      fail(owner, ".setup", "expected a function");
    }
    if (task.teardown !== undefined && typeof task.teardown !== "function") {
      fail(owner, ".teardown", "expected a function");
    }
    if (task.teardown && !task.setup) {
      fail(owner, ".teardown", "requires setup");
    }

    const cases = expandMatrix(task.matrix, `Task ${JSON.stringify(task.name)}`);
    return {
      task,
      cases,
      names: cases.map(caseName),
      metadata: cases.map((matrix) =>
        metadata === undefined ? { schema: 1, matrix } : { schema: 1, matrix, metadata },
      ),
    } satisfies PreparedTask;
  });

  return { name: definition.name, tasks };
}

function expandMatrix(matrix: unknown, owner: string): readonly JsonObject[] {
  if (matrix === undefined) {
    return [{}];
  }

  assertPlainObject(matrix, owner, ".matrix");
  let cases: JsonObject[] = [{}];

  for (const [axis, values] of Object.entries(matrix)) {
    if (axis.trim() === "") {
      fail(owner, ".matrix", "axis names must not be empty");
    }
    if (!Array.isArray(values)) {
      fail(owner, `.matrix.${axis}`, "expected an array");
    }
    if (values.length === 0) {
      fail(owner, `.matrix.${axis}`, "expected at least one value");
    }

    values.forEach((value, index) => {
      assertJson(value, owner, `.matrix.${axis}[${index}]`);
    });

    cases = cases.flatMap((coordinates) => values.map((value) => ({ ...coordinates, [axis]: value as JsonValue })));
  }

  const coordinates = new Set<string>();
  for (const value of cases) {
    const key = canonicalJson(value);
    if (coordinates.has(key)) {
      fail(owner, ".matrix", `duplicate coordinate ${JSON.stringify(value)}`);
    }
    coordinates.add(key);
  }

  return cases;
}

function caseName(matrix: JsonObject, index: number): string {
  const axes = Object.entries(matrix)
    .map(([axis, value]) => `${axis}=${JSON.stringify(value)}`)
    .join(", ");
  return axes === "" ? `[${index + 1}]` : `[${index + 1}] ${axes}`;
}

function assertJson(
  value: unknown,
  owner: string,
  path: string,
  ancestors = new Set<object>(),
): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail(owner, path, "expected a finite number");
    }
    return;
  }
  if (typeof value !== "object") {
    fail(owner, path, `expected JSON, received ${typeof value}`);
  }
  if (ancestors.has(value)) {
    fail(owner, path, "cyclic values are not JSON");
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        fail(owner, `${path}[${index}]`, "sparse arrays are not JSON");
      }
      assertJson(value[index], owner, `${path}[${index}]`, ancestors);
    }
  } else {
    assertPlainObject(value, owner, path);
    if (Object.getOwnPropertySymbols(value).length > 0) {
      fail(owner, path, "JSON objects cannot have symbol keys");
    }
    for (const [key, child] of Object.entries(value)) {
      assertJson(child, owner, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

function assertPlainObject(value: unknown, owner: string, path: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(owner, path, "expected a plain object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(owner, path, "expected a plain object");
  }
}

function assertName(value: unknown, owner: string, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(owner, path, "expected a non-empty string");
  }
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], owner: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      fail(owner, `.${key}`, "unknown property");
    }
  }
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const object = value as JsonObject;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key] as JsonValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fail(owner: string, path: string, message: string): never {
  throw new TypeError(`${owner}${path}: ${message}`);
}
