# Define Workflow Matrix expansion and lifecycle semantics

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Assignee: akshatmittal
Blocked by: 01
Parent: [Workflow matrices and typed Task parameters](../map.md)

## Question

How do Workflow Matrix discovery, parameter binding, Task Matrix discovery, and Vitest registration compose into deterministic Cases and the agreed per-coordinate Task sequence?

Preserve staging A → B, then production A → B, with separate Task setup/teardown per environment. Decide discovery invocation counts and concurrency, whether all discovery finishes before execution, setup's Case scope, parameter sharing or snapshot semantics, Case concurrency within a Task, and how retries interact with parameters and setup.

Specify omitted or empty matrices, invalid or duplicate coordinates, binding/discovery/setup/run/teardown failures, and whether a failure prevents other Tasks or Workflow coordinates from executing. Identify what follows directly from Vitest and existing expansion rules and what needs an explicit new contract.

## Answer

The user approved the following lifecycle contract:

- Resolve and expand the Workflow Matrix once during collection. Invoke the synchronous Task binding callback once per Workflow coordinate, preserving Matrix expansion order and the returned Task order.
- Validate and snapshot each binding's parameters. Discover each bound Task's Matrix exactly once; discovery may run concurrently across Tasks and Workflow coordinates. Finish all discovery, expansion, and validation before registering executable Task suites.
- A Workflow discovery, binding, parameter validation, or Task discovery failure fails collection for that Workflow before any of its Tasks execute. Do not silently execute a partially discovered Workflow.
- Execute the complete Task sequence for one Workflow coordinate before advancing to the next: staging A → B, then production A → B. Cases within a bound Task run concurrently under Vitest's concurrency configuration. Other Workflow modules remain subject to Vitest's scheduling.
- Setup runs once per bound Task and receives its parameter snapshot plus only its own expanded Task coordinates. All Cases and retries for that binding share the setup reference and parameter snapshot. Parameters are readonly; mutation is unsupported rather than managed through a new freezing mechanism.
- Teardown runs once after the binding's Cases settle, only if setup succeeded. Partial allocation cleanup after a setup exception belongs to setup code. Setup and teardown remain optional lifecycle hooks; teardown requires setup.
- Setup, run, and teardown failures use native Vitest failure semantics. Later Tasks and Workflow coordinates continue under normal Vitest behavior; explicit bail, filtering, interruption, and retry configuration remain Vitest-owned. Invoker adds no Task dependency mechanism.
- A missing Matrix or `{}` expands to one coordinate. An empty axis, duplicate axis values, or invalid Matrix values fails collection. Reuse the existing Cartesian expansion and validation rules at both scopes, including insertion ordering with the last axis varying fastest.
- Retries do not rediscover matrices, rebind parameters, or rerun Task setup. Preserve the existing clearing of Output before each Case attempt and write Output only after successful JSON validation.
