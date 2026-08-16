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

**GitHub Actions Workflow**:
An automation definition hosted and executed by GitHub Actions.
_Avoid_: Workflow when it could be confused with an Invoker Workflow

**GitHub Schedule**:
A recurring plan that Dispatches a GitHub Actions Workflow at configured times.
_Avoid_: Cron job, scheduled Workflow

**Dispatch**:
One request to GitHub to start a GitHub Actions Workflow for a repository and git reference with optional inputs.
_Avoid_: Invocation, trigger
