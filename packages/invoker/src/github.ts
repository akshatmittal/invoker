import { Cron } from "croner";
import { createLogger } from "evlog";

import type { DispatchResult, RuntimeSchedule, SafeFailure } from "./github/client.js";
import type { NormalizedDefinition } from "./github/config.js";

import { createGitHubClient, githubError, githubFailure } from "./github/client.js";
import { GITHUB_SCHEDULE_OWNER as OWNER, localError, normalizeDefinition, workflowKey } from "./github/config.js";

const SERVICE = "github-schedule";

type WorkflowInput = string | number | boolean;

type GitHubSchedule = {
  readonly cron: string;
  readonly timezone?: string;
  readonly repository: string;
  readonly workflow: string | number;
  readonly ref: string;
  readonly inputs?: Readonly<Record<string, WorkflowInput>>;
};

type GitHubScheduleDefinition = {
  readonly app: {
    readonly id: number;
    readonly privateKey: string;
  };
  readonly schedules: readonly [GitHubSchedule, ...GitHubSchedule[]];
};

let schedulerActive = false;

export async function defineGitHubSchedule(definition: GitHubScheduleDefinition): Promise<void> {
  let normalized: NormalizedDefinition;

  try {
    normalized = normalizeDefinition(definition);
  } catch (error) {
    const safeError = localError(error);
    logStartup(0, 0, 0, localFailure(safeError));
    throw safeError;
  }

  const repositoryCount = new Set(normalized.schedules.map(({ repository }) => repository)).size;
  const workflowCount = new Set(normalized.schedules.map(workflowKey)).size;

  if (schedulerActive) {
    const error = new TypeError(`${OWNER}: another scheduler is already active`);
    logStartup(normalized.schedules.length, repositoryCount, workflowCount, localFailure(error));
    throw error;
  }
  schedulerActive = true;

  const startupAbort = new AbortController();
  const jobs: Cron[] = [];
  const inFlight = new Set<Promise<void>>();
  let state: "starting" | "running" | "stopping" = "starting";
  let stopSignal: NodeJS.Signals | undefined;
  let drainedCount = 0;
  let resolveStop!: () => void;
  const stopRequested = new Promise<void>((resolve) => {
    resolveStop = resolve;
  });
  const isStopping = (): boolean => state === "stopping";

  const removeSignalHandlers = (): void => {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  };

  const requestStop = (signal: NodeJS.Signals): void => {
    if (isStopping()) {
      return;
    }

    const duringStartup = state === "starting";
    state = "stopping";
    stopSignal = signal;
    drainedCount = inFlight.size;
    jobs.forEach((job) => job.stop());
    removeSignalHandlers();
    if (duringStartup) {
      startupAbort.abort();
    }
    resolveStop();
  };

  function onSigint(): void {
    requestStop("SIGINT");
  }

  function onSigterm(): void {
    requestStop("SIGTERM");
  }

  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    const github = createGitHubClient(normalized.app, startupAbort.signal);
    await github.authenticate();

    const installations = new Map<string, number>();
    for (const schedule of normalized.schedules) {
      if (!installations.has(schedule.repository)) {
        installations.set(schedule.repository, await github.resolveInstallation(schedule));
      }
    }

    const workflows = new Map<string, number>();
    for (const [repository, installationId] of installations) {
      const schedule = normalized.schedules.find((entry) => entry.repository === repository)!;
      const token = await github.installationToken(schedule, installationId);

      for (const target of normalized.schedules) {
        const key = workflowKey(target);
        if (target.repository === repository && !workflows.has(key)) {
          workflows.set(key, await github.resolveWorkflow(target, token));
        }
      }
    }

    if (isStopping()) {
      await finishShutdown(inFlight, stopSignal!, drainedCount);
      return;
    }

    const schedules: RuntimeSchedule[] = normalized.schedules.map((schedule) => ({
      ...schedule,
      installationId: installations.get(schedule.repository)!,
      workflowId: workflows.get(workflowKey(schedule))!,
    }));

    for (const schedule of schedules) {
      const job = new Cron(
        schedule.cron,
        {
          catch: true,
          mode: "5-part",
          timezone: schedule.timezone,
        },
        (currentJob) => {
          if (state !== "running") {
            return;
          }

          const scheduledAt = (currentJob.currentRun() ?? new Date()).toISOString();
          const dispatch = github.dispatch(schedule).then(
            (result) => logDispatch(schedule, scheduledAt, result),
            (error: unknown) => {
              const failure = githubFailure(error, "dispatch workflow", schedule);
              logDispatch(schedule, scheduledAt, undefined, failure);
              throw new Error(failure.message);
            },
          );

          inFlight.add(dispatch);
          dispatch.then(
            () => inFlight.delete(dispatch),
            () => inFlight.delete(dispatch),
          );
          return dispatch;
        },
      );
      jobs.push(job);
    }

    state = "running";
    logStartup(normalized.schedules.length, repositoryCount, workflowCount);
    await stopRequested;
    await finishShutdown(inFlight, stopSignal!, drainedCount);
  } catch (error) {
    if (isStopping()) {
      await finishShutdown(inFlight, stopSignal!, drainedCount);
      return;
    }

    jobs.forEach((job) => job.stop());
    removeSignalHandlers();
    schedulerActive = false;
    const failure = githubFailure(error, "start scheduler");
    logStartup(normalized.schedules.length, repositoryCount, workflowCount, failure);
    throw githubError(failure);
  }
}

async function finishShutdown(
  inFlight: ReadonlySet<Promise<void>>,
  signal: NodeJS.Signals,
  drainedCount: number,
): Promise<void> {
  await Promise.allSettled(inFlight);
  schedulerActive = false;
  const operation = createLogger({
    service: SERVICE,
    event: "github_schedule.shutdown",
    signal,
    drainedDispatches: drainedCount,
  });
  operation.set({ outcome: "success" });
  operation.emit();
}

function logStartup(schedules: number, repositories: number, workflows: number, failure?: SafeFailure): void {
  const operation = createLogger({
    service: SERVICE,
    event: "github_schedule.startup",
    schedules,
    repositories,
    workflows,
  });
  if (failure) {
    operation.setLevel("error");
    operation.set({ outcome: "failure", failure });
  } else {
    operation.set({ outcome: "success" });
  }
  operation.emit();
}

function logDispatch(
  schedule: RuntimeSchedule,
  scheduledAt: string,
  result?: DispatchResult,
  failure?: SafeFailure,
): void {
  const operation = createLogger({
    service: SERVICE,
    event: "github_schedule.dispatch",
    repository: schedule.repository,
    workflow: schedule.workflow,
    ref: schedule.ref,
    cron: schedule.cron,
    timezone: schedule.timezone,
    scheduledAt,
  });
  if (failure) {
    operation.setLevel("error");
    operation.set({ outcome: "failure", failure });
  } else {
    operation.set({ outcome: "success", runId: result!.runId, runUrl: result!.webUrl });
  }
  operation.emit();
}

function localFailure(error: unknown): SafeFailure {
  return {
    message: error instanceof Error ? error.message : `${OWNER}: startup validation failed`,
    operation: "validate configuration",
  };
}
