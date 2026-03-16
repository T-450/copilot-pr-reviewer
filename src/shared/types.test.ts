import { describe, it, expect } from "bun:test";
import type {
  RiskLevel,
  TestStatus,
  Severity,
  Category,
  Confidence,
  Finding,
  ReviewConfig,
  PrMetadata,
  ChangedFile,
  SecurityOverride,
  EnvVars,
} from "./types";

describe("shared types", () => {
  it("type assignments compile correctly", () => {
    const risk: RiskLevel = "HIGH_RISK";
    const test: TestStatus = "changed";
    const sev: Severity = "critical";
    const cat: Category = "security";
    const conf: Confidence = "high";
    expect(risk).toBe("HIGH_RISK");
    expect(test).toBe("changed");
    expect(sev).toBe("critical");
    expect(cat).toBe("security");
    expect(conf).toBe("high");
  });
});
