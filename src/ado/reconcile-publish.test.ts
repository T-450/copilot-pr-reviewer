import { describe, it, expect, mock, beforeEach } from "bun:test";
import { reconcileAndPublish } from "./reconcile-publish";
import type { AdoClient, AdoThread } from "./types";
import type { Finding, ChangedFile } from "../shared/types";
import { BOT_MARKER } from "./comment-poster";

function makeClient(): { client: AdoClient; postCalls: unknown[]; patchCalls: unknown[] } {
  const postCalls: unknown[] = [];
  const patchCalls: unknown[] = [];
  const client: AdoClient = {
    get: mock(async () => ({ value: [] })),
    post: mock(async (_path: string, body: unknown) => {
      postCalls.push({ _path, body });
    }),
    patch: mock(async (_path: string, body: unknown) => {
      patchCalls.push({ _path, body });
    }),
  };
  return { client, postCalls, patchCalls };
}

function makeFile(path: string, changeTrackingId: number): ChangedFile {
  return {
    path,
    absolutePath: `/repo/${path}`,
    diff: "",
    changeType: "edit",
    changeTrackingId,
    currentIteration: 2,
    previousIteration: 1,
    riskLevel: "NORMAL",
    testStatus: "not_applicable",
  };
}

function makeFinding(filePath: string, fingerprint: string): Finding {
  return {
    filePath,
    startLine: 10,
    endLine: 10,
    severity: "warning",
    category: "correctness",
    title: "Test finding",
    message: "A message",
    confidence: "high",
    fingerprint,
  };
}

function makeExistingThread(id: number, fingerprint: string, changeTrackingId: number): AdoThread {
  return {
    id,
    status: "active",
    threadContext: { filePath: "/src/a.ts" },
    comments: [
      {
        id: 1,
        content: `${BOT_MARKER}\n<!-- fingerprint:${fingerprint} -->\nsome content`,
        commentType: "text",
        author: { displayName: "bot" },
      },
    ],
    pullRequestThreadContext: { changeTrackingId },
  };
}

describe("reconcileAndPublish", () => {
  it("creates new threads, resolves outdated ones, deduplicates existing", async () => {
    const { client, postCalls, patchCalls } = makeClient();

    const files: ChangedFile[] = [
      makeFile("src/a.ts", 1),
      makeFile("src/b.ts", 2),
    ];

    // Findings: 2 new + 1 that already exists (dedup)
    const findings: Finding[] = [
      makeFinding("src/a.ts", "fp-new-1"),
      makeFinding("src/b.ts", "fp-new-2"),
      makeFinding("src/a.ts", "fp-existing"),
    ];

    // Existing threads: 1 matching a finding (dedup), 1 stale (to resolve)
    const existingThreads: AdoThread[] = [
      makeExistingThread(101, "fp-existing", 1),  // matches fp-existing → skip
      makeExistingThread(102, "fp-stale", 2),      // unmatched + in current diff → resolve
    ];

    const result = await reconcileAndPublish(client, "42", existingThreads, findings, files);

    expect(result.created).toBe(2);
    expect(result.resolved).toBe(1);
    expect(result.skipped).toBe(1);

    // 2 posts for new threads
    expect(client.post).toHaveBeenCalledTimes(2);
    // 1 patch for resolved thread
    expect(client.patch).toHaveBeenCalledTimes(1);

    // Verify the patch targeted the stale thread
    expect(patchCalls[0]).toMatchObject({ _path: "/pullRequests/42/threads/102" });
  });

  it("returns zero counts when there is nothing to do", async () => {
    const { client } = makeClient();

    const result = await reconcileAndPublish(client, "1", [], [], []);

    expect(result).toEqual({ created: 0, resolved: 0, skipped: 0 });
    expect(client.post).not.toHaveBeenCalled();
    expect(client.patch).not.toHaveBeenCalled();
  });
});
