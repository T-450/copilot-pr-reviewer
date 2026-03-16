import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import type { ReviewDeps } from "./review-orchestrator";
import type { ChangedFile, Finding, PrMetadata, ReviewConfig } from "../shared/types";
import type { AdoThread } from "../ado/types";
import { AuthError } from "../shared/errors";

const DEFAULT_CONFIG: ReviewConfig = {
  ignore: [],
  severityThreshold: "suggestion",
  maxFiles: 30,
  securityOverrides: [],
};

const TEST_PR_META: PrMetadata = {
  title: "Add feature",
  description: "Some PR",
  author: "dev",
  sourceBranch: "feature/x",
  targetBranch: "main",
  workItemIds: [123],
};

const TEST_FILE: ChangedFile = {
  path: "src/app.ts",
  absolutePath: "/repo/src/app.ts",
  diff: "+console.log('hi');",
  changeType: "edit",
  changeTrackingId: 1,
  currentIteration: 2,
  previousIteration: 1,
  riskLevel: "NORMAL",
  testStatus: "not_applicable",
};

const TEST_FINDING: Finding = {
  filePath: "src/app.ts",
  startLine: 1,
  endLine: 1,
  severity: "warning",
  category: "correctness",
  title: "Console log",
  message: "Remove console.log",
  confidence: "high",
  fingerprint: "abc123",
};

function createMockDeps(overrides: Partial<ReviewDeps> = {}): ReviewDeps {
  return {
    initTelemetry: mock(async () => async () => {}),
    getTracer: mock(() => ({
      startSpan: mock(() => ({ end: mock(() => {}), setAttribute: mock(() => {}) })),
    })) as any,
    loadConfig: mock(async () => DEFAULT_CONFIG),
    createAdoClient: mock(() => ({
      get: mock(async () => ({})),
      post: mock(async () => ({})),
      patch: mock(async () => ({})),
    })) as any,
    fetchIncrementalChanges: mock(async () => [TEST_FILE]),
    fetchPRMetadata: mock(async () => TEST_PR_META),
    listBotThreads: mock(async () => [] as AdoThread[]),
    classifyRisk: mock(() => "NORMAL" as const),
    detectTestCompanion: mock(async () => "not_applicable" as const),
    filterFiles: mock((files: ChangedFile[]) => ({
      included: files,
      skipped: [],
    })),
    generateRepoMap: mock(async () => "src/\n  app.ts"),
    reviewFiles: mock(async () => [TEST_FINDING]),
    filterBySeverity: mock((findings: Finding[]) => findings),
    reconcileAndPublish: mock(async () => ({
      created: 1,
      resolved: 0,
      skipped: 0,
    })),
    populateDiffs: mock(async (files: ChangedFile[]) => files),
    reviewMetrics: {
      files: { add: mock(() => {}) },
      findings: { add: mock(() => {}) },
      findingsPerRun: { record: mock(() => {}) },
      filesPerRun: { record: mock(() => {}) },
      threadActions: { add: mock(() => {}) },
      reviewDuration: { record: mock(() => {}) },
      runs: { add: mock(() => {}) },
      errors: { add: mock(() => {}) },
    } as any,
    events: {
      reviewStarted: mock(() => {}),
      reviewCompleted: mock(() => {}),
      reviewFailed: mock(() => {}),
      configLoaded: mock(() => {}),
      configDefaulted: mock(() => {}),
      filesFiltered: mock(() => {}),
      fileReviewed: mock(() => {}),
      findingEmitted: mock(() => {}),
      findingSuppressed: mock(() => {}),
      threadCreated: mock(() => {}),
      threadUpdated: mock(() => {}),
      threadResolved: mock(() => {}),
      threadSkipped: mock(() => {}),
      authFailed: mock(() => {}),
      rateLimited: mock(() => {}),
    },
    logPipelineWarning: mock(() => {}),
    ...overrides,
  };
}

function setEnvVars() {
  process.env.ADO_PAT = "test-pat";
  process.env.ADO_ORG = "test-org";
  process.env.ADO_PROJECT = "test-project";
  process.env.ADO_REPO_ID = "test-repo";
  process.env.ADO_PR_ID = "42";
  process.env.REPO_ROOT = "/repo";
}

function clearEnvVars() {
  delete process.env.ADO_PAT;
  delete process.env.ADO_ORG;
  delete process.env.ADO_PROJECT;
  delete process.env.ADO_REPO_ID;
  delete process.env.ADO_PR_ID;
  delete process.env.REPO_ROOT;
  delete process.env.CONFIG_PATH;
  delete process.env.SEVERITY_THRESHOLD;
  delete process.env.MAX_FILES;
}

describe("runReview", () => {
  beforeEach(setEnvVars);
  afterEach(clearEnvVars);

  it("happy path: config → files → review → publish → exit 0", async () => {
    const { runReview } = await import("./review-orchestrator");
    const deps = createMockDeps();

    await runReview(deps);

    expect(deps.loadConfig).toHaveBeenCalledTimes(1);
    expect(deps.fetchIncrementalChanges).toHaveBeenCalledTimes(1);
    expect(deps.fetchPRMetadata).toHaveBeenCalledTimes(1);
    expect(deps.listBotThreads).toHaveBeenCalledTimes(1);
    expect(deps.classifyRisk).toHaveBeenCalled();
    expect(deps.detectTestCompanion).toHaveBeenCalled();
    expect(deps.filterFiles).toHaveBeenCalledTimes(1);
    expect(deps.generateRepoMap).toHaveBeenCalledTimes(1);
    expect(deps.reviewFiles).toHaveBeenCalledTimes(1);
    expect(deps.filterBySeverity).toHaveBeenCalledTimes(1);
    expect(deps.reconcileAndPublish).toHaveBeenCalledTimes(1);
    expect(deps.events.reviewStarted).toHaveBeenCalledTimes(1);
    expect(deps.events.reviewCompleted).toHaveBeenCalledTimes(1);
  });

  it("auth error: 401 → pipeline warning → exit 0 (no throw)", async () => {
    const { runReview } = await import("./review-orchestrator");
    const deps = createMockDeps({
      fetchPRMetadata: mock(async () => {
        throw new AuthError("ado", "401 Unauthorized");
      }),
    });

    // Should NOT throw
    await runReview(deps);

    expect(deps.logPipelineWarning).toHaveBeenCalled();
    expect(deps.events.authFailed).toHaveBeenCalledTimes(1);
    expect(deps.reviewFiles).not.toHaveBeenCalled();
  });

  it("empty diff: no review session → exit 0", async () => {
    const { runReview } = await import("./review-orchestrator");
    const deps = createMockDeps({
      fetchIncrementalChanges: mock(async () => []),
    });

    await runReview(deps);

    expect(deps.reviewFiles).not.toHaveBeenCalled();
    expect(deps.reconcileAndPublish).not.toHaveBeenCalled();
    expect(deps.events.reviewCompleted).toHaveBeenCalledTimes(1);
  });

  it("missing config: defaults used", async () => {
    const { runReview } = await import("./review-orchestrator");
    const deps = createMockDeps();

    await runReview(deps);

    expect(deps.loadConfig).toHaveBeenCalledWith(".prreviewer.yml");
  });

  it("uses CONFIG_PATH env var when set", async () => {
    const { runReview } = await import("./review-orchestrator");
    process.env.CONFIG_PATH = "custom.yml";
    const deps = createMockDeps();

    await runReview(deps);

    expect(deps.loadConfig).toHaveBeenCalledWith("custom.yml");
  });

  it("MAX_FILES env var overrides config maxFiles", async () => {
    const { runReview } = await import("./review-orchestrator");
    process.env.MAX_FILES = "10";
    let capturedConfig: ReviewConfig | undefined;
    const deps = createMockDeps({
      filterFiles: mock((files: ChangedFile[], config: ReviewConfig) => {
        capturedConfig = config;
        return { included: files, skipped: [] };
      }),
    });

    await runReview(deps);

    expect(capturedConfig?.maxFiles).toBe(10);
  });

  it("generic error → pipeline warning → exit 0 (no throw)", async () => {
    const { runReview } = await import("./review-orchestrator");
    const deps = createMockDeps({
      reviewFiles: mock(async () => {
        throw new Error("Something broke");
      }),
    });

    await runReview(deps);

    expect(deps.logPipelineWarning).toHaveBeenCalled();
    expect(deps.events.reviewFailed).toHaveBeenCalledTimes(1);
    expect(deps.reviewMetrics.errors.add).toHaveBeenCalledWith(1);
  });
});
