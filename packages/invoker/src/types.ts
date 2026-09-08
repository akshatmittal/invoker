import type { TestContext } from "vitest";

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
  WorkflowCoordinates extends JsonObject = JsonObject,
  Params extends JsonObject = JsonObject,
> {
  schema: 2;
  matrix: {
    workflow: WorkflowCoordinates;
    task: Coordinates;
  };
  params: Params;
  metadata?: Metadata;
  output?: Output;
}

export interface TaskContext<Coordinates, Setup, Params = Record<never, never>> extends ParamsContext<Params> {
  readonly matrix: Coordinates;
  readonly setup: Setup;
  readonly vitest: TestContext;
}

export type Awaitable<Value> = Value | PromiseLike<Value>;

// JsonValue is already deeply readonly; preserve it to avoid expanding its recursive definition.
type DeepReadonly<Value> = JsonValue extends Value
  ? Value
  : { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> };

export type ParamsContext<Params> = {
  readonly params: DeepReadonly<Params>;
};

export type SetupContext<M extends Matrix, Params = Record<never, never>> = ParamsContext<Params> & {
  readonly cases: readonly CaseCoordinates<M>[];
};

export type TeardownContext<M extends Matrix, Setup, Params = Record<never, never>> = SetupContext<M, Params> & {
  readonly setup: Setup;
};
