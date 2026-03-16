import type {
  ChangedFile,
  PRMetadata,
  RiskLevel,
  TestStatus,
} from '../types.js';
import { readdir } from 'node:fs/promises';
import { join, dirname, basename, extname } from 'node:path';
import { minimatch } from 'minimatch';

const HIGH_RISK_PATTERNS = [
  /\bauth\b/i,
  /\bsecurity\b/i,
  /\bcrypto\b/i,
  /\bmiddleware\b/i,
  /\bpassword\b/i,
  /\btoken\b/i,
  /\bsession\b/i,
  /\bpermission\b/i,
  /\brbac\b/i,
  /\bidentity\b/i,
  /\bauthorization\b/i,
  /Startup\.cs$/,
  /Program\.cs$/,
  /Middleware\.cs$/,
];
const DATA_RISK_PATTERNS = [
  /\bmodel\b/i,
  /\bschema\b/i,
  /\bmigration\b/i,
  /\bdatabase\b/i,
  /\bentity\b/i,
  /DbContext/i,
  /Repository/i,
  /DataAccess/i,
];
const MEDIUM_RISK_PATTERNS = [
  /\bapi\b/i,
  /\broutes?\b/i,
  /\bcontroller\b/i,
  /\bhandler\b/i,
  /\bendpoint\b/i,
  /Controller\.cs$/,
  /Hub\.cs$/,
];

export function classifyRisk(
  path: string,
  overrides: { path: string; risk: RiskLevel }[],
): RiskLevel {
  for (const o of overrides) {
    if (minimatch(path, o.path)) return o.risk;
  }
  if (HIGH_RISK_PATTERNS.some((p) => p.test(path))) return 'HIGH_RISK';
  if (DATA_RISK_PATTERNS.some((p) => p.test(path))) return 'DATA_RISK';
  if (MEDIUM_RISK_PATTERNS.some((p) => p.test(path))) return 'MEDIUM_RISK';
  return 'NORMAL';
}

export function detectTestStatus(
  filePath: string,
  allChangedPaths: string[],
): TestStatus {
  const ext = extname(filePath);
  if (/\.(test|spec|tests)\./i.test(filePath)) return 'not_applicable';
  if (!/\.(ts|tsx|cs)$/.test(filePath)) return 'not_applicable';

  const base = basename(filePath, ext);
  const dir = dirname(filePath);
  const testPatterns =
    ext === '.cs'
      ? [`${base}Tests.cs`, `${base}Test.cs`]
      : [`${base}.test${ext}`, `${base}.spec${ext}`];
  const testDirs = [dir, dir.replace(/^src\//, 'tests/'), `${dir}/__tests__`];
  const candidates = testDirs.flatMap((d) =>
    testPatterns.map((t) => `${d}/${t}`),
  );
  const hasChangedTest = candidates.some((c) =>
    allChangedPaths.some((p) => p.endsWith(c) || p === c),
  );
  return hasChangedTest ? 'changed' : 'not_changed';
}

export async function buildRepoMap(
  repoRoot: string,
  maxDepth = 2,
): Promise<string> {
  const lines: string[] = [];
  async function walk(
    dir: string,
    depth: number,
    prefix: string,
  ): Promise<void> {
    if (depth > maxDepth) return;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      const filtered = entries
        .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
        .sort((a, b) =>
          a.isDirectory() === b.isDirectory()
            ? a.name.localeCompare(b.name)
            : a.isDirectory()
              ? -1
              : 1,
        );
      for (const entry of filtered) {
        lines.push(`${prefix}${entry.name}${entry.isDirectory() ? '/' : ''}`);
        if (entry.isDirectory())
          await walk(join(dir, entry.name), depth + 1, prefix + '  ');
      }
    } catch {
      /* skip unreadable dirs */
    }
  }
  await walk(repoRoot, 0, '');
  return lines.join('\n');
}

export async function buildSystemMessage(
  prMeta: PRMetadata,
  _files: ChangedFile[],
  repoRoot: string,
): Promise<string> {
  const repoMap = await buildRepoMap(repoRoot);
  return [
    '# Role',
    'You are a senior code reviewer. You will receive ALL changed files in a single PR at once.',
    'Analyze every diff for correctness, security, reliability, maintainability, and testing issues.',
    'Look for cross-file issues: broken call sites, inconsistent renames, missing re-exports, type mismatches across module boundaries.',
    'Report findings ONLY through the emit_finding tool. Do not write prose responses.',
    '',
    '# PR Context',
    `Title: ${prMeta.title}`,
    prMeta.description ? `Description: ${prMeta.description}` : '',
    prMeta.workItems.length
      ? `Work Items: ${prMeta.workItems.join('; ')}`
      : '',
    '',
    '# Severity Guide',
    '- critical: bugs, security vulns, data loss risks',
    '- warning: likely issues, poor error handling, race conditions',
    '- suggestion: better approaches, cleaner patterns',
    '- nitpick: style, naming, minor readability',
    '',
    '# Rules',
    '- Only report issues in the CHANGED lines (the diff), not pre-existing code.',
    '- Include a suggestion field when there is an obvious fix.',
    '- Set confidence to high only when you are certain.',
    '- If the file has HIGH_RISK or DATA_RISK classification, apply stricter scrutiny.',
    "- If testStatus is 'not_changed', consider flagging missing test updates.",
    '- Review ALL files before emitting findings — cross-file context may change your assessment.',
    '',
    '# Repository Structure',
    '```',
    repoMap.slice(0, 2000),
    '```',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildReviewPrompt(files: ChangedFile[]): string {
  const sections = files.map((f) =>
    [
      `## ${f.path}`,
      `Change: ${f.changeType} | Risk: ${f.riskLevel} | Test companion: ${f.testStatus}`,
      '```diff',
      f.diff,
      '```',
    ].join('\n'),
  );
  return [
    `Review this PR (${files.length} changed files). Report all findings through emit_finding.`,
    '',
    ...sections,
  ].join('\n\n');
}
