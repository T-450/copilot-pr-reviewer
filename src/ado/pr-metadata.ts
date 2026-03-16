import type { AdoClient } from './client.js';
import type { Env, PRMetadata } from '../types.js';

export async function fetchPRMetadata(
  client: AdoClient,
  env: Env,
): Promise<PRMetadata> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pr = await client.request<any>(
    `/pullRequests/${env.adoPrId}?api-version=7.1`,
  );

  let workItems: string[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wi = await client.request<any>(
      `/pullRequests/${env.adoPrId}/workitems?api-version=7.1`,
    );
    workItems = ((wi.value as Array<Record<string, unknown>>) ?? []).map(
      (w) =>
        `#${w.id}: ${(w.fields as Record<string, string>)?.['System.Title'] ?? ''}`,
    );
  } catch {
    // work items are supplementary — don't fail
  }

  return {
    title: (pr.title as string) ?? '',
    description: (pr.description as string) ?? '',
    workItems,
  };
}
