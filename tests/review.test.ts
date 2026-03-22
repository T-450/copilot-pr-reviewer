import { describe, expect, test } from "bun:test";
import {
	buildSystemPrompt,
	buildFilePrompt,
	createEmitFindingTool,
	buildPlanningPrompt,
} from "../src/review.ts";
import type { PRMetadata, ChangedFile } from "../src/ado/client.ts";
import type { Config } from "../src/config.ts";
import type { Finding } from "../src/types.ts";

const defaultConfig: Config = {
	ignore: [],
	severityThreshold: "suggestion",
	maxFiles: 30,
	planning: true,
	clustering: true,
	clusterThreshold: 3,
	reasoningEffort: "low",
};

const samplePR: PRMetadata = {
	title: "Fix null pointer in auth module",
	description: "Addresses crash when user token expires mid-session",
	workItemIds: [1234],
};

describe("buildSystemPrompt", () => {
	test("includes PR metadata", () => {
		const prompt = buildSystemPrompt(samplePR, defaultConfig);

		expect(prompt).toContain("Fix null pointer in auth module");
		expect(prompt).toContain("Addresses crash when user token expires");
	});

	test("includes severity threshold", () => {
		const prompt = buildSystemPrompt(samplePR, {
			...defaultConfig,
			severityThreshold: "warning",
		});

		expect(prompt).toContain("warning");
	});

	test("includes work item IDs when present", () => {
		const prompt = buildSystemPrompt(samplePR, defaultConfig);

		expect(prompt).toContain("1234");
	});

	test("handles empty description gracefully", () => {
		const pr: PRMetadata = { ...samplePR, description: "" };
		const prompt = buildSystemPrompt(pr, defaultConfig);

		expect(prompt).toContain("Fix null pointer in auth module");
		expect(typeof prompt).toBe("string");
	});

	test("keeps only dynamic review contract guidance", () => {
		const prompt = buildSystemPrompt(samplePR, defaultConfig);

		expect(prompt).toContain("Review Contract");
		expect(prompt).toContain("Only report findings");
		expect(prompt).not.toContain("Do NOT report style/formatting issues");
	});
});

describe("buildFilePrompt", () => {
	test("includes file path and change type", () => {
		const prompt = buildFilePrompt("src/auth.ts", "add");

		expect(prompt).toContain("src/auth.ts");
		expect(prompt).toContain("add");
	});

	test("includes emit_finding instruction", () => {
		const prompt = buildFilePrompt("src/auth.ts", "edit");

		expect(prompt).toContain("emit_finding");
	});
});

describe("createEmitFindingTool", () => {
	test("returns a tool with name emit_finding", () => {
		const findings: Finding[] = [];
		const tool = createEmitFindingTool(findings);

		expect(tool.name).toBe("emit_finding");
		expect(tool.description).toBeDefined();
	});

	test("handler collects findings with fingerprint", async () => {
		const findings: Finding[] = [];
		const tool = createEmitFindingTool(findings);

		await tool.handler(
			{
				filePath: "src/app.ts",
				startLine: 10,
				endLine: 15,
				severity: "warning",
				category: "correctness",
				title: "Possible null dereference",
				message: "Variable may be null at runtime",
				confidence: "high",
			},
			{
				sessionId: "test",
				toolCallId: "tc1",
				toolName: "emit_finding",
				arguments: {},
			},
		);

		expect(findings).toHaveLength(1);
		expect(findings[0].severity).toBe("warning");
		expect(findings[0].fingerprint).toBeDefined();
		expect(findings[0].fingerprint.length).toBeGreaterThan(0);
	});

	test("generates deterministic fingerprints", async () => {
		const findings1: Finding[] = [];
		const findings2: Finding[] = [];
		const tool1 = createEmitFindingTool(findings1);
		const tool2 = createEmitFindingTool(findings2);

		const args = {
			filePath: "src/app.ts",
			startLine: 10,
			endLine: 15,
			severity: "warning" as const,
			category: "correctness" as const,
			title: "Possible null dereference",
			message: "Variable may be null",
			confidence: "high" as const,
		};

		const invocation = {
			sessionId: "test",
			toolCallId: "tc1",
			toolName: "emit_finding",
			arguments: {},
		};

		await tool1.handler(args, invocation);
		await tool2.handler(args, invocation);

		expect(findings1[0].fingerprint).toBe(findings2[0].fingerprint);
	});

	test("rejects invalid severity gracefully", async () => {
		const findings: Finding[] = [];
		const tool = createEmitFindingTool(findings);

		const result = await tool.handler(
			{
				filePath: "src/app.ts",
				startLine: 10,
				endLine: 15,
				severity: "invalid_severity",
				category: "correctness",
				title: "Test",
				message: "Test message",
				confidence: "high",
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any,
			{
				sessionId: "test",
				toolCallId: "tc1",
				toolName: "emit_finding",
				arguments: {},
			},
		);

		expect(findings).toHaveLength(0);
		expect(result).toContain("Invalid");
	});
});

describe("buildPlanningPrompt", () => {
	test("includes file list", () => {
		const files: ChangedFile[] = [
			{ path: "src/auth.ts", changeType: 2, changeTrackingId: 1 },
			{ path: "src/utils.ts", changeType: 2, changeTrackingId: 2 },
			{ path: "src/index.ts", changeType: 1, changeTrackingId: 3 },
		];

		const prompt = buildPlanningPrompt(samplePR, files);

		expect(prompt).toContain("src/auth.ts");
		expect(prompt).toContain("src/utils.ts");
		expect(prompt).toContain("src/index.ts");
	});

	test("includes PR context", () => {
		const files: ChangedFile[] = [
			{ path: "a.ts", changeType: 2, changeTrackingId: 1 },
		];

		const prompt = buildPlanningPrompt(samplePR, files);

		expect(prompt).toContain("Fix null pointer");
	});
});
