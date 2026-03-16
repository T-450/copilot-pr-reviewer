import type { AdoThread } from "./types";
import type { Finding, ChangedFile } from "../shared/types";

export type ReconciliationResult = {
  toCreate: Finding[];
  toResolve: number[]; // thread IDs
  toSkip: Finding[];
};

export function reconcileThreads(
  existingBotThreads: AdoThread[],
  newFindings: Finding[],
  files: ChangedFile[],
): ReconciliationResult {
  const toCreate: Finding[] = [];
  const toResolve: number[] = [];
  const toSkip: Finding[] = [];

  const currentTrackingIds = new Set(files.map((f) => f.changeTrackingId));

  const existingByFingerprint = new Map<string, AdoThread>();
  for (const thread of existingBotThreads) {
    const content = thread.comments[0]?.content ?? "";
    const match = content.match(/<!-- fingerprint:(\S+) -->/);
    if (match) {
      existingByFingerprint.set(match[1], thread);
    }
  }

  for (const finding of newFindings) {
    const existing = existingByFingerprint.get(finding.fingerprint);
    if (existing) {
      toSkip.push(finding);
      existingByFingerprint.delete(finding.fingerprint); // mark as matched
    } else {
      toCreate.push(finding);
    }
  }

  for (const [, thread] of existingByFingerprint) {
    const trackingId = thread.pullRequestThreadContext?.changeTrackingId;
    if (trackingId !== undefined && currentTrackingIds.has(trackingId)) {
      toResolve.push(thread.id);
    }
  }

  return { toCreate, toResolve, toSkip };
}
