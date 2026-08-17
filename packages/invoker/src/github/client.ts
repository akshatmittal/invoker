import { createAppAuth } from "@octokit/auth-app";
import { request } from "@octokit/request";
import { z } from "zod";

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
  readonly webUrl: string;
};

const dispatchResponseSchema = z.object({
  workflow_run_id: z.int().positive(),
  html_url: z.url(),
});

const requestFailureSchema = z.object({
  status: z.int().optional(),
  response: z
    .object({
      headers: z.object({ "x-github-request-id": z.string().optional() }),
    })
    .optional(),
});

const githubFailures = new WeakMap<Error, SafeFailure>();

export function createGitHubClient(app: NormalizedDefinition["app"], signal: AbortSignal) {
  const apiRequest = request.defaults({
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": API_VERSION,
    },
    request: { signal },
  });

  const auth = createAppAuth({
    appId: app.id,
    privateKey: app.privateKey,
    request: apiRequest,
    log: { warn() {} },
  });

  const resolveInstallation = async (target: NormalizedSchedule): Promise<number> => {
    try {
      const authentication = await auth({ type: "app" });
      const response = await apiRequest("GET /repos/{owner}/{repo}/installation", {
        owner: target.owner,
        repo: target.repo,
        headers: { authorization: `Bearer ${authentication.token}` },
      });
      return response.data.id;
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
      return authentication.token;
    } catch (error) {
      throw githubError(githubFailure(error, "create installation token", target));
    }
  };

  const resolveWorkflow = async (target: NormalizedSchedule, installationId: number): Promise<number> => {
    try {
      const token = await installationToken(target, installationId);
      const response = await apiRequest("GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}", {
        owner: target.owner,
        repo: target.repo,
        workflow_id: target.workflow,
        headers: { authorization: `Bearer ${token}` },
      });
      if (response.data.state !== "active") {
        throw new Error("workflow is not active");
      }
      return response.data.id;
    } catch (error) {
      throw githubError(githubFailure(error, "resolve workflow", target));
    }
  };

  const dispatch = async (target: RuntimeSchedule): Promise<DispatchResult> => {
    try {
      const token = await installationToken(target, target.installationId);
      const response = await apiRequest("POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches", {
        owner: target.owner,
        repo: target.repo,
        workflow_id: target.workflowId,
        ref: target.ref,
        return_run_details: true,
        inputs: target.inputs,
        headers: { authorization: `Bearer ${token}` },
      });
      const data = dispatchResponseSchema.parse(response.data);
      return {
        runId: data.workflow_run_id,
        webUrl: data.html_url,
      };
    } catch (error) {
      throw githubError(githubFailure(error, "dispatch workflow", target));
    }
  };

  return { dispatch, resolveInstallation, resolveWorkflow };
}

export function githubFailure(
  cause: unknown,
  operation: string,
  target?: Pick<NormalizedSchedule, "repository" | "workflow">,
): SafeFailure {
  if (cause instanceof Error) {
    const known = githubFailures.get(cause);
    if (known) {
      return known;
    }
  }

  const parsed = requestFailureSchema.safeParse(cause);
  const status = parsed.success ? parsed.data.status : undefined;
  const requestId = parsed.success ? parsed.data.response?.headers["x-github-request-id"] : undefined;
  const location = target ? ` for ${target.repository} workflow ${String(target.workflow)}` : "";
  const reason = status === 404 ? "not found or inaccessible" : "request failed";
  const message = `GitHub ${operation}${location}: ${reason}${status === undefined ? "" : ` (${status})`}${
    requestId === undefined ? "" : ` [request ${requestId}]`
  }`;

  return {
    message,
    operation,
    repository: target?.repository,
    workflow: target?.workflow,
    status,
    requestId,
  };
}

export function githubError(failure: SafeFailure): Error {
  const error = new Error(failure.message);
  githubFailures.set(error, failure);
  return error;
}
