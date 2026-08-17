import { Cron } from "croner";

import type { RuntimeSchedule, SafeFailure } from "./client.js";
import type { NormalizedDefinition } from "./config.js";
import type { GitHubScheduleDefinition } from "./types.js";

import { createGitHubClient, githubError, githubFailure } from "./client.js";
import { GITHUB_SCHEDULE_OWNER as OWNER, normalizeDefinition, workflowKey } from "./config.js";
import { logDispatch, logShutdown, logStartup } from "./events.js";

let schedulerActive = false;

export async function runGitHubSchedule(definition: GitHubScheduleDefinition): Promise<void> {
  let normalized: NormalizedDefinition;

  try {
    normalized = normalizeDefinition(definition);
  } catch (error) {
    logStartup(0, 0, 0, localFailure(error));
    throw error;
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

    const installations = new Map<string, number>();
    for (const schedule of normalized.schedules) {
      if (!installations.has(schedule.repository)) {
        installations.set(schedule.repository, await github.resolveInstallation(schedule));
      }
    }

    const workflows = new Map<string, number>();
    for (const schedule of normalized.schedules) {
      const key = workflowKey(schedule);
      if (!workflows.has(key)) {
        workflows.set(key, await github.resolveWorkflow(schedule, installations.get(schedule.repository)!));
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
            (cause: unknown) => {
              const failure = githubFailure(cause, "dispatch workflow", schedule);
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
  logShutdown(signal, drainedCount);
}

function localFailure(cause: unknown): SafeFailure {
  return {
    message: cause instanceof Error ? cause.message : `${OWNER}: startup validation failed`,
    operation: "validate configuration",
  };
}
