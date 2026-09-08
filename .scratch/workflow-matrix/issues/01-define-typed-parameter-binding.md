# Define typed Workflow-to-Task parameter binding

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Assignee: akshatmittal
Parent: [Workflow matrices and typed Task parameters](../map.md)

## Question

What concrete TypeScript API lets an independently defined Task declare its parameters and lets a Workflow explicitly bind fixed values and Workflow Matrix coordinates to those parameters while preserving exact inference?

Decide the Workflow Matrix declaration and async discovery shape, parameter declaration and validation, binding syntax and evaluation timing, parameter value restrictions, and callback context shapes. Cover a parameterless Task, a Task reused by different Workflows, missing or mistyped parameters, and Workflow/Task axes with the same name. Decide whether the same Task may be bound more than once in a Workflow and how such bindings are identified.

Use a concrete example with two environments, a fixed baseline, and a Task whose async Matrix discovers three models from its environment parameter. Parameters must be available to discovery, setup, execution, and teardown. Define how exact setup and Output inference survive the new parameter contract.

## Comments

### Parameter contract choices

The user approved TypeScript parameter declarations without mandatory runtime schemas. External data is validated at its entry point; Workflow bindings must be statically checked against each Task's declared parameters while preserving Matrix, setup, and Output inference.

Workflow Matrix discovery uses `matrix: async () => ({ ...axes })`, resolves once during collection, and is optional; omission gives one execution of the Task sequence. Task Parameters are JSON values; clients and resources belong in setup. Task names remain unique within each Workflow coordinate; multiple separately named bindings of the same Task are outside the initial API.

The user specifically emphasized type safety between Tasks and Workflows.

### Declaration and binding syntax

The user approved `defineTask<Params>()({ ...definition })`, which returns a callable parameter binder. Calling `evaluate({ environment, baseline })` binds parameters without executing the Task. Missing required parameters, wrong value types, and unsupported literal values must produce compile-time errors; Matrix, setup, and Output types remain independently inferred.

Workflow `tasks` is a synchronous `({ matrix }) => [boundTasks...]` callback with coordinates inferred from the Workflow Matrix. Async work belongs in Workflow or Task Matrix discovery.

Task callbacks receive `params` for explicitly bound inputs and `matrix` for Task coordinates only. Workflow coordinates reach Tasks through explicit parameter binding, avoiding implicit dependencies and axis-name collisions.

### Remaining API cases

The user approved parameterless Tasks using `defineTask()({ ... })`, bound with no argument; conditional Task selection through the Workflow callback, provided each coordinate has a nonempty list with unique Task names; and JSON validation and snapshotting of bound parameters during collection. Callbacks receive readonly parameters. The user rejected optional parameters: all declared Task parameter fields must be required.

## Answer

- Declare parameterized Tasks with `defineTask<Params>()({ name, matrix, setup, run, teardown })`. This returns a callable binder; `evaluate({ environment, baseline })` creates a bound Task without executing it. The curried declaration must preserve independent inference of Matrix, setup, and Output.
- Declare parameterless Tasks with `defineTask()({ ... })` and bind them with `healthCheck()`. They require no argument.
- Task parameter contracts use TypeScript, with all declared parameter fields required. Optional parameter declarations are unsupported, and there is no SDK defaults mechanism. Missing required fields, incompatible values, and unsupported literal values fail compilation. JSON-incompatible parameter values are unsupported.
- Workflow `matrix` is an optional `async () => ({ ...axes })`, resolved once during collection. Omitting it gives one coordinate, `{}`.
- Workflow `tasks` is a synchronous `({ matrix }) => [boundTasks...]` callback. Workflow coordinates are inferred from its Matrix and checked against each bound Task's parameter contract. Conditional Task selection is allowed. Every coordinate must have a nonempty Task list with unique names; multiple bindings with the same Task name within a coordinate are unsupported.
- Matrix discovery, setup, run, and teardown receive readonly `params`. Existing setup/run/teardown context fields retain their roles. A Task's `matrix` context contains only its own coordinates; Workflow coordinates enter the Task through explicit parameter binding. Equal axis names across the two scopes do not collide.
- Invoker validates JSON compatibility and snapshots bound parameters during collection, without runtime schemas for their declared TypeScript shape. `undefined`, clients, functions, and class instances are not parameter values; setup owns resources. Callers validate external data at its entry point.
- A Task is reusable across Workflows, with every binding statically checked against its declared inputs. Binding does not itself multiply executions; Workflow and Task matrices do.
