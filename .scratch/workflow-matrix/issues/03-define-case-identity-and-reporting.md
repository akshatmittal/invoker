# Define Case identity and reporting across Workflow coordinates

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Assignee: akshatmittal
Blocked by: 01, 02
Parent: [Workflow matrices and typed Task parameters](../map.md)

## Question

How should Vitest suites, Case names, result metadata, and Slack summaries represent Workflow and Task coordinates while retaining one Workflow report?

Decide coordinate namespaces, unique Case identity, name filtering, the result envelope and schema version, and whether fixed Task Parameters are persisted. Include identically named Workflow and Task axes, a Task without its own Matrix, and setup or discovery failures that produce no Case results. Keep Task Parameters distinct from reporting metadata, and explicitly address whether parameter values may contain secrets before choosing persistence defaults.

The current Slack reporter identifies Workflow and Task through immediate parents. Determine the report grouping and failure attribution required by the selected suite hierarchy, including aggregate counts and durations.

## Answer

The user approved the hierarchy, coordinate envelope, Slack grouping, and collection failure reporting, and explicitly chose to persist bound parameters.

- Register Workflow → Workflow coordinate → Task → Case. Reuse the existing numbered coordinate name format at both Matrix scopes, including `[1]` for `{}`. Full names identify a Case by Workflow, Workflow coordinate, Task, and Task coordinate; ordinary Vitest name filters can select any of these scopes.
- Use metadata schema 2 with separate `matrix.workflow` and `matrix.task` objects. Both objects are always present, with `{}` for an omitted Matrix. Equal axis names across scopes remain independent. Update SDK consumers directly, without schema 1 compatibility support.
- Persist the validated bound parameter snapshot with every Case, alongside Matrix coordinates, optional Workflow reporting metadata, and successful Output. Parameter persistence is unconditional, including fixed inputs; this supersedes the proposal to omit parameters. No redaction or persistence toggle was requested.
- Attach static coordinates and parameters before setup or Case execution so they survive setup failures, skips, and retries. Output keeps its existing successful-attempt-only semantics.
- Keep one logical Workflow report. Slack has one row per Workflow coordinate and Task pair, labeled with the Workflow coordinates and Task name. Each row retains its own counts and elapsed Case duration; the Workflow totals cover all rows. Retain existing pagination where necessary.
- Failure, successful retry, and skip details identify both coordinate scopes. Setup and teardown errors identify the Task and Workflow coordinate without inventing a Task Case coordinate.
- A collection failure produces a failed Workflow summary even when no Cases were registered, with the available Workflow/Task/coordinate context and no fabricated Case counts. Reporting must discover failed Workflows independently of Case traversal.
