import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ChangedFile, PrMetadata, ReviewConfig } from "../shared/types";

// Capture tool handler so tests can invoke it directly
let capturedToolHandler: ((args: unknown) => Promise<unknown>) | null = null;
let capturedOnPreToolUse: ((input: { toolName: string; toolArgs: unknown; timestamp: number; cwd: string }) => Promise<unknown>) | null = null;

const mockSendAndWait = mock(() => Promise.resolve(undefined));
const mockDisconnect = mock(() => Promise.resolve());
const mockStop = mock(() => Promise.resolve([]));

const mockCreateSession = mock(
  (config: {
    model?: string;
    systemMessage?: { content: string; mode?: string };
    tools?: { name: string; handler: (args: unknown) => Promise<unknown> }[];
    hooks?: { onPreToolUse?: (input: { toolName: string; toolArgs: unknown; timestamp: number; cwd: string }) => Promise<unknown> };
  }) => {
    // Capture the emit_finding tool handler for later use in tests
    const emitFindingTool = config.tools?.find((t) => t.name === "emit_finding");
    capturedToolHandler = emitFindingTool?.handler ?? null;
    capturedOnPreToolUse = config.hooks?.onPreToolUse ?? null;
    return Promise.resolve({
      sendAndWait: mockSendAndWait,
      disconnect: mockDisconnect,
    });
  },
);

mock.module("@github/copilot-sdk", () => ({
  CopilotClient: class {
    constructor() {}
    createSession = mockCreateSession;
    stop = mockStop;
  },
  defineTool: (name: string, config: { description: string; parameters: unknown; handler: (args: unknown) => Promise<unknown> }) => ({
    name,
    ...config,
  }),
  approveAll: async () => ({ decision: "allow" }),
}));

// Import AFTER mock.module so the mock is in place
const { reviewFiles } = await import("./review-session");

const prMeta: PrMetadata = {
  title: "Fix auth bug",
  description: "Fixes token validation",
  author: "alice",
  sourceBranch: "fix/auth",
  targetBranch: "main",
  workItemIds: [],
};

const config: ReviewConfig = {
  ignore: [],
  severityThreshold: "suggestion",
  maxFiles: 50,
  securityOverrides: [],
};

const makeFile = (path: string): ChangedFile => ({
  path,
  absolutePath: `/repo/${path}`,
  diff: `+const x = 1;`,
  changeType: "edit",
  changeTrackingId: 1,
  currentIteration: 2,
  previousIteration: 1,
  riskLevel: "NORMAL",
  testStatus: "not_applicable",
});

describe("reviewFiles", () => {
  beforeEach(() => {
    mockSendAndWait.mockClear();
    mockDisconnect.mockClear();
    mockStop.mockClear();
    mockCreateSession.mockClear();
    capturedToolHandler = null;
    capturedOnPreToolUse = null;
  });

  it("calls createSession with correct model and system message content", async () => {
    await reviewFiles([makeFile("src/index.ts")], prMeta, config, "src/\n  index.ts");
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    const callArg = mockCreateSession.mock.calls[0][0];
    expect(callArg.model).toBe("gpt-4.1");
    expect(callArg.systemMessage.content).toContain("Fix auth bug");
    expect(callArg.systemMessage.mode).toBe("append");
  });

  it("calls sendAndWait once per file", async () => {
    const files = [makeFile("src/a.ts"), makeFile("src/b.ts"), makeFile("src/c.ts")];
    await reviewFiles(files, prMeta, config, "");
    expect(mockSendAndWait).toHaveBeenCalledTimes(3);
  });

  it("passes file path, risk, and diff in user message prompt", async () => {
    await reviewFiles([makeFile("src/auth/service.ts")], prMeta, config, "");
    const promptArg = mockSendAndWait.mock.calls[0][0];
    expect(promptArg.prompt).toContain("src/auth/service.ts");
    expect(promptArg.prompt).toContain("NORMAL");
    expect(promptArg.prompt).toContain("+const x = 1;");
  });

  it("passes file attachments to sendAndWait", async () => {
    await reviewFiles([makeFile("src/auth/service.ts")], prMeta, config, "");
    const callArg = mockSendAndWait.mock.calls[0][0];
    expect(callArg.attachments).toEqual([
      { type: "file", path: "/repo/src/auth/service.ts", displayName: "src/auth/service.ts" },
    ]);
  });

  it("calls disconnect() and stop() after processing", async () => {
    await reviewFiles([makeFile("src/index.ts")], prMeta, config, "");
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it("calls disconnect() and stop() even if sendAndWait throws", async () => {
    mockSendAndWait.mockImplementationOnce(() => Promise.reject(new Error("network error")));
    await expect(reviewFiles([makeFile("src/index.ts")], prMeta, config, "")).rejects.toThrow("network error");
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it("collects findings when emit_finding tool handler is invoked with valid data", async () => {
    const validFinding = {
      filePath: "src/index.ts",
      startLine: 1,
      endLine: 5,
      severity: "warning",
      category: "security",
      title: "Potential injection",
      message: "User input is not sanitized.",
      confidence: "high",
    };

    // Simulate the model calling emit_finding mid-review
    mockSendAndWait.mockImplementationOnce(async () => {
      if (capturedToolHandler) {
        await capturedToolHandler(validFinding);
      }
      return undefined;
    });

    const findings = await reviewFiles([makeFile("src/index.ts")], prMeta, config, "");
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("Potential injection");
    expect(findings[0].severity).toBe("warning");
  });

  it("adds a fingerprint to collected findings", async () => {
    const validFinding = {
      filePath: "src/index.ts",
      startLine: 1,
      endLine: 5,
      severity: "warning",
      category: "security",
      title: "Missing validation",
      message: "Input not validated.",
      confidence: "high",
    };

    mockSendAndWait.mockImplementationOnce(async () => {
      if (capturedToolHandler) {
        await capturedToolHandler(validFinding);
      }
      return undefined;
    });

    const findings = await reviewFiles([makeFile("src/index.ts")], prMeta, config, "");
    expect(findings).toHaveLength(1);
    expect(findings[0].fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("ignores malformed findings from the tool handler", async () => {
    const malformedFinding = { filePath: "src/index.ts" }; // missing required fields

    mockSendAndWait.mockImplementationOnce(async () => {
      if (capturedToolHandler) {
        await capturedToolHandler(malformedFinding);
      }
      return undefined;
    });

    const findings = await reviewFiles([makeFile("src/index.ts")], prMeta, config, "");
    expect(findings).toHaveLength(0);
  });

  it("returns empty array when no files provided", async () => {
    const findings = await reviewFiles([], prMeta, config, "");
    expect(findings).toHaveLength(0);
    expect(mockSendAndWait).not.toHaveBeenCalled();
  });
});
