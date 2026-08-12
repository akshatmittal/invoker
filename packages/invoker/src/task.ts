import type {
  Awaitable,
  CaseCoordinates,
  JsonObject,
  JsonValue,
  Matrix,
  SetupContext,
  TaskContext,
  TeardownContext,
} from "./types.js";

export const taskDefinitionBrand: unique symbol = Symbol("invoker.task");

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

export type AnyTaskDefinition = {
  readonly name: string;
  readonly matrix: Matrix;
  readonly [taskDefinitionBrand]: {
    readonly setup: unknown;
    readonly output: JsonValue;
  };
};

export type RuntimeTask = {
  readonly name: string;
  readonly matrix?: Matrix;
  readonly setup?: (context: SetupContext<Matrix>) => Awaitable<unknown>;
  readonly run: (context: TaskContext<JsonObject, unknown>) => Awaitable<JsonValue>;
  readonly teardown?: (context: TeardownContext<Matrix, unknown>) => Awaitable<void>;
  readonly [taskDefinitionBrand]?: true;
};
