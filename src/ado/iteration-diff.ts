import type { AdoClient, AdoIteration, AdoIterationChange } from "./types";
import type { ChangedFile } from "../shared/types";

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".eot",
  ".mp3", ".mp4",
  ".zip", ".tar", ".gz",
  ".dll", ".exe", ".bin",
  ".pdf",
]);

function isBinary(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  for (const ext of BINARY_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return true;
    }
  }
  return false;
}

/**
 * Sanitizes an ADO-supplied path by stripping the leading slash and rejecting
 * any path that contains `..` segments, which would allow traversal outside repoRoot.
 * Returns null if the path is unsafe.
 */
function sanitizeAdoPath(adoPath: string): string | null {
  const stripped = adoPath.startsWith("/") ? adoPath.slice(1) : adoPath;
  // Reject any segment that is ".." to prevent directory traversal
  if (stripped.split("/").some((seg) => seg === "..")) {
    return null;
  }
  return stripped;
}

export async function fetchIncrementalChanges(
  client: AdoClient,
  prId: string,
  repoRoot: string,
): Promise<ChangedFile[]> {
  const { value: iterations } = await client.get<{ value: AdoIteration[] }>(
    `/pullRequests/${prId}/iterations`,
  );

  const currentIteration = iterations[iterations.length - 1].id;
  const previousIteration = iterations.length > 1 ? iterations[iterations.length - 2].id : 0;

  const { changeEntries } = await client.get<{ changeEntries: AdoIterationChange[] }>(
    `/pullRequests/${prId}/iterations/${currentIteration}/changes?compareTo=${previousIteration}`,
  );

  const root = repoRoot.endsWith("/") ? repoRoot.slice(0, -1) : repoRoot;
  const results: ChangedFile[] = [];

  for (const c of changeEntries) {
    if (c.changeType === "rename" || c.changeType === "delete") continue;
    if (isBinary(c.item.path)) continue;

    const path = sanitizeAdoPath(c.item.path);
    if (path === null) continue;

    results.push({
      path,
      absolutePath: `${root}/${path}`,
      diff: "",
      changeType: c.changeType === "add" ? "add" : "edit",
      changeTrackingId: c.changeTrackingId,
      currentIteration,
      previousIteration,
      riskLevel: "NORMAL",
      testStatus: "not_applicable",
    });
  }

  return results;
}
