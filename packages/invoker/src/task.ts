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

type ParameterArguments<Params> = [Params] extends [Record<string, never>] ? [] : [params: Params];

type RequiredParameters<Params> = {
  [Key in keyof Params]-?: Params[Key] extends JsonValue ? RequiredParameters<Params[Key]> : never;
};

export type TaskDefinition<
  Name extends string = string,
  M extends Matrix = Matrix,
  Setup = unknown,
  Output extends JsonValue = JsonValue,
  Params extends JsonObject = Record<never, never>,
> = (...args: ParameterArguments<Params>) => BoundTask<Name, M, Setup, Output, Params>;

type TaskOptions<Name extends string, M extends Matrix, Setup, Output extends JsonValue, Params> = {
  readonly name: Name;
  readonly matrix?: (context: ParamsContext<Params>) => Promise<M>;
  readonly setup?: (context: SetupContext<M, Params>) => Awaitable<Setup>;
  readonly run: (context: TaskContext<CaseCoordinates<M>, Setup, Params>) => Awaitable<Output>;
  readonly teardown?: (context: TeardownContext<M, Setup, Params>) => Awaitable<void>;
};

interface BoundTask<
  Name extends string,
  M extends Matrix,
  Setup,
  Output extends JsonValue,
  Params extends JsonObject,
> extends TaskOptions<Name, M, Setup, Output, Params> {
  readonly params: Readonly<Params>;
  readonly matrix: (context: ParamsContext<Params>) => Promise<M>;
  readonly [taskBindingBrand]: true;
}

export function defineTask<
  Params extends Record<keyof Params, JsonValue> & RequiredParameters<Params> = Record<never, never>,
>() {
  function define<
    const Name extends string,
    const M extends Matrix = Record<never, never>,
    Setup = unknown,
    const Output extends JsonValue = JsonValue,
  >(
    definition: TaskOptions<Name, M, Setup, Output, Params> & {
      readonly setup: (context: SetupContext<M, Params>) => Awaitable<Setup>;
    },
  ): TaskDefinition<Name, M, Setup, Output, Params>;
  function define<
    const Name extends string,
    const M extends Matrix = Record<never, never>,
    const Output extends JsonValue = JsonValue,
  >(
    definition: TaskOptions<Name, M, undefined, Output, Params> & {
      readonly setup?: never;
      readonly teardown?: never;
    },
  ): TaskDefinition<Name, M, undefined, Output, Params>;
  function define<const Name extends string, const M extends Matrix, Setup, const Output extends JsonValue>(
    definition: TaskOptions<Name, M, Setup, Output, Params>,
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

export type AnyTaskBinding = Pick<RuntimeTask, "name" | "params" | typeof taskBindingBrand>;

export type RuntimeTask = BoundTask<string, Matrix, unknown, JsonValue, JsonObject>;
