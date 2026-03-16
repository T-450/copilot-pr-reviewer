import type { Finding, Severity } from "../shared/types";

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  suggestion: 2,
  nitpick: 3,
};

export function filterBySeverity(findings: Finding[], threshold: Severity): Finding[] {
  const thresholdRank = SEVERITY_RANK[threshold];
  return findings.filter(f => SEVERITY_RANK[f.severity] <= thresholdRank);
}
