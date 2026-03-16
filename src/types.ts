import { z } from 'zod';
import { createHash } from 'node:crypto';

// --- Enums ---

export const Severity = [
  'critical',
  'warning',
  'suggestion',
  'nitpick',
] as const;
export type Severity = (typeof Severity)[number];

export const Category = [
  'correctness',
  'security',
  'reliability',
  'maintainability',
  'testing',
] as const;
export type Category = (typeof Category)[number];

export const RiskLevel = [
  'HIGH_RISK',
  'DATA_RISK',
  'MEDIUM_RISK',
  'NORMAL',
] as const;
export type RiskLevel = (typeof RiskLevel)[number];

export const TestStatus = [
  'changed',
  'missing',
  'not_changed',
  'not_applicable',
] as const;
export type TestStatus = (typeof TestStatus)[number];

// --- Config ---

export const ConfigSchema = z.object({
  ignore: z.array(z.string()).default([]),
  severityThreshold: z.enum(Severity).default('suggestion'),
  maxFiles: z.number().int().positive().default(30),
  securityOverrides: z
    .array(z.object({ path: z.string(), risk: z.enum(RiskLevel) }))
    .default([]),
});
export type ReviewConfig = z.infer<typeof ConfigSchema>;

// --- Domain ---

export type ChangedFile = {
  path: string;
  absolutePath: string;
  diff: string;
  changeType: 'add' | 'edit';
  changeTrackingId: number;
  currentIteration: number;
  previousIteration: number;
  riskLevel: RiskLevel;
  testStatus: TestStatus;
};

export type Finding = {
  filePath: string;
  startLine: number;
  endLine: number;
  severity: Severity;
  category: Category;
  title: string;
  message: string;
  suggestion?: string;
  confidence: 'high' | 'medium' | 'low';
  fingerprint: string;
};

export type PRMetadata = {
  title: string;
  description: string;
  workItems: string[];
};

export type BotThread = {
  id: number;
  filePath: string;
  fingerprint: string | null;
  changeTrackingId: number | null;
  status: number;
};

// --- Fingerprint ---

export function fingerprint(
  filePath: string,
  startLine: number,
  title: string,
): string {
  const hash = createHash('sha256')
    .update(`${filePath}:${startLine}:${title}`)
    .digest('hex');
  return `sha256:${hash.slice(0, 16)}`;
}

// --- Env ---

export type Env = {
  adoPat: string;
  adoOrg: string;
  adoProject: string;
  adoRepoId: string;
  adoPrId: string;
  repoRoot: string;
  configPath: string;
  maxFiles: number;
  severityThreshold: Severity;
};

export function loadEnv(): Env {
  const required = (key: string): string => {
    const v = process.env[key];
    if (!v) throw new Error(`Missing env: ${key}`);
    return v;
  };
  return {
    adoPat: required('ADO_PAT'),
    adoOrg: required('ADO_ORG').replace(/\/$/, ''),
    adoProject: required('ADO_PROJECT'),
    adoRepoId: required('ADO_REPO_ID'),
    adoPrId: required('ADO_PR_ID'),
    repoRoot: required('REPO_ROOT'),
    configPath: process.env.CONFIG_PATH ?? '.prreviewer.yml',
    maxFiles: Number(process.env.MAX_FILES ?? '30'),
    severityThreshold:
      (process.env.SEVERITY_THRESHOLD as Severity) ?? 'suggestion',
  };
}
