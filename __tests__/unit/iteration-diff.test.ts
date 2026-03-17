import { describe, it, expect, vi } from 'vitest';
import { fetchIncrementalChanges } from '../../src/ado/iteration-diff.js';
import type { Env, ReviewConfig } from '../../src/types.js';

const baseEnv: Env = {
  adoPat: 'token',
  adoOrg: 'https://dev.azure.com/org',
  adoProject: 'proj',
  adoRepoId: 'repo',
  adoPrId: '42',
  repoRoot: '/repo',
  configPath: '.prreviewer.yml',
  maxFiles: 50,
  severityThreshold: 'suggestion',
};

const baseConfig: ReviewConfig = {
  ignore: [],
  severityThreshold: 'suggestion',
  maxFiles: 30,
  securityOverrides: [],
};

function makeClient(
  iterationsValue: { id: number }[],
  changeEntries: unknown[],
) {
  return {
    request: vi
      .fn()
      .mockResolvedValueOnce({ value: iterationsValue })
      .mockResolvedValueOnce({ changeEntries }),
    baseUrl: 'https://dev.azure.com/org/proj/_apis/git/repositories/repo',
  };
}

describe('fetchIncrementalChanges', () => {
  it('returns empty array when no iterations exist', async () => {
    const client = makeClient([], []);
    const result = await fetchIncrementalChanges(client, baseEnv, baseConfig, []);
    expect(result).toEqual([]);
  });

  it('filters out binary files (.png)', async () => {
    const client = makeClient(
      [{ id: 1 }],
      [{ changeType: 1, item: { path: '/image.png' }, changeTrackingId: 1 }],
    );
    const result = await fetchIncrementalChanges(client, baseEnv, baseConfig, []);
    expect(result).toHaveLength(0);
  });

  it('filters out .tar.gz multi-part extension', async () => {
    const client = makeClient(
      [{ id: 1 }],
      [{ changeType: 1, item: { path: '/archive.tar.gz' }, changeTrackingId: 1 }],
    );
    const result = await fetchIncrementalChanges(client, baseEnv, baseConfig, []);
    expect(result).toHaveLength(0);
  });

  it('strips leading slash from path', async () => {
    const client = makeClient(
      [{ id: 1 }],
      [{ changeType: 1, item: { path: '/src/foo.ts' }, changeTrackingId: 5 }],
    );
    const result = await fetchIncrementalChanges(client, baseEnv, baseConfig, []);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/foo.ts');
  });

  it('rejects path traversal attempts', async () => {
    const client = makeClient(
      [{ id: 1 }],
      [{ changeType: 1, item: { path: '/../etc/passwd' }, changeTrackingId: 1 }],
    );
    const result = await fetchIncrementalChanges(client, baseEnv, baseConfig, []);
    expect(result).toHaveLength(0);
  });

  it('excludes files matching ignore patterns', async () => {
    const config = { ...baseConfig, ignore: ['**/*.generated.ts'] };
    const client = makeClient(
      [{ id: 1 }],
      [
        {
          changeType: 2,
          item: { path: '/src/api.generated.ts' },
          changeTrackingId: 2,
        },
      ],
    );
    const result = await fetchIncrementalChanges(client, baseEnv, config, []);
    expect(result).toHaveLength(0);
  });

  it('only includes add (1) and edit (2) change types', async () => {
    const client = makeClient(
      [{ id: 1 }],
      [
        { changeType: 3, item: { path: '/src/deleted.ts' }, changeTrackingId: 1 },
        { changeType: 1, item: { path: '/src/added.ts' }, changeTrackingId: 2 },
        { changeType: 2, item: { path: '/src/edited.ts' }, changeTrackingId: 3 },
      ],
    );
    const result = await fetchIncrementalChanges(client, baseEnv, baseConfig, []);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.changeType)).toEqual(['add', 'edit']);
  });

  it('uses server-provided iteration ordering for non-contiguous IDs', async () => {
    // Iterations [1, 3, 5] — previous should be 3, not 4
    const client = makeClient([{ id: 3 }, { id: 1 }, { id: 5 }], []);
    await fetchIncrementalChanges(client, baseEnv, baseConfig, []);
    const secondCall = (client.request as ReturnType<typeof vi.fn>).mock
      .calls[1][0] as string;
    // Should compare iteration 5 to iteration 3 (not 4)
    expect(secondCall).toContain('/iterations/5/changes');
    expect(secondCall).toContain('$compareTo=3');
  });

  it('sets previous to 0 when only one iteration exists', async () => {
    const client = makeClient([{ id: 7 }], []);
    await fetchIncrementalChanges(client, baseEnv, baseConfig, []);
    const secondCall = (client.request as ReturnType<typeof vi.fn>).mock
      .calls[1][0] as string;
    expect(secondCall).toContain('/iterations/7/changes');
    expect(secondCall).toContain('$compareTo=0');
  });

  it('returns correct metadata for a valid changed file', async () => {
    const client = makeClient(
      [{ id: 1 }, { id: 2 }],
      [
        {
          changeType: 2,
          item: { path: '/src/auth/service.ts' },
          changeTrackingId: 42,
        },
      ],
    );
    const result = await fetchIncrementalChanges(client, baseEnv, baseConfig, []);
    expect(result).toHaveLength(1);
    const file = result[0];
    expect(file.path).toBe('src/auth/service.ts');
    expect(file.changeType).toBe('edit');
    expect(file.changeTrackingId).toBe(42);
    expect(file.currentIteration).toBe(2);
    expect(file.previousIteration).toBe(1);
    expect(file.diff).toBe('');
    expect(file.absolutePath).toBe('/repo/src/auth/service.ts');
    expect(file.riskLevel).toBe('HIGH_RISK');
  });
});
