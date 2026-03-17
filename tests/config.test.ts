import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { loadConfig, meetsThreshold } from "../src/config.ts";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadConfig", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "prreviewer-test-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	test("returns defaults when config file is missing", async () => {
		const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));

		expect(config.ignore).toEqual([]);
		expect(config.severityThreshold).toBe("suggestion");
		expect(config.maxFiles).toBe(30);
		expect(config.planning).toBe(true);
		expect(config.clustering).toBe(true);
		expect(config.clusterThreshold).toBe(3);
	});

	test("parses valid config file", async () => {
		const yaml = `
ignore:
  - "**/*.generated.ts"
  - "vendor/**"
severityThreshold: warning
maxFiles: 15
planning: false
clustering: true
clusterThreshold: 5
`;
		await writeFile(join(tmpDir, ".prreviewer.yml"), yaml);
		const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));

		expect(config.ignore).toEqual(["**/*.generated.ts", "vendor/**"]);
		expect(config.severityThreshold).toBe("warning");
		expect(config.maxFiles).toBe(15);
		expect(config.planning).toBe(false);
		expect(config.clusterThreshold).toBe(5);
	});

	test("returns defaults on malformed YAML", async () => {
		await writeFile(join(tmpDir, ".prreviewer.yml"), "{{invalid: yaml: [");
		const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));

		expect(config.severityThreshold).toBe("suggestion");
		expect(config.maxFiles).toBe(30);
	});

	test("ignores unknown keys without error", async () => {
		const yaml = `
unknownKey: someValue
anotherUnknown: 42
severityThreshold: critical
`;
		await writeFile(join(tmpDir, ".prreviewer.yml"), yaml);
		const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));

		expect(config.severityThreshold).toBe("critical");
		expect(config.maxFiles).toBe(30);
	});

	test("returns defaults for invalid field values", async () => {
		const yaml = `
severityThreshold: invalid_value
maxFiles: -5
`;
		await writeFile(join(tmpDir, ".prreviewer.yml"), yaml);
		const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));

		expect(config.severityThreshold).toBe("suggestion");
		expect(config.maxFiles).toBe(30);
	});
});

describe("meetsThreshold", () => {
	test("critical meets any threshold", () => {
		expect(meetsThreshold("critical", "critical")).toBe(true);
		expect(meetsThreshold("critical", "warning")).toBe(true);
		expect(meetsThreshold("critical", "suggestion")).toBe(true);
		expect(meetsThreshold("critical", "nitpick")).toBe(true);
	});

	test("warning meets warning and below", () => {
		expect(meetsThreshold("warning", "critical")).toBe(false);
		expect(meetsThreshold("warning", "warning")).toBe(true);
		expect(meetsThreshold("warning", "suggestion")).toBe(true);
		expect(meetsThreshold("warning", "nitpick")).toBe(true);
	});

	test("suggestion meets suggestion and below", () => {
		expect(meetsThreshold("suggestion", "critical")).toBe(false);
		expect(meetsThreshold("suggestion", "warning")).toBe(false);
		expect(meetsThreshold("suggestion", "suggestion")).toBe(true);
		expect(meetsThreshold("suggestion", "nitpick")).toBe(true);
	});

	test("nitpick only meets nitpick", () => {
		expect(meetsThreshold("nitpick", "critical")).toBe(false);
		expect(meetsThreshold("nitpick", "warning")).toBe(false);
		expect(meetsThreshold("nitpick", "suggestion")).toBe(false);
		expect(meetsThreshold("nitpick", "nitpick")).toBe(true);
	});
});
