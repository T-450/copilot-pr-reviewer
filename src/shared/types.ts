export type RiskLevel = "HIGH_RISK" | "DATA_RISK" | "MEDIUM_RISK" | "NORMAL";
export type TestStatus = "changed" | "missing" | "not_changed" | "not_applicable";
export const SEVERITY_VALUES = ["critical", "warning", "suggestion", "nitpick"] as const;
export type Severity = (typeof SEVERITY_VALUES)[number];
export type Category = "correctness" | "security" | "reliability" | "maintainability" | "testing";
export type Confidence = "high" | "medium" | "low";

export type SecurityOverride = {
  path: string;
  risk: RiskLevel;
};

export type ReviewConfig = {
  ignore: string[];
  severityThreshold: Severity;
  maxFiles: number;
  securityOverrides: SecurityOverride[];
};

export type PrMetadata = {
  title: string;
  description: string;
  author: string;
  sourceBranch: string;
  targetBranch: string;
  workItemIds: number[];
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
  confidence: Confidence;
  fingerprint: string;
};

export type ChangedFile = {
  path: string;
  absolutePath: string;
  diff: string;
  changeType: "add" | "edit";
  changeTrackingId: number;
  currentIteration: number;
  previousIteration: number;
  riskLevel: RiskLevel;
  testStatus: TestStatus;
};

export type EnvVars = {
  ADO_PAT: string;
  ADO_ORG: string;
  ADO_PROJECT: string;
  ADO_REPO_ID: string;
  ADO_PR_ID: string;
  REPO_ROOT: string;
  CONFIG_PATH: string;
  MAX_FILES: string;
  SEVERITY_THRESHOLD: string;
  COPILOT_GITHUB_TOKEN: string;
  COPILOT_MODEL?: string;
  OTEL_SERVICE_NAME?: string;
  OTEL_RESOURCE_ATTRIBUTES?: string;
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_HEADERS?: string;
};
