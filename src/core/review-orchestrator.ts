import {
  loadEnv,
  type Severity,
  type Finding,
  Severity as SeverityValues,
} from '../types.js';
import { createAdoClient } from '../ado/client.js';
import { loadConfig } from '../config/load-config.js';
import { fetchPRMetadata } from '../ado/pr-metadata.js';
import { fetchIncrementalChanges } from '../ado/iteration-diff.js';
import { listBotThreads } from '../ado/comment-poster.js';
import { reconcileAndPublish } from '../ado/thread-reconciler.js';
import { detectTestStatus } from '../repo/context-builder.js';
import { reviewFiles } from '../copilot/review-session.js';
import { initTelemetry, shutdownTelemetry } from '../telemetry/setup.js';
import {
  emitRunStarted,
  emitRunCompleted,
  emitRunFailed,
  emitFindingEmitted,
} from '../telemetry/events.js';

function severityIndex(s: Severity): number {
  return SeverityValues.indexOf(s);
}

function filterBySeverity(
  findings: Finding[],
  threshold: Severity,
): Finding[] {
  const minIndex = severityIndex(threshold);
  return findings.filter((f) => severityIndex(f.severity) <= minIndex);
}

export async function runReview(): Promise<void> {
  await initTelemetry();
  const startTime = Date.now();
  const env = loadEnv();
  emitRunStarted(env);

  try {
    const client = createAdoClient(env);
    const config = await loadConfig(env.configPath, env.repoRoot);
    const effectiveMaxFiles = Math.min(config.maxFiles, env.maxFiles);

    const [prMeta, allFilesPartial, existingThreads] = await Promise.all([
      fetchPRMetadata(client, env),
      fetchIncrementalChanges(client, env, config, []),
      listBotThreads(client, env),
    ]);

    // Second pass: recompute testStatus now that we have the full list of changed paths
    const allChangedPaths = allFilesPartial.map((f) => f.path);
    const allFiles = allFilesPartial.map((f) => ({
      ...f,
      testStatus: detectTestStatus(f.path, allChangedPaths),
    }));

    const files = allFiles.slice(0, effectiveMaxFiles);
    if (allFiles.length > effectiveMaxFiles) {
      console.warn(
        `Capped review to ${effectiveMaxFiles} files (${allFiles.length} changed)`,
      );
    }

    if (files.length === 0) {
      console.log('No reviewable files — exiting silently.');
      return;
    }

    const findings = await reviewFiles(files, prMeta, config);
    const filtered = filterBySeverity(findings, env.severityThreshold);

    const fileByPath = new Map(files.map((f) => [f.path, f]));
    for (const f of filtered) {
      emitFindingEmitted({
        filePath: f.filePath,
        severity: f.severity,
        category: f.category,
        fingerprint: f.fingerprint,
        riskLevel: fileByPath.get(f.filePath)?.riskLevel ?? 'NORMAL',
        hasSuggestion: !!f.suggestion,
      });
    }

    const stats = await reconcileAndPublish(
      client,
      env,
      existingThreads,
      filtered,
      files,
    );

    emitRunCompleted({
      filesChanged: allFiles.length,
      filesReviewed: files.length,
      findingsCount: filtered.length,
      threadsCreated: stats.created,
      threadsResolved: stats.resolved,
      threadsDeduped: stats.deduped,
      durationMs: Date.now() - startTime,
    });

    console.log(
      `Review complete: ${filtered.length} findings, ${stats.created} posted, ${stats.resolved} resolved, ${stats.deduped} deduped`,
    );
  } catch (err) {
    const errorType =
      err instanceof Error && err.message.includes('401')
        ? 'auth_failed'
        : 'unknown';
    emitRunFailed(errorType);
    throw err;
  } finally {
    await shutdownTelemetry();
  }
}
