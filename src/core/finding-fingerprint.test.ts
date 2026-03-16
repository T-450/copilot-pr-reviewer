import { describe, it, expect } from "bun:test";
import { generateFingerprint } from "./finding-fingerprint";

describe("generateFingerprint", () => {
  const baseFinding = {
    filePath: "src/foo.ts",
    startLine: 10,
    endLine: 15,
    title: "Missing validation",
    category: "security" as const,
  };

  it("same inputs produce same fingerprint", () => {
    const a = generateFingerprint(baseFinding);
    const b = generateFingerprint(baseFinding);
    expect(a).toBe(b);
  });

  it("different paths produce different fingerprints", () => {
    const a = generateFingerprint(baseFinding);
    const b = generateFingerprint({ ...baseFinding, filePath: "src/bar.ts" });
    expect(a).not.toBe(b);
  });

  it("normalizes leading slash", () => {
    const a = generateFingerprint(baseFinding);
    const b = generateFingerprint({ ...baseFinding, filePath: "/src/foo.ts" });
    expect(a).toBe(b);
  });

  it("normalizes case", () => {
    const a = generateFingerprint(baseFinding);
    const b = generateFingerprint({ ...baseFinding, filePath: "Src/Foo.ts", title: "missing validation" });
    expect(a).toBe(b);
  });

  it("returns sha256: prefixed string", () => {
    const fp = generateFingerprint(baseFinding);
    expect(fp).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
