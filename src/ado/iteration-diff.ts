import { minimatch } from 'minimatch';
import type { AdoClient } from './client.js';
import type { Env, ChangedFile, ReviewConfig } from '../types.js';
import { classifyRisk, detectTestStatus } from '../repo/context-builder.js';

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.dll',
  '.exe',
  '.zip',
  '.tar.gz',
  '.wasm',
  '.map',
]);

function isBinary(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(filePath.slice(filePath.lastIndexOf('.')));
}

export async function fetchIncrementalChanges(
  client: AdoClient,
  env: Env,
  config: ReviewConfig,
  allPaths: string[],
): Promise<ChangedFile[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iters = await client.request<any>(
    `/pullRequests/${env.adoPrId}/iterations?api-version=7.1`,
  );
  const iterations: number[] = (
    (iters.value as Array<{ id: number }>) ?? []
  ).map((i) => i.id);
  if (iterations.length === 0) return [];

  const current = Math.max(...iterations);
  const previous = current > 1 ? current - 1 : 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const changes = await client.request<any>(
    `/pullRequests/${env.adoPrId}/iterations/${current}/changes?$compareTo=${previous}&api-version=7.1`,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: any[] = (changes.changeEntries as any[]) ?? [];
  const files: ChangedFile[] = [];

  for (const entry of entries) {
    const changeType = entry.changeType as number;
    if (changeType !== 1 /* add */ && changeType !== 2 /* edit */) continue;

    const path: string = (entry.item?.path as string) ?? '';
    if (!path || isBinary(path)) continue;

    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

    if (config.ignore.some((pattern) => minimatch(normalizedPath, pattern)))
      continue;

    files.push({
      path: normalizedPath,
      absolutePath: `${env.repoRoot}/${normalizedPath}`,
      diff: '', // populated later via git diff
      changeType: changeType === 1 ? 'add' : 'edit',
      changeTrackingId: (entry.changeTrackingId as number) ?? 0,
      currentIteration: current,
      previousIteration: previous,
      riskLevel: classifyRisk(normalizedPath, config.securityOverrides),
      testStatus: detectTestStatus(normalizedPath, allPaths),
    });
  }

  return files;
}
