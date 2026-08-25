import { z } from "zod";

import type { JsonObject, Matrix } from "./types.js";

import { assertPlainObject, canonicalJson, fail, snapshotJson } from "./json.js";

const axisSchema = z.string();

export function expandMatrix(matrix: Matrix | undefined, owner: string): readonly JsonObject[] {
  if (matrix === undefined) {
    return [{}];
  }

  assertPlainObject(matrix, owner, ".matrix");
  let cases: JsonObject[] = [{}];

  for (const candidate of Reflect.ownKeys(matrix)) {
    const parsed = axisSchema.safeParse(candidate);
    if (!parsed.success || !Object.prototype.propertyIsEnumerable.call(matrix, candidate)) {
      fail(owner, ".matrix", "axis names must be enumerable strings");
    }
    const axis = parsed.data;
    if (axis.trim() === "") {
      fail(owner, ".matrix", "axis names must not be empty");
    }
    const index = Number(axis);
    if (Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1 && String(index) === axis) {
      fail(owner, `.matrix.${axis}`, "array-index axis names cannot preserve insertion order");
    }

    const values = matrix[axis];
    if (!Array.isArray(values)) {
      fail(owner, `.matrix.${axis}`, "expected an array");
    }
    if (values.length === 0) {
      fail(owner, `.matrix.${axis}`, "expected at least one value");
    }

    const snapshots = values.map((value, index) => snapshotJson(value, owner, `.matrix.${axis}[${index}]`));
    const axisValues = new Set<string>();
    for (const [index, value] of snapshots.entries()) {
      const key = canonicalJson(value);
      if (axisValues.has(key)) {
        fail(owner, `.matrix.${axis}[${index}]`, `duplicate axis value ${JSON.stringify(value)}`);
      }
      axisValues.add(key);
    }

    cases = cases.flatMap((coordinates) => snapshots.map((value) => ({ ...coordinates, [axis]: value })));
  }

  return cases;
}

export function caseName(matrix: JsonObject, index: number): string {
  const axes = Object.entries(matrix)
    .map(([axis, value]) => `${axis}=${JSON.stringify(value)}`)
    .join(", ");
  return axes === "" ? `[${index + 1}]` : `[${index + 1}] ${axes}`;
}
