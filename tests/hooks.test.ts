import { describe, expect, test } from "bun:test";
import {
	createPreToolUseHook,
	createPostToolUseHook,
	createUserPromptSubmittedHook,
	createErrorOccurredHook,
	createSessionEndHook,
	createSessionStartHook,
	createHooks,
} from "../src/hooks.ts";

const inv = { sessionId: "test-session" };

describe("createPreToolUseHook", () => {
	test("denies destructive tools", () => {
		const hook = createPreToolUseHook();
		for (const toolName of [
			"edit_file",
			"write_file",
			"shell",
			"git_push",
			"web_fetch",
		]) {
			const result = hook(
				{ timestamp: Date.now(), cwd: "/tmp", toolName, toolArgs: {} },
				inv,
			);
			expect(result?.permissionDecision).toBe("deny");
		}
	});

	test("allows safe tools", () => {
		const hook = createPreToolUseHook();
		const result = hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				toolName: "read_file",
				toolArgs: {},
			},
			inv,
		);
		expect(result).toBeUndefined();
	});

	test("allows emit_finding tool", () => {
		const hook = createPreToolUseHook();
		const result = hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				toolName: "emit_finding",
				toolArgs: {},
			},
			inv,
		);
		expect(result).toBeUndefined();
	});
});

describe("createPostToolUseHook", () => {
	test("detects test companion files", async () => {
		const hook = createPostToolUseHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				toolName: "read_file",
				toolArgs: { path: "src/auth.ts" },
				toolResult: {
					textResultForLlm: "function validateToken() { ... }",
					resultType: "success",
				},
			},
			inv,
		);

		expect(result?.additionalContext).toContain("test");
	});

	test("no context injection for non-source files", async () => {
		const hook = createPostToolUseHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				toolName: "read_file",
				toolArgs: { path: "package.json" },
				toolResult: {
					textResultForLlm: "{}",
					resultType: "success",
				},
			},
			inv,
		);

		expect(result?.additionalContext).toBeUndefined();
	});

	test("no context for non-read_file tools", async () => {
		const hook = createPostToolUseHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				toolName: "list_files",
				toolArgs: {},
				toolResult: {
					textResultForLlm: "file1.ts\nfile2.ts",
					resultType: "success",
				},
			},
			inv,
		);

		expect(result).toBeUndefined();
	});
});

describe("createUserPromptSubmittedHook", () => {
	test("suppresses empty prompts", () => {
		const hook = createUserPromptSubmittedHook();
		const result = hook(
			{ timestamp: Date.now(), cwd: "/tmp", prompt: "" },
			inv,
		);
		expect(result?.suppressOutput).toBe(true);
	});

	test("suppresses whitespace-only prompts", () => {
		const hook = createUserPromptSubmittedHook();
		const result = hook(
			{ timestamp: Date.now(), cwd: "/tmp", prompt: "   " },
			inv,
		);
		expect(result?.suppressOutput).toBe(true);
	});

	test("passes through valid prompts", () => {
		const hook = createUserPromptSubmittedHook();
		const result = hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				prompt: "Review this file",
			},
			inv,
		);
		expect(result).toBeUndefined();
	});
});

describe("createErrorOccurredHook", () => {
	test("retries recoverable model errors", async () => {
		const hook = createErrorOccurredHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				error: "Rate limit exceeded",
				errorContext: "model_call",
				recoverable: true,
			},
			inv,
		);

		expect(result?.errorHandling).toBe("retry");
		expect(result?.retryCount).toBe(2);
	});

	test("skips non-recoverable tool errors", async () => {
		const hook = createErrorOccurredHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				error: "File not found",
				errorContext: "tool_execution",
				recoverable: false,
			},
			inv,
		);

		expect(result?.errorHandling).toBe("skip");
	});

	test("aborts system errors", async () => {
		const hook = createErrorOccurredHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				error: "Connection lost",
				errorContext: "system",
				recoverable: false,
			},
			inv,
		);

		expect(result?.errorHandling).toBe("abort");
	});
});

describe("createSessionEndHook", () => {
	test("returns session summary", async () => {
		const hook = createSessionEndHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				reason: "complete",
			},
			inv,
		);

		expect(result?.sessionSummary).toContain("complete");
	});
});

describe("createSessionStartHook", () => {
	test("returns additional context", async () => {
		const hook = createSessionStartHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				source: "new",
			},
			inv,
		);

		expect(result?.additionalContext).toContain("automated");
	});
});

describe("createHooks", () => {
	test("returns all hooks including new ones", () => {
		const hooks = createHooks();

		expect(hooks.onPreToolUse).toBeDefined();
		expect(hooks.onPostToolUse).toBeDefined();
		expect(hooks.onUserPromptSubmitted).toBeDefined();
		expect(hooks.onErrorOccurred).toBeDefined();
		expect(hooks.onSessionEnd).toBeDefined();
		expect(hooks.onSessionStart).toBeDefined();
	});
});

// ── Session lifecycle — all end reasons ──────────────────────────────────────

describe("createSessionEndHook — all reason variants", () => {
	const reasons = [
		"complete",
		"error",
		"abort",
		"timeout",
		"user_exit",
	] as const;

	for (const reason of reasons) {
		test(`returns summary containing '${reason}'`, async () => {
			const hook = createSessionEndHook();
			const result = await hook(
				{ timestamp: Date.now(), cwd: "/tmp", reason },
				inv,
			);

			expect(result?.sessionSummary).toContain(reason);
		});
	}

	test("includes error field in summary when reason is 'error'", async () => {
		const hook = createSessionEndHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				reason: "error",
				error: "Connection timeout",
			},
			inv,
		);

		expect(result?.sessionSummary).toBeDefined();
		expect(result?.sessionSummary).toContain("error");
	});

	test("includes finalMessage when provided", async () => {
		const hook = createSessionEndHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				reason: "complete",
				finalMessage: "All files reviewed",
			},
			inv,
		);

		expect(result?.sessionSummary).toBeDefined();
	});
});

// ── Session lifecycle — all start sources ────────────────────────────────────

describe("createSessionStartHook — all source variants", () => {
	const sources = ["startup", "resume", "new"] as const;

	for (const source of sources) {
		test(`returns context for source '${source}'`, async () => {
			const hook = createSessionStartHook();
			const result = await hook(
				{ timestamp: Date.now(), cwd: "/tmp", source },
				inv,
			);

			expect(result?.additionalContext).toBeDefined();
			expect(result?.additionalContext).toContain("automated");
		});
	}

	test("context mentions automated review regardless of source", async () => {
		const hook = createSessionStartHook();

		for (const source of ["startup", "resume", "new"] as const) {
			const result = await hook(
				{ timestamp: Date.now(), cwd: "/tmp", source },
				inv,
			);

			expect(result?.additionalContext).toContain("automated code review");
		}
	});

	test("accepts optional initialPrompt without affecting output", async () => {
		const hook = createSessionStartHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				source: "new",
				initialPrompt: "Review src/auth.ts",
			},
			inv,
		);

		expect(result?.additionalContext).toBeDefined();
	});
});

// ── PostToolUse — edge cases with malformed toolArgs ─────────────────────────

describe("createPostToolUseHook — toolArgs edge cases", () => {
	test("handles undefined toolArgs without crashing", async () => {
		const hook = createPostToolUseHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				toolName: "read_file",
				// biome-ignore lint/suspicious/noExplicitAny: testing undefined toolArgs
				toolArgs: undefined as any,
				toolResult: {
					textResultForLlm: "code",
					resultType: "success",
				},
			},
			inv,
		);

		expect(result).toBeUndefined();
	});

	test("handles null toolArgs without crashing", async () => {
		const hook = createPostToolUseHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				toolName: "read_file",
				// biome-ignore lint/suspicious/noExplicitAny: testing null toolArgs
				toolArgs: null as any,
				toolResult: {
					textResultForLlm: "code",
					resultType: "success",
				},
			},
			inv,
		);

		expect(result).toBeUndefined();
	});

	test("handles empty string path without crashing", async () => {
		const hook = createPostToolUseHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				toolName: "read_file",
				toolArgs: { path: "" },
				toolResult: {
					textResultForLlm: "code",
					resultType: "success",
				},
			},
			inv,
		);

		// Empty path has no extension → no source match → undefined
		expect(result).toBeUndefined();
	});
});

// ── ErrorOccurred — recoverable tool execution errors ────────────────────────

describe("createErrorOccurredHook — tool execution errors", () => {
	test("skips recoverable tool_execution errors (does not retry)", async () => {
		const hook = createErrorOccurredHook();
		const result = await hook(
			{
				timestamp: Date.now(),
				cwd: "/tmp",
				error: "Permission denied",
				errorContext: "tool_execution",
				recoverable: true,
			},
			inv,
		);

		// Only model_call errors get retried; tool_execution always skips
		expect(result?.errorHandling).toBe("skip");
	});

	test("retry is reserved exclusively for recoverable model_call errors", async () => {
		const hook = createErrorOccurredHook();

		const contexts = ["tool_execution", "user_input"] as const;
		for (const ctx of contexts) {
			const result = await hook(
				{
					timestamp: Date.now(),
					cwd: "/tmp",
					error: "Some error",
					errorContext: ctx,
					recoverable: true,
				},
				inv,
			);

			expect(result?.errorHandling).not.toBe("retry");
		}
	});
});
