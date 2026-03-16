import { describe, it, expect } from "bun:test";
import { filterBySeverity } from "./severity-filter";
import type { Finding } from "../shared/types";

const makeFinding = (severity: Finding["severity"]): Finding => ({
  filePath: "test.ts", startLine: 1, endLine: 1,
  severity, category: "correctness", title: "Test", message: "msg",
  confidence: "high", fingerprint: "sha256:abc",
});

describe("filterBySeverity", () => {
  const findings = [
    makeFinding("critical"),
    makeFinding("warning"),
    makeFinding("suggestion"),
    makeFinding("nitpick"),
  ];

  it("threshold 'critical' keeps only critical", () => {
    expect(filterBySeverity(findings, "critical")).toHaveLength(1);
  });

  it("threshold 'warning' keeps critical + warning", () => {
    expect(filterBySeverity(findings, "warning")).toHaveLength(2);
  });

  it("threshold 'suggestion' keeps critical + warning + suggestion", () => {
    expect(filterBySeverity(findings, "suggestion")).toHaveLength(3);
  });

  it("threshold 'nitpick' keeps all", () => {
    expect(filterBySeverity(findings, "nitpick")).toHaveLength(4);
  });
});
