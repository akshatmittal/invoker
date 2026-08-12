import type { TaskMeta } from "vitest";

import { beforeAll, describe, test } from "vitest";

import type { AnyTaskDefinition, RuntimeTask } from "./task.js";
import type { InvokerMeta, JsonObject, JsonValue } from "./types.js";

import { assertJson, assertName, assertOnlyKeys, assertPlainObject, fail } from "./json.js";
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

          test.concurrent(name, { meta: { invoker } as TaskMeta }, async (vitest) => {
            const meta = vitest.task.meta as TaskMeta & {
              invoker: RuntimeInvokerMeta;
            };

            delete meta.invoker.output;
            const output = await prepared.task.run({
              matrix,
              setup,
              vitest,
            });
            assertJson(output, `Task ${JSON.stringify(prepared.task.name)}`, ".output");
            meta.invoker.output = output;
          });
        }
      });
    }
  });
}

function prepareWorkflow(definition: unknown): {
  readonly name: string;
  readonly tasks: readonly PreparedTask[];
} {
  assertPlainObject(definition, "Workflow", "");
  assertOnlyKeys(definition, ["name", "metadata", "tasks"], "Workflow");
  assertName(definition.name, "Workflow", ".name");

  const metadata = definition.metadata;
  if (metadata !== undefined) {
    assertJson(metadata, `Workflow ${JSON.stringify(definition.name)}`, ".metadata");
    assertPlainObject(metadata, `Workflow ${JSON.stringify(definition.name)}`, ".metadata");
  }

  if (!Array.isArray(definition.tasks) || definition.tasks.length === 0) {
    fail("Workflow", ".tasks", "expected a non-empty Task tuple");
  }

  const names = new Set<string>();
  const tasks = definition.tasks.map((value, index) => {
    const owner = `Workflow ${JSON.stringify(definition.name)} Task ${index + 1}`;
    assertPlainObject(value, owner, "");

    const task = value as RuntimeTask;
    if (task[taskDefinitionBrand] !== true) {
      fail(owner, "", "expected a Task created by defineTask");
    }

    assertOnlyKeys(task, ["name", "matrix", "setup", "run", "teardown"], owner);
    assertName(task.name, owner, ".name");

    if (names.has(task.name)) {
      fail(owner, ".name", `duplicate Task name ${JSON.stringify(task.name)}`);
    }
    names.add(task.name);

    if (typeof task.run !== "function") {
      fail(owner, ".run", "expected a function");
    }
    if (task.setup !== undefined && typeof task.setup !== "function") {
      fail(owner, ".setup", "expected a function");
    }
    if (task.teardown !== undefined && typeof task.teardown !== "function") {
      fail(owner, ".teardown", "expected a function");
    }
    if (task.teardown && !task.setup) {
      fail(owner, ".teardown", "requires setup");
    }

    const cases = expandMatrix(task.matrix, `Task ${JSON.stringify(task.name)}`);
    return {
      task,
      cases,
      names: cases.map(caseName),
      metadata: cases.map((matrix) =>
        metadata === undefined ? { schema: 1, matrix } : { schema: 1, matrix, metadata },
      ),
    } satisfies PreparedTask;
  });

  return { name: definition.name, tasks };
}
