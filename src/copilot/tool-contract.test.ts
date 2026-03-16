import { describe, it, expect } from "bun:test";
import { FindingSchema, validateFinding } from "./tool-contract";

const validFinding = {
  filePath: "src/auth/middleware.ts",
  startLine: 42,
  endLine: 45,
  severity: "warning",
  category: "security",
  title: "Missing input validation",
  message: "User input is passed directly to the database query without sanitization.",
  confidence: "high",
};

describe("FindingSchema", () => {
  it("parses a valid finding", () => {
    const result = FindingSchema.safeParse(validFinding);
    expect(result.success).toBe(true);
  });

  it("parses a finding with optional suggestion", () => {
    const result = FindingSchema.safeParse({ ...validFinding, suggestion: "Use parameterized queries." });
    expect(result.success).toBe(true);
  });

  it("rejects missing filePath", () => {
    const { filePath, ...rest } = validFinding;
    expect(FindingSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid severity", () => {
    expect(FindingSchema.safeParse({ ...validFinding, severity: "blocker" }).success).toBe(false);
  });

  it("rejects title over 140 chars", () => {
    expect(FindingSchema.safeParse({ ...validFinding, title: "x".repeat(141) }).success).toBe(false);
  });

  it("rejects startLine of 0", () => {
    expect(FindingSchema.safeParse({ ...validFinding, startLine: 0 }).success).toBe(false);
  });

  it("rejects negative endLine", () => {
    expect(FindingSchema.safeParse({ ...validFinding, endLine: -1 }).success).toBe(false);
  });
});

describe("validateFinding", () => {
  it("returns parsed finding on valid input", () => {
    const result = validateFinding(validFinding);
    expect(result).not.toBeNull();
    expect(result!.filePath).toBe("src/auth/middleware.ts");
  });

  it("returns null on invalid input", () => {
    expect(validateFinding({ filePath: 123 })).toBeNull();
  });
});
