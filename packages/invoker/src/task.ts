import type {
  Awaitable,
  CaseCoordinates,
  JsonObject,
  JsonValue,
  Matrix,
  ParamsContext,
  SetupContext,
  TaskContext,
  TeardownContext,
} from "./types.js";

export const taskBindingBrand: unique symbol = Symbol("invoker.task-binding");

type ParameterArguments<Params> = keyof Params extends never ? [] : [params: Params];

export type TaskDefinition<
  Name extends string = string,
  M extends Matrix = Matrix,
  Setup = unknown,
  Output extends JsonValue = JsonValue,
  Params extends JsonObject = Record<never, never>,
> = (...args: ParameterArguments<Params>) => BoundTask<Name, M, Setup, Output, Params>;

interface BoundTask<Name extends string, M extends Matrix, Setup, Output extends JsonValue, Params extends JsonObject> {
  readonly name: Name;
  readonly params: Readonly<Params>;
  readonly matrix: (context: ParamsContext<Params>) => Promise<M>;
  readonly [taskBindingBrand]: true;
  readonly setup?: (context: SetupContext<M, Params>) => Awaitable<Setup>;
  readonly run: (context: TaskContext<CaseCoordinates<M>, Setup, Params>) => Awaitable<Output>;
  readonly teardown?: (context: TeardownContext<M, Setup, Params>) => Awaitable<void>;
}

type TaskWithSetup<Name extends string, M extends Matrix, Setup, Output extends JsonValue, Params> = {
  readonly name: Name;
  readonly matrix?: (context: ParamsContext<Params>) => Promise<M>;
  readonly setup: (context: SetupContext<M, Params>) => Awaitable<Setup>;
  readonly run: (context: TaskContext<CaseCoordinates<M>, Setup, Params>) => Awaitable<Output>;
  readonly teardown?: (context: TeardownContext<M, Setup, Params>) => Awaitable<void>;
};

type TaskWithoutSetup<Name extends string, M extends Matrix, Output extends JsonValue, Params> = {
  readonly name: Name;
  readonly matrix?: (context: ParamsContext<Params>) => Promise<M>;
  readonly setup?: never;
  readonly run: (context: TaskContext<CaseCoordinates<M>, undefined, Params>) => Awaitable<Output>;
  readonly teardown?: never;
};

export function defineTask<Params extends { [Key in keyof Params]-?: JsonValue } = Record<never, never>>() {
  function define<
    const Name extends string,
    const M extends Matrix = Record<never, never>,
    Setup = unknown,
    const Output extends JsonValue = JsonValue,
  >(definition: TaskWithSetup<Name, M, Setup, Output, Params>): TaskDefinition<Name, M, Setup, Output, Params>;
  function define<
    const Name extends string,
    const M extends Matrix = Record<never, never>,
    const Output extends JsonValue = JsonValue,
  >(definition: TaskWithoutSetup<Name, M, Output, Params>): TaskDefinition<Name, M, undefined, Output, Params>;
  function define<const Name extends string, const M extends Matrix, Setup, const Output extends JsonValue>(
    definition: TaskWithSetup<Name, M, Setup, Output, Params> | TaskWithoutSetup<Name, M, Output, Params>,
  ) {
    return (...args: ParameterArguments<Params>) => {
      // SAFETY: The overloads preserve Params, Matrix, setup and Output; omitted inputs use their empty defaults.
      return {
        ...definition,
        params: args.length === 0 ? {} : args[0],
        matrix: definition.matrix ?? (async () => ({})),
        [taskBindingBrand]: true,
      } as BoundTask<Name, M, Setup, Output, Params>;
    };
  }

  return define;
}

export type AnyTaskBinding = {
  readonly name: string;
  readonly params: JsonObject;
  readonly [taskBindingBrand]: true;
};

export type RuntimeTask = BoundTask<string, Matrix, unknown, JsonValue, JsonObject>;
