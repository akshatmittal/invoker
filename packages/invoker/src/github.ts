import { createAppAuth } from "@octokit/auth-app";
import { request } from "@octokit/request";
import { Cron } from "croner";
import { createLogger } from "evlog";

import type { NormalizedDefinition, NormalizedSchedule } from "./github/config.js";

import { GITHUB_SCHEDULE_OWNER as OWNER, localError, normalizeDefinition, workflowKey } from "./github/config.js";

const API_VERSION = "2026-03-10";
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

type RuntimeSchedule = NormalizedSchedule & {
  readonly installationId: number;
  readonly workflowId: number;
};

type SafeFailure = {
  readonly message: string;
  readonly operation: string;
  readonly repository?: string;
  readonly workflow?: string | number;
  readonly status?: number;
  readonly requestId?: string;
};

type ApiResponse = {
  readonly status: number;
  readonly data: unknown;
  readonly headers: Record<string, string | number | undefined>;
};

type DispatchResult = {
  readonly runId: number;
  readonly apiUrl: string;
  readonly webUrl: string;
};

const githubFailures = new WeakMap<Error, SafeFailure>();
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

function createGitHubClient(app: GitHubScheduleDefinition["app"], signal: AbortSignal) {
  const apiRequest = request.defaults({
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": API_VERSION,
    },
    request: { signal },
  });

  let auth: ReturnType<typeof createAppAuth>;
  try {
    auth = createAppAuth({
      appId: app.id,
      privateKey: app.privateKey,
      request: apiRequest,
      log: { warn() {} },
    });
  } catch (error) {
    throw githubError(githubFailure(error, "authenticate App"));
  }

  const authenticate = async (): Promise<void> => {
    try {
      const authentication = await auth({ type: "app" });
      if (
        authentication.type !== "app" ||
        String(authentication.appId) !== String(app.id) ||
        typeof authentication.token !== "string" ||
        authentication.token === "" ||
        !isFutureDate(authentication.expiresAt)
      ) {
        throw new Error("invalid App authentication");
      }
    } catch (error) {
      throw githubError(githubFailure(error, "authenticate App"));
    }
  };

  const resolveInstallation = async (target: NormalizedSchedule): Promise<number> => {
    try {
      const authentication = await auth({ type: "app" });
      const response = (await apiRequest("GET /repos/{owner}/{repo}/installation", {
        owner: target.owner,
        repo: target.repo,
        headers: { authorization: `Bearer ${authentication.token}` },
      })) as unknown as ApiResponse;
      const data = responseObject(response);
      if (
        !Number.isSafeInteger(data.id) ||
        (data.id as number) <= 0 ||
        data.suspended_at !== null ||
        !isRecord(data.permissions) ||
        data.permissions.actions !== "write"
      ) {
        throw new Error("invalid installation response");
      }
      return data.id as number;
    } catch (error) {
      throw githubError(githubFailure(error, "resolve installation", target));
    }
  };

  const installationToken = async (target: NormalizedSchedule, installationId: number): Promise<string> => {
    try {
      const authentication = await auth({
        type: "installation",
        installationId,
        repositoryNames: [target.repo],
        permissions: { actions: "write" },
      });
      if (
        authentication.type !== "token" ||
        authentication.installationId !== installationId ||
        typeof authentication.token !== "string" ||
        authentication.token === "" ||
        !isFutureDate(authentication.expiresAt) ||
        authentication.permissions.actions !== "write" ||
        !authentication.repositoryNames?.includes(target.repo)
      ) {
        throw new Error("invalid installation authentication");
      }
      return authentication.token;
    } catch (error) {
      throw githubError(githubFailure(error, "create installation token", target));
    }
  };

  const resolveWorkflow = async (target: NormalizedSchedule, token: string): Promise<number> => {
    try {
      const response = (await apiRequest("GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}", {
        owner: target.owner,
        repo: target.repo,
        workflow_id: target.workflow,
        headers: { authorization: `Bearer ${token}` },
      })) as unknown as ApiResponse;
      const data = responseObject(response);
      if (!Number.isSafeInteger(data.id) || (data.id as number) <= 0 || data.state !== "active") {
        throw new Error("invalid workflow response");
      }
      return data.id as number;
    } catch (error) {
      throw githubError(githubFailure(error, "resolve workflow", target));
    }
  };

  const dispatch = async (target: RuntimeSchedule): Promise<DispatchResult> => {
    try {
      const token = await installationToken(target, target.installationId);
      const response = (await apiRequest("POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches", {
        owner: target.owner,
        repo: target.repo,
        workflow_id: target.workflowId,
        ref: target.ref,
        return_run_details: true,
        ...(target.inputs === undefined ? {} : { inputs: target.inputs }),
        headers: { authorization: `Bearer ${token}` },
      })) as unknown as ApiResponse;
      const data = responseObject(response);
      if (
        response.status !== 200 ||
        !Number.isSafeInteger(data.workflow_run_id) ||
        (data.workflow_run_id as number) <= 0 ||
        !isHttpsUrl(data.run_url) ||
        !isHttpsUrl(data.html_url)
      ) {
        throw new Error("invalid dispatch response");
      }
      return {
        runId: data.workflow_run_id as number,
        apiUrl: data.run_url,
        webUrl: data.html_url,
      };
    } catch (error) {
      throw githubError(githubFailure(error, "dispatch workflow", target));
    }
  };

  return { authenticate, dispatch, installationToken, resolveInstallation, resolveWorkflow };
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

function githubFailure(
  error: unknown,
  operation: string,
  target?: Pick<NormalizedSchedule, "repository" | "workflow">,
): SafeFailure {
  if (error instanceof Error) {
    const known = githubFailures.get(error);
    if (known) {
      return known;
    }
  }

  const source = isRecord(error) ? error : undefined;
  const response = source && isRecord(source.response) ? source.response : undefined;
  const headers = response && isRecord(response.headers) ? response.headers : undefined;
  const status = typeof source?.status === "number" && Number.isInteger(source.status) ? source.status : undefined;
  const requestId = typeof headers?.["x-github-request-id"] === "string" ? headers["x-github-request-id"] : undefined;
  const location = target
    ? ` for ${target.repository}${target.workflow === undefined ? "" : ` workflow ${String(target.workflow)}`}`
    : "";
  const reason = status === 404 ? "not found or inaccessible" : "request failed";
  const message = `GitHub ${operation}${location}: ${reason}${status === undefined ? "" : ` (${status})`}${
    requestId === undefined ? "" : ` [request ${requestId}]`
  }`;

  return {
    message,
    operation,
    ...(target === undefined ? {} : { repository: target.repository, workflow: target.workflow }),
    ...(status === undefined ? {} : { status }),
    ...(requestId === undefined ? {} : { requestId }),
  };
}

function githubError(failure: SafeFailure): Error {
  const error = new Error(failure.message);
  githubFailures.set(error, failure);
  return error;
}

function localFailure(error: unknown): SafeFailure {
  return {
    message: error instanceof Error ? error.message : `${OWNER}: startup validation failed`,
    operation: "validate configuration",
  };
}

function responseObject(response: ApiResponse): Record<string, unknown> {
  if (!Number.isInteger(response.status) || !isRecord(response.data) || !isRecord(response.headers)) {
    throw new Error("invalid GitHub response");
  }
  return response.data;
}

function isFutureDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now();
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
