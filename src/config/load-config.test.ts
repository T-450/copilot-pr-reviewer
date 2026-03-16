import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig } from "./load-config";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "config-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("parses valid YAML config", async () => {
    const yaml = `ignore:\n  - "*.md"\nseverityThreshold: warning\nmaxFiles: 20\nsecurityOverrides:\n  - path: "src/payments/**"\n    risk: HIGH_RISK\n`;
    await writeFile(join(tmpDir, ".prreviewer.yml"), yaml);
    const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));
    expect(config.ignore).toEqual(["*.md"]);
    expect(config.severityThreshold).toBe("warning");
    expect(config.maxFiles).toBe(20);
    expect(config.securityOverrides).toHaveLength(1);
  });

  it("returns defaults for missing file", async () => {
    const config = await loadConfig(join(tmpDir, "nonexistent.yml"));
    expect(config.ignore).toEqual([]);
    expect(config.severityThreshold).toBe("suggestion");
    expect(config.maxFiles).toBe(30);
    expect(config.securityOverrides).toEqual([]);
  });

  it("returns defaults for malformed YAML", async () => {
    await writeFile(join(tmpDir, ".prreviewer.yml"), "{{invalid yaml");
    const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));
    expect(config.severityThreshold).toBe("suggestion");
  });

  it("returns defaults for invalid severityThreshold", async () => {
    await writeFile(join(tmpDir, ".prreviewer.yml"), "severityThreshold: blocker\n");
    const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));
    expect(config.severityThreshold).toBe("suggestion");
  });

  it("passes through unknown keys without error", async () => {
    await writeFile(join(tmpDir, ".prreviewer.yml"), "unknownKey: value\nseverityThreshold: critical\n");
    const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));
    expect(config.severityThreshold).toBe("critical");
  });
});
