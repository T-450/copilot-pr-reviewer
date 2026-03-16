import { setTimeout as sleep } from 'node:timers/promises';
import type { AdoClient } from './client.js';
import type { ExistingBotThread } from './comment-poster.js';
import { createThread, resolveThread } from './comment-poster.js';
import type { Env, Finding, ChangedFile } from '../types.js';

export type ReconciliationPlan = {
  toPost: Array<{ finding: Finding; file: ChangedFile }>;
  toResolve: ExistingBotThread[];
  deduped: number;
};

export function buildReconciliationPlan(
  existingThreads: ExistingBotThread[],
  findings: Finding[],
  files: ChangedFile[],
): ReconciliationPlan {
  const fileByPath = new Map(files.map((f) => [f.path, f]));
  const newFingerprints = new Set(findings.map((f) => f.fingerprint));
  const existingFingerprints = new Set(
    existingThreads.map((t) => t.fingerprint).filter(Boolean),
  );
  const activeTrackingIds = new Set(files.map((f) => f.changeTrackingId));

  const toPost: ReconciliationPlan['toPost'] = [];
  let deduped = 0;

  for (const finding of findings) {
    if (existingFingerprints.has(finding.fingerprint)) {
      deduped++;
      continue;
    }
    const file = fileByPath.get(finding.filePath);
    if (file) toPost.push({ finding, file });
  }

  const toResolve: ExistingBotThread[] = [];
  for (const thread of existingThreads) {
    if (thread.status === 4) continue;
    if (!thread.fingerprint) continue;
    if (
      !thread.changeTrackingId ||
      !activeTrackingIds.has(thread.changeTrackingId)
    )
      continue;
    if (!newFingerprints.has(thread.fingerprint)) toResolve.push(thread);
  }

  return { toPost, toResolve, deduped };
}

export async function reconcileAndPublish(
  client: AdoClient,
  env: Env,
  existingThreads: ExistingBotThread[],
  findings: Finding[],
  files: ChangedFile[],
): Promise<{ created: number; resolved: number; deduped: number }> {
  const plan = buildReconciliationPlan(existingThreads, findings, files);

  let created = 0;
  for (const { finding, file } of plan.toPost) {
    await createThread(client, env, finding, file);
    created++;
    await sleep(200);
  }

  let resolved = 0;
  for (const thread of plan.toResolve) {
    await resolveThread(client, env, thread.id);
    resolved++;
  }

  return { created, resolved, deduped: plan.deduped };
}
