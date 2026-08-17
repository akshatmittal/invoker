import { Cron } from "croner";
import { z } from "zod";

export const GITHUB_SCHEDULE_OWNER = "GitHub Schedule";

const inputSchema = z.union([z.string(), z.number().finite(), z.boolean()]);

const scheduleSchema = z.object({
  cron: z.string().min(1),
  timezone: z.string().min(1).default("UTC"),
  repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  workflow: z.union([
    z.int().positive(),
    z
      .string()
      .min(1)
      .refine((value) => value.trim() === value && !value.includes("/")),
  ]),
  ref: z.string().min(1),
  inputs: z
    .record(z.string(), inputSchema)
    .refine((inputs) => Object.keys(inputs).length <= 25)
    .refine((inputs) => JSON.stringify(inputs).length <= 65_535)
    .optional(),
});

const definitionSchema = z.object({
  app: z.object({
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

export function normalizeDefinition(value: unknown): NormalizedDefinition {
  try {
    const definition = definitionSchema.parse(value);
    const schedules = definition.schedules.map((schedule) => {
      let validationJob: Cron | undefined;
      try {
        validationJob = new Cron(schedule.cron, {
          mode: "5-part",
          paused: true,
          timezone: schedule.timezone,
        });
        validationJob.nextRun();
      } finally {
        validationJob?.stop();
      }

      const [owner, repo] = schedule.repository.split("/") as [string, string];
      return { ...schedule, owner, repo };
    });

    return { app: definition.app, schedules };
  } catch {
    throw new TypeError(`${GITHUB_SCHEDULE_OWNER}: invalid configuration`);
  }
}

export function workflowKey(schedule: Pick<NormalizedSchedule, "repository" | "workflow">): string {
  return `${schedule.repository}\0${String(schedule.workflow)}`;
}
