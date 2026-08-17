import { createAppAuth } from "@octokit/auth-app";
import { request } from "@octokit/request";

import type { NormalizedDefinition, NormalizedSchedule } from "./config.js";

const API_VERSION = "2026-03-10";

export type RuntimeSchedule = NormalizedSchedule & {
  readonly installationId: number;
  readonly workflowId: number;
};

export type SafeFailure = {
  readonly message: string;
  readonly operation: string;
  readonly repository?: string;
  readonly workflow?: string | number;
  readonly status?: number;
  readonly requestId?: string;
};

export type DispatchResult = {
  readonly runId: number;
  readonly apiUrl: string;
  readonly webUrl: string;
};

type ApiResponse = {
  readonly status: number;
  readonly data: unknown;
  readonly headers: Record<string, string | number | undefined>;
};

const githubFailures = new WeakMap<Error, SafeFailure>();

export function createGitHubClient(app: NormalizedDefinition["app"], signal: AbortSignal) {
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

export function githubFailure(
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

export function githubError(failure: SafeFailure): Error {
  const error = new Error(failure.message);
  githubFailures.set(error, failure);
  return error;
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
