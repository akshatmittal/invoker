import { Cron } from "croner";
import { z } from "zod";

import type { GitHubScheduleDefinition } from "./types.js";

export const GITHUB_SCHEDULE_OWNER = "GitHub Schedule";

const inputSchema = z.union([z.string(), z.number().finite(), z.boolean()]);

const timezoneSchema = z.string().refine((timezone) => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}, "expected a valid IANA timezone");

const scheduleSchema = z.strictObject({
  cron: z.string().min(1),
  timezone: timezoneSchema.default("UTC"),
  repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  workflow: z.union([
    z.int().positive(),
    z
      .string()
      .min(1)
      .refine((value) => value.trim() === value && !value.includes("/")),
  ]),
  ref: z.string().refine((value) => value.trim() !== ""),
  inputs: z
    .record(z.string(), inputSchema)
    .refine((inputs) => Object.keys(inputs).length <= 25)
    .refine((inputs) => JSON.stringify(inputs).length <= 65_535)
    .optional(),
});

const definitionSchema = z.strictObject({
  app: z.strictObject({
    id: z.int().positive(),
    privateKey: z.string().min(1),
  }),
  schedules: z.array(scheduleSchema).min(1),
});

type Definition = z.infer<typeof definitionSchema>;

export type NormalizedSchedule = Definition["schedules"][number] & {
  owner: string;
  repo: string;
};

export type NormalizedDefinition = {
  app: Definition["app"];
  schedules: NormalizedSchedule[];
};

export function normalizeDefinition(value: GitHubScheduleDefinition): NormalizedDefinition {
  const result = definitionSchema.safeParse(value);
  if (!result.success) {
    throw new TypeError(`${GITHUB_SCHEDULE_OWNER}: ${z.prettifyError(result.error)}`);
  }

  const schedules = result.data.schedules.map((schedule, index) => {
    let validationJob: Cron | undefined;
    try {
      validationJob = new Cron(schedule.cron, {
        mode: "5-part",
        paused: true,
        timezone: schedule.timezone,
      });
      validationJob.nextRun();
    } catch {
      throw new TypeError(
        `${GITHUB_SCHEDULE_OWNER}.schedules[${index}].cron: expected a valid five-field cron expression`,
      );
    } finally {
      validationJob?.stop();
    }

    const separator = schedule.repository.indexOf("/");
    const owner = schedule.repository.slice(0, separator);
    const repo = schedule.repository.slice(separator + 1);
    return { ...schedule, owner, repo };
  });

  return { app: result.data.app, schedules };
}

export function workflowKey(schedule: Pick<NormalizedSchedule, "repository" | "workflow">): string {
  return `${schedule.repository}\0${String(schedule.workflow)}`;
}
