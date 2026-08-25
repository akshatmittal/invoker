import { z } from "zod";

import type { JsonObject, JsonValue } from "./types.js";

const scalarSchema = z.union([z.null(), z.string(), z.boolean(), z.number()]);
const nameSchema = z.string().trim().min(1);

export function snapshotJson<const Value extends JsonValue>(
  value: Value,
  owner: string,
  path: string,
  ancestors = new Set<object>(),
): Value {
  // SAFETY: The recursive copy preserves every JSON primitive, array, and object shape in Value.
  return cloneJson(value, owner, path, ancestors) as Value;
}

function cloneJson(value: JsonValue, owner: string, path: string, ancestors: Set<object>): JsonValue {
  if (scalarSchema.safeParse(value).success) {
    return value;
  }
  if (!isJsonContainer(value)) {
    fail(owner, path, "expected JSON");
  }
  if (ancestors.has(value)) {
    fail(owner, path, "cyclic values are not JSON");
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    const snapshot: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        fail(owner, `${path}[${index}]`, "sparse arrays are not JSON");
      }
      snapshot.push(cloneJson(value[index]!, owner, `${path}[${index}]`, ancestors));
    }
    ancestors.delete(value);
    return snapshot;
  } else {
    assertPlainObject(value, owner, path);
    if (Object.getOwnPropertySymbols(value).length > 0) {
      fail(owner, path, "JSON objects cannot have symbol keys");
    }
    const snapshot = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneJson(child, owner, `${path}.${key}`, ancestors)]),
    );
    ancestors.delete(value);
    return snapshot;
  }
}

export function assertPlainObject<Value extends object>(value: Value, owner: string, path: string): void {
  if (Object(value) !== value || Array.isArray(value)) {
    fail(owner, path, "expected a plain object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(owner, path, "expected a plain object");
  }
}

export function assertName(value: string, owner: string, path: string): void {
  if (!nameSchema.safeParse(value).success) {
    fail(owner, path, "expected a non-empty string");
  }
}

export function assertOnlyKeys<Value extends object>(value: Value, allowed: readonly string[], owner: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      fail(owner, `.${key}`, "unknown property");
    }
  }
}

export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isJsonObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fail(owner: string, path: string, message: string): never {
  throw new TypeError(`${owner}${path}: ${message}`);
}

function isJsonContainer(value: JsonValue): value is JsonObject | readonly JsonValue[] {
  return value !== null && Object(value) === value;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return isJsonContainer(value) && !Array.isArray(value);
}
