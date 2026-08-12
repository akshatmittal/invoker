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

export type Awaitable<Value> = Value | PromiseLike<Value>;

export type SetupContext<M extends Matrix> = {
  readonly cases: readonly CaseCoordinates<M>[];
};

export type TeardownContext<M extends Matrix, Setup> = SetupContext<M> & {
  readonly setup: Setup;
};
