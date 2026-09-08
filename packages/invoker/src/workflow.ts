import type { TaskMeta } from "vitest";

import { beforeAll, describe, test, TestRunner } from "vitest";
import { z } from "zod";

import type { AnyTaskBinding, RuntimeTask } from "./task.js";
import type { CaseCoordinates, InvokerMeta, JsonObject, JsonValue, Matrix } from "./types.js";

import { assertName, assertOnlyKeys, assertPlainObject, fail, snapshotJson } from "./json.js";
import { caseName, expandMatrix } from "./matrix.js";
import { taskBindingBrand } from "./task.js";

type WorkflowDefinition<M extends Matrix, Metadata extends JsonObject> = {
  readonly name: string;
  readonly metadata?: Metadata;
  readonly matrix?: () => Promise<M>;
  readonly tasks: (context: { readonly matrix: CaseCoordinates<M> }) => readonly [AnyTaskBinding, ...AnyTaskBinding[]];
};

type WorkflowInfo = {
  readonly name: string;
  metadata?: JsonObject;
};

type RuntimeInvokerMeta = InvokerMeta<JsonObject, JsonValue>;

type PreparedTask = {
  readonly task: RuntimeTask;
  readonly cases: readonly JsonObject[];
};

export function defineWorkflow<
  const M extends Matrix = Record<never, never>,
  const Metadata extends JsonObject = JsonObject,
>(definition: WorkflowDefinition<M, Metadata>): void {
  const info: WorkflowInfo = { name: definition.name };
  // SAFETY: Invoker owns this serializable suite metadata, consumed by its reporter.
  const meta = { invokerWorkflow: info } as TaskMeta;

  describe(definition.name, { concurrent: false, shuffle: false, meta }, async () => {
    const file = TestRunner.getCurrentSuite().file;
    try {
      const coordinates = await prepareWorkflow(definition, info);
      for (const [index, coordinate] of coordinates.entries()) {
        // SAFETY: Clear the inherited Workflow marker on coordinate and Task suites.
        const coordinateMeta = { invokerWorkflow: null } as TaskMeta;
        describe(caseName(coordinate.matrix, index), { concurrent: false, meta: coordinateMeta }, () => {
          for (const prepared of coordinate.tasks) {
            registerTask(prepared, coordinate.matrix, info.metadata);
          }
        });
      }
    } catch (cause) {
      // Vitest drops suites when collection throws. File metadata retains the failed Workflow's identity.
      Object.assign(file.meta, { invokerCollectionError: info });
      throw new Error(
        `Workflow ${JSON.stringify(info.name)} collection failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  });
}

function registerTask(prepared: PreparedTask, workflow: JsonObject, metadata: JsonObject | undefined): void {
  const { task, cases } = prepared;
  const { params } = task;
  describe(task.name, { concurrent: false }, () => {
    let setup: unknown;
    const setupTask = task.setup;
    if (setupTask) {
      beforeAll(async () => {
        setup = await setupTask({ params, cases });
        const teardownTask = task.teardown;
        if (teardownTask) {
          return () => teardownTask({ params, cases, setup });
        }
      });
    }

    for (const [index, matrix] of cases.entries()) {
      const invoker: RuntimeInvokerMeta = {
        schema: 2,
        matrix: { workflow, task: matrix },
        params,
      };
      if (metadata !== undefined) invoker.metadata = metadata;
      // SAFETY: Invoker writes this metadata and Vitest preserves it on the matching Case.
      test.concurrent(caseName(matrix, index), { meta: { invoker } as TaskMeta }, async (vitest) => {
        // SAFETY: This callback belongs to the Case registered with Invoker metadata above.
        const meta = vitest.task.meta as TaskMeta & { invoker: RuntimeInvokerMeta };
        delete meta.invoker.output;
        const output = await task.run({ params, matrix, setup, vitest });
        meta.invoker.output = snapshotJson(output, `Task ${JSON.stringify(task.name)}`, ".output");
      });
    }
  });
}

async function prepareWorkflow<M extends Matrix>(definition: WorkflowDefinition<M, JsonObject>, info: WorkflowInfo) {
  assertPlainObject(definition, "Workflow", "");
  assertOnlyKeys(definition, ["name", "metadata", "matrix", "tasks"], "Workflow");
  assertName(definition.name, "Workflow", ".name");
  const owner = `Workflow ${JSON.stringify(definition.name)}`;
  if (definition.metadata !== undefined) {
    const metadata = snapshotJson(definition.metadata, owner, ".metadata");
    assertPlainObject(metadata, owner, ".metadata");
    info.metadata = metadata;
  }
  if (!z.function().safeParse(definition.tasks).success) {
    fail(owner, ".tasks", "expected a synchronous function");
  }
  if (definition.matrix !== undefined && !z.function().safeParse(definition.matrix).success) {
    fail(owner, ".matrix", "expected a function");
  }

  const matrix = definition.matrix ? await definition.matrix() : {};
  const coordinates = expandMatrix(matrix, owner).map((coordinate, index) => {
    const coordinateOwner = `${owner} coordinate ${caseName(coordinate, index)}`;
    try {
      // SAFETY: Expansion preserves M's axes; omitting the Matrix infers an empty coordinate.
      const bindings = definition.tasks({ matrix: coordinate as CaseCoordinates<M> });
      if (!Array.isArray(bindings) || bindings.length === 0) {
        fail(coordinateOwner, ".tasks", "expected a non-empty Task tuple");
      }
      const names = new Set<string>();
      return {
        matrix: coordinate,
        owner: coordinateOwner,
        tasks: bindings.map((binding) => prepareBinding(binding, coordinateOwner, names)),
      };
    } catch (cause) {
      throw new Error(
        `${coordinateOwner} Task binding failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  });

  return Promise.all(
    coordinates.map(async (coordinate) => ({
      matrix: coordinate.matrix,
      tasks: await Promise.all(
        coordinate.tasks.map(async (task) => {
          const taskOwner = `${coordinate.owner} Task ${JSON.stringify(task.name)}`;
          try {
            return { task, cases: expandMatrix(await task.matrix({ params: task.params }), taskOwner) };
          } catch (cause) {
            throw new Error(
              `${taskOwner} Matrix discovery failed: ${cause instanceof Error ? cause.message : String(cause)}`,
              { cause },
            );
          }
        }),
      ),
    })),
  );
}

function prepareBinding(binding: AnyTaskBinding, owner: string, names: Set<string>): RuntimeTask {
  assertPlainObject(binding, owner, ".tasks");
  if (binding[taskBindingBrand] !== true) {
    fail(owner, ".tasks", "expected a bound Task created by defineTask");
  }
  // SAFETY: The private brand proves this is a binding created by defineTask with matching callbacks and params.
  const task = binding as RuntimeTask;
  assertOnlyKeys(task, ["name", "params", "matrix", "setup", "run", "teardown"], owner);
  assertName(task.name, owner, ".tasks.name");
  if (names.has(task.name)) {
    fail(owner, ".tasks", `duplicate Task name ${JSON.stringify(task.name)}`);
  }
  names.add(task.name);
  const taskOwner = `${owner} Task ${JSON.stringify(task.name)}`;
  for (const key of ["matrix", "run", "setup", "teardown"] as const) {
    if ((key === "setup" || key === "teardown") && task[key] === undefined) continue;
    if (!z.function().safeParse(task[key]).success) fail(taskOwner, `.${key}`, "expected a function");
  }
  if (task.teardown && !task.setup) fail(taskOwner, ".teardown", "requires setup");
  const params = snapshotJson(task.params, taskOwner, ".params");
  assertPlainObject(params, taskOwner, ".params");
  return { ...task, params };
}
