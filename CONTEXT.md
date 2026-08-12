# Invoker

Invoker models matrix-driven work as workflows of tasks so one run can execute work consistently and retain structured results.

## Language

**Task**:
The smallest user-defined unit of executable work in a Workflow. A Task may expand into multiple executions from its matrix.
_Avoid_: Job, test

**Workflow**:
A collection of Tasks invoked as one run under shared execution options.
_Avoid_: Suite, test suite

**Run**:
One execution of a Workflow, including its metadata and the results produced by its Tasks.
_Avoid_: Build, job

**Case**:
One execution of a Task for one value produced by expanding that Task's matrix.
_Avoid_: Job, matrix run

**Matrix**:
A set of named axes whose values expand into the Cases of a Task.
_Avoid_: Parameter set, variants

**Output**:
The JSON value produced by a successfully completed Case for later reporting and analysis.
_Avoid_: Return value, result metadata
