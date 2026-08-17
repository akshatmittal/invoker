import type { GitHubScheduleDefinition } from "./github/types.js";

import { runGitHubSchedule } from "./github/scheduler.js";

export function defineGitHubSchedule(definition: GitHubScheduleDefinition): Promise<void> {
  return runGitHubSchedule(definition);
}
