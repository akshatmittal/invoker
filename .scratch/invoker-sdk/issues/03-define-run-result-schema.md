# Define Invoker's result metadata schema

Type: grilling
Status: resolved
Blocked by: 02

## Question

What JSON fields belong under each Case's `task.meta.invoker`; how are matrix coordinates, caller metadata, and typed Task output represented; and which status, timing, error, Workflow, Task, and Case data should remain Vitest-owned rather than duplicated in Invoker metadata?

## Answer

Every Case carries this versioned JSON envelope in Vitest's reported task metadata:

```ts
interface InvokerMeta<Matrix extends JsonObject, Output extends JsonValue, Metadata extends JsonObject = JsonObject> {
  schema: 1;
  matrix: Matrix;
  metadata?: Metadata;
  output?: Output;
}
```

`matrix` is always present, including `{}` for a matrixless Task. Optional Workflow-level `metadata` is copied unchanged into every Case. It is a named JSON object intended for explicit caller context such as a baseline, commit, environment, or dataset version. Invoker does not inject GitHub or other runner metadata, merge defaults into it, interpret its keys, or add a separate Task-metadata layer.

`output` is the Task callback's JSON return. Every successfully completed Case must return a `JsonValue`; `null` is the deliberate no-richer-result value, while `undefined` is invalid. `output` is written after the callback returns and may therefore be absent from a failed Case. Matrix and Workflow metadata must be attached before user Task execution so ordinary assertion or Task failures retain their query coordinates. A Task that needs both a failed Vitest status and captured output uses Vitest soft assertions and then returns its output.

Vitest exclusively owns pass/fail status, errors, timing, retries, hierarchy, Task and Workflow display names, internal IDs, interruption, and process exit behavior. Invoker does not duplicate those fields or infer status from keys such as `passed` or `status` in Task output.

Authoring remains strictly typed up to the serialization boundary:

- `defineTask` infers the exact awaited `Output` from `run` and constrains it to `JsonValue`; authors normally provide no generics.
- Matrix literals infer exact Case-coordinate types.
- The exact setup return type flows into `run`.
- A Task definition retains its literal name, Matrix, Case-coordinate, setup, and Output types.
- `defineWorkflow` preserves its heterogeneous Task tuple, literal names, Workflow metadata shape, and every Task's distinct inferred types with const-generic inference.
- Invoker alone writes `task.meta.invoker`; Task authors do not mutate that namespace, avoiding loss of per-Task precision through Vitest's global `TaskMeta` augmentation.

Compile-time JSON constraints are backed by runtime validation because JavaScript callers and widened TypeScript values can cross the boundary. Functions, symbols, `undefined`, `bigint`, cyclic values, `Date`, and other non-JSON data are rejected.
