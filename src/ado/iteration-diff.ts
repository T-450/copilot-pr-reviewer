import { resolve, normalize } from 'node:path';
import { minimatch } from 'minimatch';
import type { AdoClient } from './client.js';
import type { Env, ChangedFile, ReviewConfig } from '../types.js';
import { classifyRisk, detectTestStatus } from '../repo/context-builder.js';

const BINARY_EXTENSIONS = [
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
];

function isBinary(filePath: string): boolean {
  return BINARY_EXTENSIONS.some((ext) => filePath.endsWith(ext));
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

  const sortedIterations = [...iterations].sort((a, b) => a - b);
  const current = sortedIterations[sortedIterations.length - 1];
  const previous =
    sortedIterations.length > 1
      ? sortedIterations[sortedIterations.length - 2]
      : 0;

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

    // Reject path traversal attempts — resolved path must stay within repoRoot
    const absolutePath = resolve(env.repoRoot, normalizedPath);
    if (!absolutePath.startsWith(normalize(env.repoRoot) + '/')) {
      console.warn(`Skipping path outside repo root: ${path}`);
      continue;
    }

    if (config.ignore.some((pattern) => minimatch(normalizedPath, pattern)))
      continue;

    files.push({
      path: normalizedPath,
      absolutePath,
      diff: '', // populated later via git diff
      changeType: changeType === 1 ? 'add' : 'edit',
      changeTrackingId: (entry.changeTrackingId as number) ?? 0,
      currentIteration: current,
      previousIteration: previous,
      riskLevel: classifyRisk(normalizedPath, config.securityOverrides),
      testStatus: detectTestStatus(normalizedPath, allPaths, env.repoRoot),
    });
  }

  return files;
}
