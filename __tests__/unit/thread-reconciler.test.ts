import { describe, it, expect } from 'vitest';
import { buildReconciliationPlan } from '../../src/ado/thread-reconciler.js';
import type { ExistingBotThread } from '../../src/ado/comment-poster.js';
import type { Finding, ChangedFile } from '../../src/types.js';

const makeThread = (
  o: Partial<ExistingBotThread> = {},
): ExistingBotThread => ({
  id: 1,
  filePath: 'src/a.ts',
  fingerprint: 'sha256:aaa',
  changeTrackingId: 10,
  status: 1,
  ...o,
});

const makeFinding = (o: Partial<Finding> = {}): Finding => ({
  filePath: 'src/a.ts',
  startLine: 1,
  endLine: 5,
  severity: 'warning',
  category: 'correctness',
  title: 'test',
  message: 'msg',
  confidence: 'high',
  fingerprint: 'sha256:bbb',
  ...o,
});

const makeFile = (o: Partial<ChangedFile> = {}): ChangedFile => ({
  path: 'src/a.ts',
  absolutePath: '/repo/src/a.ts',
  diff: '+line',
  changeType: 'edit',
  changeTrackingId: 10,
  currentIteration: 2,
  previousIteration: 1,
  riskLevel: 'NORMAL',
  testStatus: 'not_applicable',
  ...o,
});

describe('buildReconciliationPlan', () => {
  it('deduplicates when fingerprint already exists', () => {
    const plan = buildReconciliationPlan(
      [makeThread({ fingerprint: 'sha256:bbb' })],
      [makeFinding({ fingerprint: 'sha256:bbb' })],
      [makeFile()],
    );
    expect(plan.toPost).toHaveLength(0);
    expect(plan.deduped).toBe(1);
  });

  it('posts new finding when fingerprint is novel', () => {
    const plan = buildReconciliationPlan(
      [makeThread({ fingerprint: 'sha256:aaa' })],
      [makeFinding({ fingerprint: 'sha256:ccc' })],
      [makeFile()],
    );
    expect(plan.toPost).toHaveLength(1);
  });

  it('resolves superseded threads on same tracked change', () => {
    const plan = buildReconciliationPlan(
      [makeThread({ fingerprint: 'sha256:aaa', changeTrackingId: 10 })],
      [makeFinding({ fingerprint: 'sha256:ccc' })],
      [makeFile({ changeTrackingId: 10 })],
    );
    expect(plan.toResolve).toHaveLength(1);
  });

  it('does not resolve threads for unrelated tracked changes', () => {
    const plan = buildReconciliationPlan(
      [makeThread({ changeTrackingId: 99 })],
      [makeFinding()],
      [makeFile({ changeTrackingId: 10 })],
    );
    expect(plan.toResolve).toHaveLength(0);
  });

  it('does not resolve already-closed threads', () => {
    const plan = buildReconciliationPlan(
      [makeThread({ status: 4, changeTrackingId: 10 })],
      [],
      [makeFile({ changeTrackingId: 10 })],
    );
    expect(plan.toResolve).toHaveLength(0);
  });
});
