import { AuthError, RateLimitError, logPipelineWarning } from "../shared/errors";
import type { AdoClient } from "./types";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export function createAdoClient(
  orgUrl: string,
  project: string,
  repoId: string,
  pat: string,
  retryDelayMs: number = BASE_DELAY_MS,
): AdoClient {
  const baseUrl = `${orgUrl.replace(/\/$/, "")}/${project}/_apis/git/repositories/${repoId}`;
  const headers = {
    Authorization: `Basic ${btoa(":" + pat)}`,
    "Content-Type": "application/json",
  };

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const separator = path.includes("?") ? "&" : "?";
    const url = `${baseUrl}${path}${separator}api-version=7.1`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.status === 401) {
        logPipelineWarning("Azure DevOps PAT authentication failed — token may be expired or revoked.");
        throw new AuthError("ado", "Azure DevOps API returned 401 Unauthorized");
      }

      if (response.status === 429) {
        if (attempt < MAX_RETRIES) {
          const delay = retryDelayMs * Math.pow(2, attempt) + Math.random() * 500;
          await Bun.sleep(delay);
          continue;
        }
        throw new RateLimitError();
      }

      if (!response.ok) {
        throw new Error(`Azure DevOps API error: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as T;
    }

    throw new RateLimitError();
  }

  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
    patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  };
}
