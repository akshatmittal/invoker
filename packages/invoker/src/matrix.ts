import type { JsonObject, JsonValue } from "./types.js";

import { assertJson, assertPlainObject, canonicalJson, fail } from "./json.js";

export function expandMatrix(matrix: unknown, owner: string): readonly JsonObject[] {
  if (matrix === undefined) {
    return [{}];
  }

  assertPlainObject(matrix, owner, ".matrix");
  let cases: JsonObject[] = [{}];

  for (const axis of Reflect.ownKeys(matrix)) {
    if (typeof axis !== "string" || !Object.prototype.propertyIsEnumerable.call(matrix, axis)) {
      fail(owner, ".matrix", "axis names must be enumerable strings");
    }
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

export function caseName(matrix: JsonObject, index: number): string {
  const axes = Object.entries(matrix)
    .map(([axis, value]) => `${axis}=${JSON.stringify(value)}`)
    .join(", ");
  return axes === "" ? `[${index + 1}]` : `[${index + 1}] ${axes}`;
}
