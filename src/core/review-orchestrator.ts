import { context, trace, type Tracer } from "@opentelemetry/api";
import type { AdoClient, AdoThread } from "../ado/types";
import type { ChangedFile, Finding, PrMetadata, ReviewConfig, RiskLevel, Severity, SecurityOverride, TestStatus } from "../shared/types";
import type { PublishResult } from "../ado/reconcile-publish";


import { initTelemetry, getTracer } from "../telemetry/instrumentation";
import { reviewMetrics } from "../telemetry/metrics";
import { events } from "../telemetry/events";
import { loadConfig } from "../config/load-config";
import { createAdoClient } from "../ado/client";
import { fetchPRMetadata } from "../ado/pr-metadata";
import { fetchIncrementalChanges } from "../ado/iteration-diff";
import { listBotThreads } from "../ado/comment-poster";
import { classifyRisk } from "../repo/security-tagger";
import { detectTestCompanion } from "../repo/test-companion";
import { generateRepoMap } from "../repo/repo-map";
import { reviewFiles } from "../copilot/review-session";
import { filterBySeverity } from "./severity-filter";
import { filterFiles } from "./file-filter";
import { reconcileAndPublish } from "../ado/reconcile-publish";
import { populateDiffs } from "../ado/diff-fetcher";
import { AuthError, logPipelineWarning } from "../shared/errors";

export type ReviewDeps = {
  initTelemetry: () => Promise<() => Promise<void>>;
  getTracer: (name?: string) => Tracer;
  loadConfig: (configPath: string) => Promise<ReviewConfig>;
  createAdoClient: (orgUrl: string, project: string, repoId: string, pat: string) => AdoClient;
  fetchIncrementalChanges: (client: AdoClient, prId: string, repoRoot: string) => Promise<ChangedFile[]>;
  fetchPRMetadata: (client: AdoClient, prId: string) => Promise<PrMetadata>;
  listBotThreads: (client: AdoClient, prId: string) => Promise<AdoThread[]>;
  classifyRisk: (filePath: string, overrides?: SecurityOverride[]) => RiskLevel;
  detectTestCompanion: (filePath: string, changedPaths: string[], repoRoot: string) => Promise<TestStatus>;
  filterFiles: (files: ChangedFile[], config: ReviewConfig) => { included: ChangedFile[]; skipped: ChangedFile[] };
  generateRepoMap: (repoRoot: string) => Promise<string>;
  reviewFiles: (files: ChangedFile[], prMeta: PrMetadata, config: ReviewConfig, repoMap: string) => Promise<Finding[]>;
  filterBySeverity: (findings: Finding[], threshold: Severity) => Finding[];
  reconcileAndPublish: (client: AdoClient, prId: string, existingThreads: AdoThread[], findings: Finding[], files: ChangedFile[]) => Promise<PublishResult>;
  populateDiffs: (files: ChangedFile[], repoRoot: string, targetBranch: string) => Promise<ChangedFile[]>;
  reviewMetrics: typeof reviewMetrics;
  events: typeof events;
  logPipelineWarning: (message: string) => void;
};

const defaultDeps: ReviewDeps = {
  initTelemetry,
  getTracer,
  loadConfig,
  createAdoClient,
  fetchIncrementalChanges,
  fetchPRMetadata,
  listBotThreads,
  classifyRisk,
  detectTestCompanion,
  filterFiles,
  generateRepoMap,
  reviewFiles,
  filterBySeverity,
  reconcileAndPublish,
  populateDiffs,
  reviewMetrics,
  events,
  logPipelineWarning,
};

export async function runReview(deps: ReviewDeps = defaultDeps): Promise<void> {
  const shutdown = await deps.initTelemetry();
  const tracer = deps.getTracer();

  const span = tracer.startSpan("review.run");
  const ctx = trace.setSpan(context.active(), span);
  const startTime = Date.now();

  try {
    const runId = crypto.randomUUID();
    span.setAttribute("review.run_id", runId);
    deps.events.reviewStarted({ review_run_id: runId });

    const pat = process.env.ADO_PAT!;
    const org = process.env.ADO_ORG!;
    const project = process.env.ADO_PROJECT!;
    const repoId = process.env.ADO_REPO_ID!;
    const prId = process.env.ADO_PR_ID!;
    const repoRoot = process.env.REPO_ROOT ?? process.cwd();
    const configPath = process.env.CONFIG_PATH ?? ".prreviewer.yml";

    const configSpan = tracer.startSpan("load reviewer_config", undefined, ctx);
    const baseConfig = await deps.loadConfig(configPath);
    const maxFilesEnv = process.env.MAX_FILES ? parseInt(process.env.MAX_FILES, 10) : NaN;
    const config: ReviewConfig = {
      ...baseConfig,
      ...(Number.isInteger(maxFilesEnv) && maxFilesEnv > 0 ? { maxFiles: maxFilesEnv } : {}),
    };
    configSpan.end();
    const severityThreshold = (process.env.SEVERITY_THRESHOLD as Severity) ?? config.severityThreshold;
    deps.events.configLoaded({ config_path: configPath });

    const client = deps.createAdoClient(`https://dev.azure.com/${org}`, project, repoId, pat);

    const fetchSpan = tracer.startSpan("fetch pull_request", undefined, ctx);
    const [rawFiles, prMeta, existingThreads] = await Promise.all([
      deps.fetchIncrementalChanges(client, prId, repoRoot),
      deps.fetchPRMetadata(client, prId),
      deps.listBotThreads(client, prId),
    ]);
    fetchSpan.end();

    if (rawFiles.length === 0) {
      deps.events.reviewCompleted({ review_run_id: runId, files: 0, findings: 0 });
      return;
    }

    const filesWithDiffs = await deps.populateDiffs(rawFiles, repoRoot, prMeta.targetBranch);

    const changedPaths = filesWithDiffs.map((f) => f.path);
    const enrichedFiles = await Promise.all(
      filesWithDiffs.map(async (file) => ({
        ...file,
        riskLevel: deps.classifyRisk(file.path, config.securityOverrides),
        testStatus: await deps.detectTestCompanion(file.path, changedPaths, repoRoot),
      })),
    );

    const { included, skipped } = deps.filterFiles(enrichedFiles, config);
    deps.events.filesFiltered({ included: included.length, skipped: skipped.length });
    deps.reviewMetrics.files.add(included.length);

    const contextSpan = tracer.startSpan("build review_context", undefined, ctx);
    const repoMap = await deps.generateRepoMap(repoRoot);
    contextSpan.end();

    const llmSpan = tracer.startSpan("call llm", undefined, ctx);
    const allFindings = await deps.reviewFiles(included, prMeta, config, repoMap);
    const findings = deps.filterBySeverity(allFindings, severityThreshold);
    llmSpan.end();

    deps.reviewMetrics.findings.add(findings.length);
    deps.reviewMetrics.findingsPerRun.record(findings.length);
    deps.reviewMetrics.filesPerRun.record(included.length);

    const reconcileSpan = tracer.startSpan("reconcile bot_threads", undefined, ctx);
    const result = await deps.reconcileAndPublish(client, prId, existingThreads, findings, included);
    reconcileSpan.end();

    deps.reviewMetrics.threadActions.add(result.created, { action: "create" });
    deps.reviewMetrics.threadActions.add(result.resolved, { action: "resolve" });
    deps.reviewMetrics.threadActions.add(result.skipped, { action: "skip" });

    span.setAttribute("review.run.mode", "incremental");
    span.setAttribute("review.files.changed_count", rawFiles.length);
    span.setAttribute("review.files.reviewed_count", included.length);
    span.setAttribute("review.findings.count", findings.length);
    span.setAttribute("review.config.severity_threshold", severityThreshold);

    deps.events.reviewCompleted({
      review_run_id: runId,
      files: included.length,
      findings: findings.length,
      created: result.created,
      resolved: result.resolved,
      skipped: result.skipped,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      deps.logPipelineWarning(`Authentication failed (${err.tokenType}): ${err.message}`);
      deps.events.authFailed({ token_type: err.tokenType });
    } else {
      const message = err instanceof Error ? err.message : String(err);
      deps.logPipelineWarning(`Review failed: ${message}`);
      deps.events.reviewFailed({ error: message });
      deps.reviewMetrics.errors.add(1);
    }
  } finally {
    const duration = Date.now() - startTime;
    deps.reviewMetrics.reviewDuration.record(duration);
    deps.reviewMetrics.runs.add(1);
    span.end();
    await shutdown();
  }
}
