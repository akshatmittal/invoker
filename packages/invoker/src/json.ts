import type { JsonObject, JsonValue } from "./types.js";

export function assertJson(
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

export function assertPlainObject(
  value: unknown,
  owner: string,
  path: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(owner, path, "expected a plain object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(owner, path, "expected a plain object");
  }
}

export function assertName(value: unknown, owner: string, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(owner, path, "expected a non-empty string");
  }
}

export function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], owner: string): void {
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
  if (value !== null && typeof value === "object") {
    const object = value as JsonObject;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key] as JsonValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fail(owner: string, path: string, message: string): never {
  throw new TypeError(`${owner}${path}: ${message}`);
}
