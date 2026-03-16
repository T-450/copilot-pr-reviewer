import { describe, it, expect } from 'vitest';
import {
  classifyRisk,
  detectTestStatus,
  buildReviewPrompt,
} from '../../src/repo/context-builder.js';
import type { ChangedFile } from '../../src/types.js';

describe('classifyRisk', () => {
  it('tags auth paths as HIGH_RISK', () => {
    expect(classifyRisk('src/auth/middleware.ts', [])).toBe('HIGH_RISK');
  });
  it('tags controllers as MEDIUM_RISK', () => {
    expect(classifyRisk('src/api/UserController.cs', [])).toBe('MEDIUM_RISK');
  });
  it('respects overrides', () => {
    expect(
      classifyRisk('infra/main.tf', [{ path: 'infra/**', risk: 'HIGH_RISK' }]),
    ).toBe('HIGH_RISK');
  });
  it('defaults to NORMAL', () => {
    expect(classifyRisk('src/utils/format.ts', [])).toBe('NORMAL');
  });
  it('tags database paths as DATA_RISK', () => {
    expect(classifyRisk('src/database/connection.ts', [])).toBe('DATA_RISK');
  });
});

describe('detectTestStatus', () => {
  it('returns not_applicable for test files', () => {
    expect(detectTestStatus('src/auth.test.ts', [])).toBe('not_applicable');
  });
  it('returns changed when companion test is in diff', () => {
    expect(
      detectTestStatus('src/auth/service.ts', ['src/auth/service.test.ts']),
    ).toBe('changed');
  });
  it('returns not_changed when companion test absent from diff', () => {
    expect(detectTestStatus('src/auth/service.ts', ['src/other.ts'])).toBe(
      'not_changed',
    );
  });
  it('returns not_applicable for non-source files', () => {
    expect(detectTestStatus('README.md', [])).toBe('not_applicable');
  });
});

describe('buildReviewPrompt', () => {
  const makeFile = (path: string): ChangedFile => ({
    path,
    absolutePath: `/repo/${path}`,
    diff: `+added line in ${path}`,
    changeType: 'edit',
    changeTrackingId: 1,
    currentIteration: 2,
    previousIteration: 1,
    riskLevel: 'NORMAL',
    testStatus: 'not_applicable',
  });

  it('includes all files in a single prompt', () => {
    const prompt = buildReviewPrompt([makeFile('a.ts'), makeFile('b.ts')]);
    expect(prompt).toContain('2 changed files');
    expect(prompt).toContain('## a.ts');
    expect(prompt).toContain('## b.ts');
  });

  it('includes risk and test metadata per file', () => {
    const file = {
      ...makeFile('c.ts'),
      riskLevel: 'HIGH_RISK' as const,
      testStatus: 'missing' as const,
    };
    const prompt = buildReviewPrompt([file]);
    expect(prompt).toContain('Risk: HIGH_RISK');
    expect(prompt).toContain('Test companion: missing');
  });
});
