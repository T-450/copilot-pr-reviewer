import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { approveAll } from "@github/copilot-sdk";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	createEmitFindingTool,
	FindingArgsSchema,
	buildFilePrompt,
	buildSystemPrompt,
} from "../src/review.ts";
import {
	createPreToolUseHook,
	createPostToolUseHook,
	createUserPromptSubmittedHook,
	createErrorOccurredHook,
	createHooks,
} from "../src/hooks.ts";
import { loadConfig } from "../src/config.ts";
import {
	buildReplySessionConfig,
	buildSessionConfig,
	getReplySystemPrompt,
	type SessionConfigInputs,
} from "../src/session.ts";
import type { PRMetadata } from "../src/ado/client.ts";
import type { Config } from "../src/config.ts";
import type { Finding } from "../src/types.ts";

// ── Shared fixtures for session config tests ─────────────────────────────────

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
	title: "Test PR",
	description: "Test description",
	workItemIds: [],
};

function makeInputs(
	overrides: Partial<SessionConfigInputs> = {},
): SessionConfigInputs {
	const findings: Finding[] = [];
	return {
		repoId: "repo-1",
		prId: "42",
		iteration: 1,
		pr: samplePR,
		config: defaultConfig,
		tools: [createEmitFindingTool(findings)],
		repoRoot: "/tmp/test-repo",
		...overrides,
	};
}

// ── Shared test helpers ─────────────────────────────────────────────────────

const inv = {
	sessionId: "test-session",
	toolCallId: "tc1",
	toolName: "emit_finding",
	arguments: {},
};

function validFindingArgs(overrides: Record<string, unknown> = {}) {
	return {
		filePath: "src/app.ts",
		startLine: 10,
		endLine: 15,
		severity: "warning" as const,
		category: "correctness" as const,
		title: "Possible null dereference",
		message: "Variable may be null at runtime",
		confidence: "high" as const,
		...overrides,
	};
}

// ── defineTool() migration ──────────────────────────────────────────────────

describe("defineTool() migration — tool contract", () => {
	test("tool created via defineTool() has correct name and description", () => {
		const findings: Finding[] = [];
		const tool = createEmitFindingTool(findings);

		expect(tool.name).toBe("emit_finding");
		expect(tool.description).toContain("Report a code review finding");
		expect(typeof tool.handler).toBe("function");
	});

	test("handler returns success string with severity, title, and location", async () => {
		const findings: Finding[] = [];
		const tool = createEmitFindingTool(findings);

		const result = await tool.handler(
			validFindingArgs({
				filePath: "src/auth.ts",
				startLine: 3,
				severity: "critical",
				category: "security",
				title: "Hardcoded secret",
			}),
			inv,
		);

		expect(result).toContain("Finding recorded");
		expect(result).toContain("critical");
		expect(result).toContain("Hardcoded secret");
		expect(result).toContain("src/auth.ts:3");
	});

	test("handler stores optional suggestion field when provided", async () => {
		const findings: Finding[] = [];
		const tool = createEmitFindingTool(findings);

		await tool.handler(
			validFindingArgs({ suggestion: "return parseInt(input, 10);" }),
			inv,
		);

		expect(findings[0].suggestion).toBe("return parseInt(input, 10);");
	});

	test("handler omits suggestion when not provided", async () => {
		const findings: Finding[] = [];
		const tool = createEmitFindingTool(findings);

		await tool.handler(validFindingArgs(), inv);

		expect(findings[0].suggestion).toBeUndefined();
	});

	test("handler accumulates multiple findings in the same array", async () => {
		const findings: Finding[] = [];
		const tool = createEmitFindingTool(findings);

		await tool.handler(
			validFindingArgs({ filePath: "a.ts", title: "Issue 1" }),
			inv,
		);
		await tool.handler(
			validFindingArgs({ filePath: "b.ts", title: "Issue 2" }),
			inv,
		);

		expect(findings).toHaveLength(2);
		expect(findings[0].filePath).toBe("a.ts");
		expect(findings[1].filePath).toBe("b.ts");
	});

	test("fingerprints differ when category changes", async () => {
		const f1: Finding[] = [];
		const f2: Finding[] = [];

		await createEmitFindingTool(f1).handler(
			validFindingArgs({ category: "correctness" }),
			inv,
		);
		await createEmitFindingTool(f2).handler(
			validFindingArgs({ category: "security" }),
			inv,
		);

		expect(f1[0].fingerprint).not.toBe(f2[0].fingerprint);
	});

	test("fingerprints differ when startLine changes", async () => {
		const f1: Finding[] = [];
		const f2: Finding[] = [];

		await createEmitFindingTool(f1).handler(
			validFindingArgs({ startLine: 10 }),
			inv,
		);
		await createEmitFindingTool(f2).handler(
			validFindingArgs({ startLine: 20 }),
			inv,
		);

		expect(f1[0].fingerprint).not.toBe(f2[0].fingerprint);
	});

	test("fingerprint is exactly 16 hex characters", async () => {
		const findings: Finding[] = [];
		await createEmitFindingTool(findings).handler(validFindingArgs(), inv);

		expect(findings[0].fingerprint).toMatch(/^[0-9a-f]{16}$/);
	});
});

describe("defineTool() migration — FindingArgsSchema validation", () => {
	test("accepts valid finding with all required fields", () => {
		const result = FindingArgsSchema.safeParse(validFindingArgs());
		expect(result.success).toBe(true);
	});

	test("rejects missing required fields", () => {
		const result = FindingArgsSchema.safeParse({ filePath: "src/test.ts" });
		expect(result.success).toBe(false);
	});

	test("rejects invalid category value", () => {
		const result = FindingArgsSchema.safeParse(
			validFindingArgs({ category: "performance" }),
		);
		expect(result.success).toBe(false);
	});

	test("rejects empty title", () => {
		const result = FindingArgsSchema.safeParse(validFindingArgs({ title: "" }));
		expect(result.success).toBe(false);
	});

	test("rejects title exceeding 120 characters", () => {
		const result = FindingArgsSchema.safeParse(
			validFindingArgs({ title: "A".repeat(121) }),
		);
		expect(result.success).toBe(false);
	});

	test("accepts title at exactly 120 characters", () => {
		const result = FindingArgsSchema.safeParse(
			validFindingArgs({ title: "A".repeat(120) }),
		);
		expect(result.success).toBe(true);
	});

	test("rejects non-positive startLine", () => {
		const result = FindingArgsSchema.safeParse(
			validFindingArgs({ startLine: 0 }),
		);
		expect(result.success).toBe(false);
	});

	test("rejects negative endLine", () => {
		const result = FindingArgsSchema.safeParse(
			validFindingArgs({ endLine: -1 }),
		);
		expect(result.success).toBe(false);
	});

	test("rejects invalid severity value", () => {
		const result = FindingArgsSchema.safeParse(
			validFindingArgs({ severity: "blocker" }),
		);
		expect(result.success).toBe(false);
	});

	test("rejects invalid confidence value", () => {
		const result = FindingArgsSchema.safeParse(
			validFindingArgs({ confidence: "certain" }),
		);
		expect(result.success).toBe(false);
	});

	test("accepts optional suggestion field", () => {
		const result = FindingArgsSchema.safeParse(
			validFindingArgs({ suggestion: "use const instead" }),
		);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.suggestion).toBe("use const instead");
		}
	});
});

// ── Attachment-based review requests ────────────────────────────────────────

describe("attachment-based review requests", () => {
	test("buildFilePrompt generates attachment-compatible prompt with emit_finding instruction", () => {
		const prompt = buildFilePrompt("src/auth.ts", "add");

		expect(prompt).toContain("emit_finding");
		expect(prompt).toContain("src/auth.ts");
		expect(prompt).toContain("add");
	});

	test("buildFilePrompt works with all change types", () => {
		for (const changeType of ["add", "edit", "delete", "rename", "unknown"]) {
			const prompt = buildFilePrompt("src/file.ts", changeType);
			expect(prompt).toContain(changeType);
			expect(prompt).toContain("src/file.ts");
		}
	});

	test("file attachment shape matches SDK sendAndWait contract", () => {
		const repoRoot = "/home/user/repo";
		const filePath = "src/auth.ts";
		const absolutePath = `${repoRoot}/${filePath}`;

		const sendPayload = {
			prompt: buildFilePrompt(filePath, "edit"),
			attachments: [{ type: "file" as const, path: absolutePath }],
		};

		expect(sendPayload.prompt).toContain(filePath);
		expect(sendPayload.attachments).toHaveLength(1);
		expect(sendPayload.attachments[0].type).toBe("file");
		expect(sendPayload.attachments[0].path).toBe("/home/user/repo/src/auth.ts");
		expect(sendPayload.attachments[0].path.startsWith("/")).toBe(true);
	});

	test("system prompt includes review contract for attachment-based review", () => {
		const pr = {
			title: "Test PR",
			description: "Test",
			workItemIds: [] as number[],
		};
		const config = {
			ignore: [],
			severityThreshold: "suggestion" as const,
			maxFiles: 30,
			planning: true,
			clustering: true,
			clusterThreshold: 3,
			reasoningEffort: "low" as const,
		};

		const prompt = buildSystemPrompt(pr, config);

		expect(prompt).toContain("emit_finding");
		expect(prompt).toContain("Review Contract");
		expect(prompt).toContain("suggestion");
	});
});

// ── Reasoning mode selection ────────────────────────────────────────────────

describe("reasoning mode selection", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "reasoning-test-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	test("defaults to 'low' when config file is missing", async () => {
		const config = await loadConfig(join(tmpDir, "nonexistent.yml"));
		expect(config.reasoningEffort).toBe("low");
	});

	test("parses 'medium' reasoning effort", async () => {
		await writeFile(join(tmpDir, ".prreviewer.yml"), "reasoningEffort: medium");
		const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));
		expect(config.reasoningEffort).toBe("medium");
	});

	test("parses 'high' reasoning effort", async () => {
		await writeFile(join(tmpDir, ".prreviewer.yml"), "reasoningEffort: high");
		const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));
		expect(config.reasoningEffort).toBe("high");
	});

	test("parses 'xhigh' reasoning effort", async () => {
		await writeFile(join(tmpDir, ".prreviewer.yml"), "reasoningEffort: xhigh");
		const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));
		expect(config.reasoningEffort).toBe("xhigh");
	});

	test("falls back to defaults for invalid reasoning effort value", async () => {
		await writeFile(join(tmpDir, ".prreviewer.yml"), "reasoningEffort: turbo");
		const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));
		expect(config.reasoningEffort).toBe("low");
	});

	test("reasoning effort coexists with other config fields", async () => {
		const yaml = [
			"severityThreshold: warning",
			"reasoningEffort: high",
			"maxFiles: 20",
		].join("\n");
		await writeFile(join(tmpDir, ".prreviewer.yml"), yaml);
		const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));

		expect(config.reasoningEffort).toBe("high");
		expect(config.severityThreshold).toBe("warning");
		expect(config.maxFiles).toBe(20);
	});

	test("quoted string values parse correctly", async () => {
		await writeFile(join(tmpDir, ".prreviewer.yml"), 'reasoningEffort: "low"');
		const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));
		expect(config.reasoningEffort).toBe("low");
	});
});

// ── Hook wiring — onPreToolUse ──────────────────────────────────────────────

describe("hook wiring — onPreToolUse denials", () => {
	const hookInv = { sessionId: "test-session" };

	test("denies all five destructive tools with a reason mentioning the tool name", () => {
		const hook = createPreToolUseHook();
		const deniedTools = [
			"edit_file",
			"write_file",
			"shell",
			"git_push",
			"web_fetch",
		];

		for (const toolName of deniedTools) {
			const result = hook(
				{ timestamp: Date.now(), cwd: "/tmp", toolName, toolArgs: {} },
				hookInv,
			);
			expect(result?.permissionDecision).toBe("deny");
			expect(result?.permissionDecisionReason).toContain(toolName);
		}
	});

	test("allows read-only and custom tools", () => {
		const hook = createPreToolUseHook();

		for (const toolName of [
			"read_file",
			"list_files",
			"search_files",
			"emit_finding",
		]) {
			const result = hook(
				{ timestamp: Date.now(), cwd: "/tmp", toolName, toolArgs: {} },
				hookInv,
			);
			expect(result).toBeUndefined();
		}
	});
});

// ── Hook wiring — onPostToolUse ─────────────────────────────────────────────

describe("hook wiring — onPostToolUse test companions", () => {
	const hookInv = { sessionId: "test-session" };
	const toolResult = {
		textResultForLlm: "code",
		resultType: "success" as const,
	};

	test("maps src/ paths to tests/ for companion hint", async () => {
		const hook = createPostToolUseHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				toolName: "read_file",
				toolArgs: { path: "src/review.ts" },
				toolResult,
			},
			hookInv,
		);

		expect(result?.additionalContext).toContain("tests/review.test.ts");
	});

	test("handles deeply nested source paths", async () => {
		const hook = createPostToolUseHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				toolName: "read_file",
				toolArgs: { path: "src/ado/client.ts" },
				toolResult,
			},
			hookInv,
		);

		expect(result?.additionalContext).toContain("tests/ado/client.test.ts");
	});

	test("preserves non-src prefixed paths in companion hint", async () => {
		const hook = createPostToolUseHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				toolName: "read_file",
				toolArgs: { path: "lib/helper.py" },
				toolResult,
			},
			hookInv,
		);

		expect(result?.additionalContext).toContain("lib/helper.test.py");
	});

	test("skips when toolArgs has no path property", async () => {
		const hook = createPostToolUseHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				toolName: "read_file",
				toolArgs: {},
				toolResult,
			},
			hookInv,
		);

		expect(result).toBeUndefined();
	});

	test("recognizes all supported source extensions", async () => {
		const hook = createPostToolUseHook();
		const exts = [
			".ts",
			".tsx",
			".js",
			".jsx",
			".py",
			".go",
			".rs",
			".java",
			".cs",
			".rb",
			".php",
			".swift",
			".kt",
			".c",
			".cpp",
			".h",
		];

		for (const ext of exts) {
			const result = await hook(
				{
					timestamp: Date.now(),
					cwd: "/tmp",
					toolName: "read_file",
					toolArgs: { path: `src/file${ext}` },
					toolResult,
				},
				hookInv,
			);

			expect(result?.additionalContext).toContain(".test");
		}
	});

	test("ignores non-source extensions", async () => {
		const hook = createPostToolUseHook();

		for (const ext of [".json", ".yml", ".md", ".txt", ".svg"]) {
			const result = await hook(
				{
					timestamp: Date.now(),
					cwd: "/tmp",
					toolName: "read_file",
					toolArgs: { path: `config/file${ext}` },
					toolResult,
				},
				hookInv,
			);

			expect(result).toBeUndefined();
		}
	});
});

// ── Hook wiring — onUserPromptSubmitted ─────────────────────────────────────

describe("hook wiring — onUserPromptSubmitted guard", () => {
	const hookInv = { sessionId: "test-session" };

	test("suppresses null prompt without throwing", () => {
		const hook = createUserPromptSubmittedHook();
		const result = hook(
			{ timestamp: Date.now(), cwd: "/tmp", prompt: null as unknown as string },
			hookInv,
		);
		expect(result?.suppressOutput).toBe(true);
	});

	test("suppresses undefined prompt without throwing", () => {
		const hook = createUserPromptSubmittedHook();
		const result = hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				prompt: undefined as unknown as string,
			},
			hookInv,
		);
		expect(result?.suppressOutput).toBe(true);
	});

	test("passes through prompt with meaningful content", () => {
		const hook = createUserPromptSubmittedHook();
		const result = hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				prompt: "Review src/auth.ts for security issues",
			},
			hookInv,
		);
		expect(result).toBeUndefined();
	});
});

// ── Hook wiring — onErrorOccurred edge cases ────────────────────────────────

describe("hook wiring — onErrorOccurred edge cases", () => {
	const hookInv = { sessionId: "test-session" };

	test("skips non-recoverable model errors instead of retrying", async () => {
		const hook = createErrorOccurredHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				error: "Model unavailable",
				errorContext: "model_call",
				recoverable: false,
			},
			hookInv,
		);

		expect(result?.errorHandling).toBe("skip");
	});

	test("aborts system errors even when marked recoverable", async () => {
		const hook = createErrorOccurredHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				error: "Disk full",
				errorContext: "system",
				recoverable: true,
			},
			hookInv,
		);

		expect(result?.errorHandling).toBe("abort");
	});

	test("skips user_input errors", async () => {
		const hook = createErrorOccurredHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				error: "Invalid input",
				errorContext: "user_input",
				recoverable: false,
			},
			hookInv,
		);

		expect(result?.errorHandling).toBe("skip");
	});

	test("includes userNotification in abort and skip responses", async () => {
		const hook = createErrorOccurredHook();

		const abortResult = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				error: "Connection lost",
				errorContext: "system",
				recoverable: false,
			},
			hookInv,
		);
		expect(abortResult?.userNotification).toContain("Connection lost");

		const skipResult = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				error: "File not found",
				errorContext: "tool_execution",
				recoverable: false,
			},
			hookInv,
		);
		expect(skipResult?.userNotification).toContain("File not found");
	});
});

// ── createHooks() aggregation ───────────────────────────────────────────────

describe("createHooks() aggregation", () => {
	test("all six hook slots are populated functions", () => {
		const hooks = createHooks();

		expect(typeof hooks.onPreToolUse).toBe("function");
		expect(typeof hooks.onPostToolUse).toBe("function");
		expect(typeof hooks.onUserPromptSubmitted).toBe("function");
		expect(typeof hooks.onErrorOccurred).toBe("function");
		expect(typeof hooks.onSessionEnd).toBe("function");
		expect(typeof hooks.onSessionStart).toBe("function");
	});

	test("aggregated hooks produce correct results end-to-end", async () => {
		const hooks = createHooks();
		const hookInv = { sessionId: "wiring-test" };

		// PreToolUse denies write_file
		const preResult = hooks.onPreToolUse?.(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				toolName: "write_file",
				toolArgs: {},
			},
			hookInv,
		);
		expect(preResult).toBeDefined();

		// PreToolUse allows read_file
		const allowResult = hooks.onPreToolUse?.(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				toolName: "read_file",
				toolArgs: {},
			},
			hookInv,
		);
		expect(allowResult).toBeUndefined();

		// UserPromptSubmitted allows valid prompt
		const promptResult = hooks.onUserPromptSubmitted?.(
			{ timestamp: Date.now(), cwd: "/tmp", prompt: "Review this" },
			hookInv,
		);
		expect(promptResult).toBeUndefined();

		// ErrorOccurred retries model errors
		const errorResult = await hooks.onErrorOccurred?.(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				error: "timeout",
				errorContext: "model_call",
				recoverable: true,
			},
			hookInv,
		);
		expect(errorResult).toBeDefined();

		// SessionStart returns context
		const startResult = await hooks.onSessionStart?.(
			{ timestamp: Date.now(), cwd: "/tmp", source: "new" },
			hookInv,
		);
		expect(startResult).toBeDefined();

		// SessionEnd returns summary
		const endResult = await hooks.onSessionEnd?.(
			{ timestamp: Date.now(), cwd: "/tmp", reason: "complete" },
			hookInv,
		);
		expect(endResult).toBeDefined();
	});
});

// ── Session config — infiniteSessions ────────────────────────────────────────

describe("session config — infiniteSessions", () => {
	test("infiniteSessions is enabled by default", () => {
		const cfg = buildSessionConfig(makeInputs());
		// biome-ignore lint/suspicious/noExplicitAny: accessing SDK config property
		const inf = (cfg as any).infiniteSessions;

		expect(inf).toBeDefined();
		expect(inf.enabled).toBe(true);
	});

	test("backgroundCompactionThreshold is set to 0.85", () => {
		const cfg = buildSessionConfig(makeInputs());
		// biome-ignore lint/suspicious/noExplicitAny: accessing SDK config property
		const inf = (cfg as any).infiniteSessions;

		expect(inf.backgroundCompactionThreshold).toBe(0.85);
	});

	test("bufferExhaustionThreshold is set to 0.7", () => {
		const cfg = buildSessionConfig(makeInputs());
		// biome-ignore lint/suspicious/noExplicitAny: accessing SDK config property
		const inf = (cfg as any).infiniteSessions;

		expect(inf.bufferExhaustionThreshold).toBe(0.7);
	});
});

// ── Session config — systemMessage ───────────────────────────────────────────

describe("session config — systemMessage", () => {
	test("systemMessage mode is 'append'", () => {
		const cfg = buildSessionConfig(makeInputs());
		const msg = cfg.systemMessage as { content: string; mode: string };

		expect(msg.mode).toBe("append");
	});

	test("systemMessage content includes review instructions", () => {
		const cfg = buildSessionConfig(makeInputs());
		const msg = cfg.systemMessage as { content: string; mode: string };

		expect(msg.content).toContain("emit_finding");
		expect(msg.content).toContain("Review Contract");
	});

	test("systemMessage content reflects PR metadata", () => {
		const pr = {
			title: "My Custom PR",
			description: "Custom desc",
			workItemIds: [999],
		};
		const cfg = buildSessionConfig(makeInputs({ pr }));
		const msg = cfg.systemMessage as { content: string; mode: string };

		expect(msg.content).toContain("My Custom PR");
		expect(msg.content).toContain("Custom desc");
		expect(msg.content).toContain("999");
	});

	test("reply session config swaps in the reply-only system prompt", () => {
		const cfg = buildReplySessionConfig({
			repoId: "repo-1",
			prId: "42",
			iteration: 1,
			pr: samplePR,
			config: defaultConfig,
			repoRoot: "/tmp/test-repo",
		});
		const msg = cfg.systemMessage as { content: string; mode: string };

		expect(cfg.sessionId).toBe("reply-repo-1-42-1");
		expect(msg.mode).toBe("append");
		expect(msg.content).toBe(getReplySystemPrompt());
		expect(msg.content).not.toContain("emit_finding");
		// biome-ignore lint/suspicious/noExplicitAny: accessing SDK config property
		expect((cfg as any).customAgents).toEqual([]);
		expect(cfg.tools).toEqual([]);
	});
});

// ── Session config — onPermissionRequest ─────────────────────────────────────

describe("session config — onPermissionRequest", () => {
	test("onPermissionRequest is set to approveAll", () => {
		const cfg = buildSessionConfig(makeInputs());

		expect(cfg.onPermissionRequest).toBe(approveAll);
	});
});

// ── Session config — instruction config integration ──────────────────────────

describe("session config — instruction config integration", () => {
	test("skillDirectories flows into session config as empty array", () => {
		const cfg = buildSessionConfig(makeInputs());
		// biome-ignore lint/suspicious/noExplicitAny: accessing instruction config property
		const sessionAny = cfg as any;

		expect(sessionAny.skillDirectories).toEqual([]);
	});

	test("disabledSkills flows into session config as empty array", () => {
		const cfg = buildSessionConfig(makeInputs());
		// biome-ignore lint/suspicious/noExplicitAny: accessing instruction config property
		const sessionAny = cfg as any;

		expect(sessionAny.disabledSkills).toEqual([]);
	});
});

// ── Session config — all reasoningEffort values ──────────────────────────────

describe("session config — reasoningEffort propagation", () => {
	test("'low' flows through to session config", () => {
		const cfg = buildSessionConfig(
			makeInputs({ config: { ...defaultConfig, reasoningEffort: "low" } }),
		);
		expect(cfg.reasoningEffort).toBe("low");
	});

	test("'medium' flows through to session config", () => {
		const cfg = buildSessionConfig(
			makeInputs({ config: { ...defaultConfig, reasoningEffort: "medium" } }),
		);
		expect(cfg.reasoningEffort).toBe("medium");
	});

	test("'high' flows through to session config", () => {
		const cfg = buildSessionConfig(
			makeInputs({ config: { ...defaultConfig, reasoningEffort: "high" } }),
		);
		expect(cfg.reasoningEffort).toBe("high");
	});

	test("'xhigh' flows through to session config", () => {
		const cfg = buildSessionConfig(
			makeInputs({ config: { ...defaultConfig, reasoningEffort: "xhigh" } }),
		);
		expect(cfg.reasoningEffort).toBe("xhigh");
	});
});

// ── Session config — model selection via COPILOT_MODEL env var ───────────────

describe("session config — model env var fallback", () => {
	test("uses COPILOT_MODEL env var when set and no override", () => {
		const original = process.env.COPILOT_MODEL;
		process.env.COPILOT_MODEL = "gpt-4o-mini";

		const cfg = buildSessionConfig(makeInputs());
		expect(cfg.model).toBe("gpt-4o-mini");

		if (original !== undefined) {
			process.env.COPILOT_MODEL = original;
		} else {
			process.env.COPILOT_MODEL = undefined;
		}
	});

	test("explicit model input takes precedence over env var", () => {
		const original = process.env.COPILOT_MODEL;
		process.env.COPILOT_MODEL = "gpt-4o-mini";

		const cfg = buildSessionConfig(makeInputs({ model: "o3-mini" }));
		expect(cfg.model).toBe("o3-mini");

		if (original !== undefined) {
			process.env.COPILOT_MODEL = original;
		} else {
			process.env.COPILOT_MODEL = undefined;
		}
	});
});
