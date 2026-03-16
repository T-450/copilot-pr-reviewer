import type { AdoClient, AdoPullRequest } from "./types";
import type { PrMetadata } from "../shared/types";

export async function fetchPRMetadata(client: AdoClient, prId: string): Promise<PrMetadata> {
  const pr = await client.get<AdoPullRequest>(`/pullRequests/${prId}`);
  return {
    title: pr.title,
    description: pr.description ?? "",
    author: pr.createdBy.displayName,
    sourceBranch: pr.sourceRefName.replace("refs/heads/", ""),
    targetBranch: pr.targetRefName.replace("refs/heads/", ""),
    workItemIds: (pr.workItemRefs ?? []).map((ref) => Number(ref.id)),
  };
}
