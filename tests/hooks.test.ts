import { describe, expect, test } from "bun:test";
import {
	createPostToolUseHook,
	createErrorOccurredHook,
	createSessionEndHook,
	createSessionStartHook,
	createHooks,
} from "../src/hooks.ts";

const inv = { sessionId: "test-session" };

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
	test("returns post tool and lifecycle hooks", () => {
		const hooks = createHooks();

		expect(hooks.onPreToolUse).toBeUndefined();
		expect(hooks.onPostToolUse).toBeDefined();
		expect(hooks.onErrorOccurred).toBeDefined();
		expect(hooks.onSessionEnd).toBeDefined();
		expect(hooks.onSessionStart).toBeDefined();
	});
});
