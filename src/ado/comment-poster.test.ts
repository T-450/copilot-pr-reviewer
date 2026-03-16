import { describe, expect, it } from "bun:test";
import { severityIcon, formatThreadContent, createThread, listBotThreads, BOT_MARKER } from "./comment-poster";
import type { AdoClient, AdoThread } from "./types";
import type { Finding, ChangedFile } from "../shared/types";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    filePath: "src/foo.ts",
    startLine: 10,
    endLine: 12,
    severity: "warning",
    category: "correctness",
    title: "Some issue",
    message: "This is the message.",
    confidence: "high",
    fingerprint: "abc123",
    ...overrides,
  };
}

function makeFile(overrides: Partial<ChangedFile> = {}): ChangedFile {
  return {
    path: "src/foo.ts",
    absolutePath: "/repo/src/foo.ts",
    diff: "",
    changeType: "edit",
    changeTrackingId: 7,
    currentIteration: 3,
    previousIteration: 2,
    riskLevel: "NORMAL",
    testStatus: "not_applicable",
    ...overrides,
  };
}

function makeClient(overrides: Partial<AdoClient> = {}): AdoClient {
  return {
    get: <T>(_path: string) => Promise.resolve(undefined as unknown as T),
    post: <T>(_path: string, _body: unknown) => Promise.resolve(undefined as unknown as T),
    patch: <T>(_path: string, _body: unknown) => Promise.resolve(undefined as unknown as T),
    ...overrides,
  };
}

describe("severityIcon", () => {
  it("returns 🔴 for critical", () => {
    expect(severityIcon("critical")).toBe("🔴");
  });

  it("returns 🟡 for warning", () => {
    expect(severityIcon("warning")).toBe("🟡");
  });

  it("returns 🔵 for suggestion", () => {
    expect(severityIcon("suggestion")).toBe("🔵");
  });

  it("returns ⚪ for nitpick", () => {
    expect(severityIcon("nitpick")).toBe("⚪");
  });

  it("returns ⚪ for unknown severity", () => {
    expect(severityIcon("unknown")).toBe("⚪");
  });
});

describe("formatThreadContent", () => {
  it("includes bot marker", () => {
    const content = formatThreadContent(makeFinding());
    expect(content).toContain(BOT_MARKER);
  });

  it("includes fingerprint comment", () => {
    const content = formatThreadContent(makeFinding({ fingerprint: "fp42" }));
    expect(content).toContain("<!-- fingerprint:fp42 -->");
  });

  it("includes title with severity icon", () => {
    const content = formatThreadContent(makeFinding({ severity: "critical", title: "Bad thing" }));
    expect(content).toContain("### 🔴 Bad thing");
  });

  it("includes message", () => {
    const content = formatThreadContent(makeFinding({ message: "Do this instead." }));
    expect(content).toContain("Do this instead.");
  });

  it("includes suggestion block when suggestion is present", () => {
    const content = formatThreadContent(makeFinding({ suggestion: "Use Option<T> instead." }));
    expect(content).toContain("**Suggestion:**");
    expect(content).toContain("Use Option<T> instead.");
  });

  it("does not include suggestion block when suggestion is absent", () => {
    const finding = makeFinding();
    delete finding.suggestion;
    const content = formatThreadContent(finding);
    expect(content).not.toContain("**Suggestion:**");
  });

  it("includes severity, category, and confidence in footer", () => {
    const content = formatThreadContent(makeFinding({ severity: "warning", category: "security", confidence: "medium" }));
    expect(content).toContain("Severity: warning");
    expect(content).toContain("Category: security");
    expect(content).toContain("Confidence: medium");
  });
});

describe("createThread", () => {
  it("POSTs to the correct path", async () => {
    let capturedPath = "";
    const client = makeClient({
      post: <T>(path: string, _body: unknown) => {
        capturedPath = path;
        return Promise.resolve(undefined as unknown as T);
      },
    });

    await createThread(client, "55", makeFinding(), makeFile());

    expect(capturedPath).toBe("/pullRequests/55/threads");
  });

  it("sends threadContext with filePath and line positions", async () => {
    let capturedBody: unknown;
    const client = makeClient({
      post: <T>(_path: string, body: unknown) => {
        capturedBody = body;
        return Promise.resolve(undefined as unknown as T);
      },
    });

    await createThread(client, "1", makeFinding({ filePath: "src/bar.ts", startLine: 5, endLine: 8 }), makeFile());

    const body = capturedBody as Record<string, unknown>;
    const threadContext = body.threadContext as Record<string, unknown>;
    expect(threadContext.filePath).toBe("/src/bar.ts");
    expect((threadContext.rightFileStart as Record<string, number>).line).toBe(5);
    expect((threadContext.rightFileEnd as Record<string, number>).line).toBe(8);
  });

  it("sends pullRequestThreadContext with changeTrackingId and iteration context", async () => {
    let capturedBody: unknown;
    const client = makeClient({
      post: <T>(_path: string, body: unknown) => {
        capturedBody = body;
        return Promise.resolve(undefined as unknown as T);
      },
    });

    const file = makeFile({ changeTrackingId: 42, currentIteration: 5, previousIteration: 4 });
    await createThread(client, "1", makeFinding(), file);

    const body = capturedBody as Record<string, unknown>;
    const prCtx = body.pullRequestThreadContext as Record<string, unknown>;
    expect(prCtx.changeTrackingId).toBe(42);
    const iterCtx = prCtx.iterationContext as Record<string, number>;
    expect(iterCtx.firstComparingIteration).toBe(4);
    expect(iterCtx.secondComparingIteration).toBe(5);
  });

  it("includes formatted content in comment", async () => {
    let capturedBody: unknown;
    const client = makeClient({
      post: <T>(_path: string, body: unknown) => {
        capturedBody = body;
        return Promise.resolve(undefined as unknown as T);
      },
    });

    await createThread(client, "1", makeFinding({ fingerprint: "fpX" }), makeFile());

    const body = capturedBody as Record<string, unknown>;
    const comments = body.comments as Record<string, unknown>[];
    expect(typeof comments[0].content).toBe("string");
    expect((comments[0].content as string)).toContain("<!-- fingerprint:fpX -->");
  });
});

describe("listBotThreads", () => {
  it("returns only threads containing the bot marker", async () => {
    const threads: AdoThread[] = [
      {
        id: 1,
        status: "active",
        comments: [{ id: 1, content: `${BOT_MARKER}\nsome content`, commentType: "text", author: { displayName: "bot" } }],
      },
      {
        id: 2,
        status: "active",
        comments: [{ id: 2, content: "a human comment", commentType: "text", author: { displayName: "human" } }],
      },
      {
        id: 3,
        status: "active",
        comments: [{ id: 3, content: `${BOT_MARKER}\nanother bot`, commentType: "text", author: { displayName: "bot" } }],
      },
    ];

    const client = makeClient({
      get: <T>(_path: string) => Promise.resolve({ value: threads } as unknown as T),
    });

    const result = await listBotThreads(client, "10");

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual([1, 3]);
  });

  it("calls client.get with the correct path", async () => {
    let capturedPath = "";
    const client = makeClient({
      get: <T>(path: string) => {
        capturedPath = path;
        return Promise.resolve({ value: [] } as unknown as T);
      },
    });

    await listBotThreads(client, "77");

    expect(capturedPath).toBe("/pullRequests/77/threads");
  });

  it("returns empty array when no bot threads exist", async () => {
    const threads: AdoThread[] = [
      {
        id: 1,
        status: "active",
        comments: [{ id: 1, content: "just a human", commentType: "text", author: { displayName: "dev" } }],
      },
    ];

    const client = makeClient({
      get: <T>(_path: string) => Promise.resolve({ value: threads } as unknown as T),
    });

    const result = await listBotThreads(client, "1");

    expect(result).toHaveLength(0);
  });
});
