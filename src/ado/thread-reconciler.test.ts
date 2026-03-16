import { describe, expect, it } from "bun:test";
import { reconcileThreads } from "./thread-reconciler";
import type { AdoThread } from "./types";
import type { Finding, ChangedFile } from "../shared/types";

function makeThread(id: number, fingerprint: string, changeTrackingId?: number): AdoThread {
  return {
    id,
    status: "active",
    comments: [
      {
        id: 1,
        content: `<!-- copilot-pr-reviewer-bot -->\n<!-- fingerprint:${fingerprint} -->`,
        commentType: "text",
        author: { displayName: "bot" },
      },
    ],
    pullRequestThreadContext: changeTrackingId !== undefined ? { changeTrackingId } : undefined,
  };
}

function makeFinding(fingerprint: string, filePath = "src/foo.ts"): Finding {
  return {
    filePath,
    startLine: 1,
    endLine: 5,
    severity: "warning",
    category: "correctness",
    title: "Test finding",
    message: "Some message",
    confidence: "high",
    fingerprint,
  };
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

describe("reconcileThreads", () => {
  it("same fingerprint reproduced → in toSkip, not in toCreate", () => {
    const existingThreads = [makeThread(10, "fp-abc", 1)];
    const newFindings = [makeFinding("fp-abc")];
    const files = [makeFile("src/foo.ts", 1)];

    const result = reconcileThreads(existingThreads, newFindings, files);

    expect(result.toSkip).toHaveLength(1);
    expect(result.toSkip[0].fingerprint).toBe("fp-abc");
    expect(result.toCreate).toHaveLength(0);
    expect(result.toResolve).toHaveLength(0);
  });

  it("new fingerprint on same location, old absent → new in toCreate, old in toResolve", () => {
    const existingThreads = [makeThread(10, "fp-old", 1)];
    const newFindings = [makeFinding("fp-new")];
    const files = [makeFile("src/foo.ts", 1)];

    const result = reconcileThreads(existingThreads, newFindings, files);

    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0].fingerprint).toBe("fp-new");
    expect(result.toResolve).toContain(10);
    expect(result.toSkip).toHaveLength(0);
  });

  it("old fingerprint, no new findings on location → old in toResolve", () => {
    const existingThreads = [makeThread(10, "fp-gone", 1)];
    const newFindings: Finding[] = [];
    const files = [makeFile("src/foo.ts", 1)];

    const result = reconcileThreads(existingThreads, newFindings, files);

    expect(result.toResolve).toContain(10);
    expect(result.toCreate).toHaveLength(0);
    expect(result.toSkip).toHaveLength(0);
  });

  it("old thread on different changeTrackingId (not in current diff) → NOT in toResolve", () => {
    const existingThreads = [makeThread(10, "fp-other-iter", 99)];
    const newFindings: Finding[] = [];
    const files = [makeFile("src/foo.ts", 1)]; // changeTrackingId 1, not 99

    const result = reconcileThreads(existingThreads, newFindings, files);

    expect(result.toResolve).not.toContain(10);
    expect(result.toCreate).toHaveLength(0);
    expect(result.toSkip).toHaveLength(0);
  });

  it("brand new file with findings → all in toCreate", () => {
    const existingThreads: AdoThread[] = [];
    const newFindings = [makeFinding("fp-1", "src/new.ts"), makeFinding("fp-2", "src/new.ts")];
    const files = [makeFile("src/new.ts", 5)];

    const result = reconcileThreads(existingThreads, newFindings, files);

    expect(result.toCreate).toHaveLength(2);
    expect(result.toCreate.map((f) => f.fingerprint)).toEqual(["fp-1", "fp-2"]);
    expect(result.toResolve).toHaveLength(0);
    expect(result.toSkip).toHaveLength(0);
  });

  it("thread without changeTrackingId is not resolved", () => {
    const thread: AdoThread = {
      id: 20,
      status: "active",
      comments: [
        {
          id: 1,
          content: "<!-- copilot-pr-reviewer-bot -->\n<!-- fingerprint:fp-no-ctx -->",
          commentType: "text",
          author: { displayName: "bot" },
        },
      ],
      // no pullRequestThreadContext
    };
    const newFindings: Finding[] = [];
    const files = [makeFile("src/foo.ts", 1)];

    const result = reconcileThreads([thread], newFindings, files);

    expect(result.toResolve).not.toContain(20);
  });
});
