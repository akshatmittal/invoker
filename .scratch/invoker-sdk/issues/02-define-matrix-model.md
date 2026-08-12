# Define matrix shape and expansion rules

Type: grilling
Status: resolved

## Question

What TypeScript input shape defines a Task matrix, how does it expand into Cases, which values and empty states are valid, how are Cases identified, and which compile-time inference guarantees must hold?

## Answer

V1 accepts one optional GitHub-style axes object and no explicit-Case, `include`, or `exclude` modes:

```ts
matrix: {
  model: ["gpt-5", "gpt-5-mini"],
  dataset: ["support", "sales"],
}
```

Each axis is a non-empty named readonly array of JSON values. Structured JSON objects may be values, allowing correlated parameters to live on one axis. Matrix construction is synchronous and complete during Vitest collection; asynchronous discovery is not supported. An omitted matrix or `{}` expands to exactly one Case with coordinates `{}`.

Expansion is the Cartesian product. Axis object insertion order and value array order are preserved, with the first axis changing slowest and the last changing fastest. No maximum Case count is imposed.

For the example, the Task callback infers:

```ts
{
  model: "gpt-5" | "gpt-5-mini";
  dataset: "support" | "sales";
}
```

Readonly tuple literals and structured-object types are preserved, and setup receives the same inferred coordinate type when it receives the expanded Cases.

A Case's coordinates are its semantic identity across reports. Vitest owns internal IDs; Invoker does not add a persistent Case ID. Each Case is registered under its stable Task suite with a display name in this form:

```text
[1] model="gpt-5", dataset="support"
```

The index is one-based. Axis values use compact JSON in axis order. V1 has no custom Case-name callback. Coordinate comparison for duplicate detection follows JSON semantics: object key order is ignored while array order is significant.

Invoker validates during collection and reports the Task plus offending axis or value. It rejects empty axis names, non-array axes, empty arrays, non-JSON or cyclic values, and duplicate coordinates. A valid zero-axis matrix remains the deliberate one-Case form.
