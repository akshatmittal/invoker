import { log } from "evlog";

import type { DispatchResult, RuntimeSchedule, SafeFailure } from "./client.js";

const SERVICE = "github-schedule";

export function logStartup(schedules: number, repositories: number, workflows: number, failure?: SafeFailure): void {
  log[failure ? "error" : "info"]({
    service: SERVICE,
    event: "github_schedule.startup",
    schedules,
    repositories,
    workflows,
    ...(failure ? { outcome: "failure", failure } : { outcome: "success" }),
  });
}

export function logDispatch(
  schedule: RuntimeSchedule,
  scheduledAt: string,
  result?: DispatchResult,
  failure?: SafeFailure,
): void {
  log[failure ? "error" : "info"]({
    service: SERVICE,
    event: "github_schedule.dispatch",
    repository: schedule.repository,
    workflow: schedule.workflow,
    ref: schedule.ref,
    cron: schedule.cron,
    timezone: schedule.timezone,
    scheduledAt,
    ...(failure
      ? { outcome: "failure", failure }
      : { outcome: "success", runId: result!.runId, runUrl: result!.webUrl }),
  });
}

export function logShutdown(signal: NodeJS.Signals, drainedDispatches: number): void {
  log.info({
    service: SERVICE,
    event: "github_schedule.shutdown",
    signal,
    drainedDispatches,
    outcome: "success",
  });
}
