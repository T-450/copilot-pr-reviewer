import type { RiskLevel, SecurityOverride } from "../shared/types";

const HIGH_RISK_PATTERNS = [
  /\/auth\//i,
  /\/security\//i,
  /\/crypto\//i,
  /\/middleware\//i,
  /^startup\.cs$/i,
  /^program\.cs$/i,
  /middleware\.cs$/i,
  /\/password\//i,
  /\/token\//i,
  /\/session\//i,
  /\/permission\//i,
  /\/rbac\//i,
  /\/identity\//i,
  /\/authorization\//i,
];

const DATA_RISK_PATTERNS = [
  /\/model\//i,
  /\/models\//i,
  /\/schema\//i,
  /\/migration\//i,
  /\/migrations\//i,
  /\/database\//i,
  /\/entity\//i,
  /\/entities\//i,
  /dbcontext/i,
  /\/repository\//i,
  /\/dataaccess\//i,
];

const MEDIUM_RISK_PATTERNS = [
  /\/api\//i,
  /\/routes\//i,
  /\/controller\//i,
  /\/controllers\//i,
  /controller\.cs$/i,
  /hub\.cs$/i,
  /\/handlers?\//i,
  /\/endpoints?\//i,
];

export function classifyRisk(filePath: string, overrides?: SecurityOverride[]): RiskLevel {
  const lower = filePath.toLowerCase();

  if (overrides) {
    for (const override of overrides) {
      const glob = new Bun.Glob(override.path);
      if (glob.match(filePath)) {
        return override.risk;
      }
    }
  }

  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(lower)) {
      return "HIGH_RISK";
    }
  }

  for (const pattern of DATA_RISK_PATTERNS) {
    if (pattern.test(lower)) {
      return "DATA_RISK";
    }
  }

  for (const pattern of MEDIUM_RISK_PATTERNS) {
    if (pattern.test(lower)) {
      return "MEDIUM_RISK";
    }
  }

  return "NORMAL";
}
