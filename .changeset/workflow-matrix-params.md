---
"@akshatmittal/invoker": minor
---

Add Workflow matrices and required, typed Task parameter bindings. Declare Tasks with `defineTask<Params>()({ ... })` and bind them from a Workflow's `tasks: ({ matrix }) => [...]` callback.

Each Workflow coordinate executes its own Task sequence and lifecycle. Schema 2 results persist separate Workflow and Task coordinates and all bound parameters. Slack groups coordinate-specific Task rows in one Workflow report and reports collection failures even without Cases.

This replaces the previous Task declaration, Workflow task list, and schema 1 result formats.
