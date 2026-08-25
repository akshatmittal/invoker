import type { TaskMeta } from "vitest";

import { beforeAll, describe, test } from "vitest";
import { z } from "zod";

import type { AnyTaskDefinition, RuntimeTask } from "./task.js";
import type { InvokerMeta, JsonObject, JsonValue } from "./types.js";

import { assertName, assertOnlyKeys, assertPlainObject, fail, snapshotJson } from "./json.js";
import { caseName, expandMatrix } from "./matrix.js";
import { taskDefinitionBrand } from "./task.js";

type WorkflowDefinition<
  Tasks extends readonly [AnyTaskDefinition, ...AnyTaskDefinition[]],
  Metadata extends JsonObject,
> = {
  readonly name: string;
  readonly metadata?: Metadata;
  readonly tasks: Tasks;
};

type RuntimeInvokerMeta = InvokerMeta<JsonObject, JsonValue, JsonObject>;

type PreparedTask = {
  readonly task: RuntimeTask;
  readonly cases: readonly JsonObject[];
  readonly names: readonly string[];
  readonly metadata: readonly RuntimeInvokerMeta[];
};

type PreparedWorkflow = {
  readonly name: string;
  readonly tasks: readonly PreparedTask[];
};

export function defineWorkflow<
  const Tasks extends readonly [AnyTaskDefinition, ...AnyTaskDefinition[]],
  const Metadata extends JsonObject = JsonObject,
>(definition: WorkflowDefinition<Tasks, Metadata>): void {
  const workflow = prepareWorkflow(definition);

  describe(workflow.name, { concurrent: false }, () => {
    for (const prepared of workflow.tasks) {
      describe(prepared.task.name, { concurrent: false }, () => {
        let setup: unknown;

        const setupTask = prepared.task.setup;
        if (setupTask) {
          beforeAll(async () => {
            setup = await setupTask({ cases: prepared.cases });

            const teardownTask = prepared.task.teardown;
            if (teardownTask) {
              return () => teardownTask({ cases: prepared.cases, setup });
            }
          });
        }

        for (const [index, matrix] of prepared.cases.entries()) {
          const name = prepared.names[index]!;
          const invoker = prepared.metadata[index]!;

          // SAFETY: Invoker writes this metadata and Vitest preserves it on the matching task.
          test.concurrent(name, { meta: { invoker } as TaskMeta }, async (vitest) => {
            // SAFETY: This callback belongs to the task registered with Invoker metadata above.
            const meta = vitest.task.meta as TaskMeta & {
              invoker: RuntimeInvokerMeta;
            };

            delete meta.invoker.output;
            const output = await prepared.task.run({
              matrix,
              setup,
              vitest,
            });
            meta.invoker.output = snapshotJson(output, `Task ${JSON.stringify(prepared.task.name)}`, ".output");
          });
        }
      });
    }
  });
}

function prepareWorkflow(
  definition: WorkflowDefinition<readonly [AnyTaskDefinition, ...AnyTaskDefinition[]], JsonObject>,
): PreparedWorkflow {
  assertPlainObject(definition, "Workflow", "");
  assertOnlyKeys(definition, ["name", "metadata", "tasks"], "Workflow");
  const name = definition.name;
  const workflowMetadata = definition.metadata;
  const taskDefinitions = definition.tasks;
  assertName(name, "Workflow", ".name");

  const metadata =
    workflowMetadata === undefined
      ? undefined
      : snapshotJson(workflowMetadata, `Workflow ${JSON.stringify(name)}`, ".metadata");
  if (metadata !== undefined) {
    assertPlainObject(metadata, `Workflow ${JSON.stringify(name)}`, ".metadata");
  }

  if (!Array.isArray(taskDefinitions) || taskDefinitions.length === 0) {
    fail("Workflow", ".tasks", "expected a non-empty Task tuple");
  }

  const names = new Set<string>();
  const tasks = taskDefinitions.map((value, index) => {
    const owner = `Workflow ${JSON.stringify(name)} Task ${index + 1}`;
    assertPlainObject(value, owner, "");

    if (value[taskDefinitionBrand] !== true) {
      fail(owner, "", "expected a Task created by defineTask");
    }
    // SAFETY: The private brand proves this value came from defineTask, which supplies the runtime fields.
    const task = value as RuntimeTask;

    assertOnlyKeys(task, ["name", "matrix", "setup", "run", "teardown"], owner);
    const taskSnapshot = { ...task };
    assertName(taskSnapshot.name, owner, ".name");

    if (names.has(taskSnapshot.name)) {
      fail(owner, ".name", `duplicate Task name ${JSON.stringify(taskSnapshot.name)}`);
    }
    names.add(taskSnapshot.name);

    if (!z.function().safeParse(taskSnapshot.run).success) {
      fail(owner, ".run", "expected a function");
    }
    if (taskSnapshot.setup !== undefined && !z.function().safeParse(taskSnapshot.setup).success) {
      fail(owner, ".setup", "expected a function");
    }
    if (taskSnapshot.teardown !== undefined && !z.function().safeParse(taskSnapshot.teardown).success) {
      fail(owner, ".teardown", "expected a function");
    }
    if (taskSnapshot.teardown && !taskSnapshot.setup) {
      fail(owner, ".teardown", "requires setup");
    }

    const cases = expandMatrix(taskSnapshot.matrix, `Task ${JSON.stringify(taskSnapshot.name)}`);
    return {
      task: taskSnapshot,
      cases,
      names: cases.map(caseName),
      metadata: cases.map((matrix) =>
        metadata === undefined ? { schema: 1, matrix } : { schema: 1, matrix, metadata },
      ),
    } satisfies PreparedTask;
  });

  return { name, tasks };
}
