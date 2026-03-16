import type { AdoClient, AdoThread } from "./types";
import type { Finding, ChangedFile } from "../shared/types";
import { reconcileThreads } from "./thread-reconciler";
import { createThread, updateThreadStatus } from "./comment-poster";

export type PublishResult = {
  created: number;
  resolved: number;
  skipped: number;
};

export async function reconcileAndPublish(
  client: AdoClient,
  prId: string,
  existingThreads: AdoThread[],
  findings: Finding[],
  files: ChangedFile[],
): Promise<PublishResult> {
  const { toCreate, toResolve, toSkip } = reconcileThreads(existingThreads, findings, files);

  for (const finding of toCreate) {
    const file = files.find((f) => f.path === finding.filePath);
    if (file) {
      await createThread(client, prId, finding, file);
    }
  }

  for (const threadId of toResolve) {
    await updateThreadStatus(client, prId, threadId, "fixed");
  }

  return {
    created: toCreate.length,
    resolved: toResolve.length,
    skipped: toSkip.length,
  };
}
