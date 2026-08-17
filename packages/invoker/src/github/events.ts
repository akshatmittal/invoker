import { createLogger } from "evlog";

import type { DispatchResult, RuntimeSchedule, SafeFailure } from "./client.js";

const SERVICE = "github-schedule";

export function logStartup(schedules: number, repositories: number, workflows: number, failure?: SafeFailure): void {
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

export function logDispatch(
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

export function logShutdown(signal: NodeJS.Signals, drainedDispatches: number): void {
  const operation = createLogger({
    service: SERVICE,
    event: "github_schedule.shutdown",
    signal,
    drainedDispatches,
  });
  operation.set({ outcome: "success" });
  operation.emit();
}
