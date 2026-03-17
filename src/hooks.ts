import type { ToolResultObject } from "@github/copilot-sdk";

type Invocation = { sessionId: string };

type PreToolUseInput = {
	timestamp: number;
	cwd: string;
	toolName: string;
	toolArgs: unknown;
};
type PreToolUseOutput = {
	permissionDecision?: "allow" | "deny" | "ask";
	permissionDecisionReason?: string;
	modifiedArgs?: unknown;
	additionalContext?: string;
	suppressOutput?: boolean;
};
type PostToolUseInput = {
	timestamp: number;
	cwd: string;
	toolName: string;
	toolArgs: unknown;
	toolResult: ToolResultObject;
};
type PostToolUseOutput = {
	modifiedResult?: ToolResultObject;
	additionalContext?: string;
	suppressOutput?: boolean;
};
type ErrorOccurredInput = {
	timestamp: number;
	cwd: string;
	error: string;
	errorContext: "model_call" | "tool_execution" | "system" | "user_input";
	recoverable: boolean;
};
type ErrorOccurredOutput = {
	suppressOutput?: boolean;
	errorHandling?: "retry" | "skip" | "abort";
	retryCount?: number;
	userNotification?: string;
};
type SessionEndInput = {
	timestamp: number;
	cwd: string;
	reason: "complete" | "error" | "abort" | "timeout" | "user_exit";
	finalMessage?: string;
	error?: string;
};
type SessionEndOutput = {
	suppressOutput?: boolean;
	cleanupActions?: string[];
	sessionSummary?: string;
};
type SessionStartInput = {
	timestamp: number;
	cwd: string;
	source: "startup" | "resume" | "new";
	initialPrompt?: string;
};
type SessionStartOutput = {
	additionalContext?: string;
	modifiedConfig?: Record<string, unknown>;
};

export type SessionHooks = {
	onPreToolUse?: (
		input: PreToolUseInput,
		inv: Invocation,
	) => Promise<PreToolUseOutput | undefined> | PreToolUseOutput | undefined;
	onPostToolUse?: (
		input: PostToolUseInput,
		inv: Invocation,
	) => Promise<PostToolUseOutput | undefined> | PostToolUseOutput | undefined;
	onErrorOccurred?: (
		input: ErrorOccurredInput,
		inv: Invocation,
	) =>
		| Promise<ErrorOccurredOutput | undefined>
		| ErrorOccurredOutput
		| undefined;
	onSessionEnd?: (
		input: SessionEndInput,
		inv: Invocation,
	) => Promise<SessionEndOutput | undefined> | SessionEndOutput | undefined;
	onSessionStart?: (
		input: SessionStartInput,
		inv: Invocation,
	) => Promise<SessionStartOutput | undefined> | SessionStartOutput | undefined;
};

const SOURCE_EXTS = new Set([
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
]);

export function createPostToolUseHook(): (
	input: PostToolUseInput,
	inv: Invocation,
) => Promise<PostToolUseOutput | undefined> {
	return async (input, _invocation) => {
		if (input.toolName !== "read_file") return undefined;

		const args = input.toolArgs as Record<string, unknown> | undefined;
		const filePath = args?.path as string | undefined;
		if (!filePath) return undefined;

		const ext = filePath.slice(filePath.lastIndexOf("."));
		if (!SOURCE_EXTS.has(ext)) return undefined;

		const baseName = filePath
			.replace(/\.[^/.]+$/, "")
			.replace(/^src\//, "tests/");
		return {
			additionalContext: `💡 Check if a test companion exists at ${baseName}.test${ext} — if so, verify test coverage for changes in this file.`,
		};
	};
}

export function createErrorOccurredHook(): (
	input: ErrorOccurredInput,
	inv: Invocation,
) => Promise<ErrorOccurredOutput> {
	return async (input, _invocation) => {
		if (input.errorContext === "system") {
			return {
				errorHandling: "abort" as const,
				userNotification: `System error: ${input.error}`,
			};
		}

		if (input.recoverable && input.errorContext === "model_call") {
			return {
				errorHandling: "retry" as const,
				retryCount: 2,
			};
		}

		return {
			errorHandling: "skip" as const,
			userNotification: `Skipped due to error: ${input.error}`,
		};
	};
}

export function createSessionEndHook(): (
	input: SessionEndInput,
	inv: Invocation,
) => Promise<SessionEndOutput> {
	return async (input, _invocation) => {
		return {
			sessionSummary: `Review session ended: ${input.reason}`,
		};
	};
}

export function createSessionStartHook(): (
	input: SessionStartInput,
	inv: Invocation,
) => Promise<SessionStartOutput> {
	return async (_input, _invocation) => {
		return {
			additionalContext:
				"This is an automated code review session. Focus on actionable findings only.",
		};
	};
}

export function createHooks(): SessionHooks {
	return {
		onPostToolUse: createPostToolUseHook(),
		onErrorOccurred: createErrorOccurredHook(),
		onSessionEnd: createSessionEndHook(),
		onSessionStart: createSessionStartHook(),
	};
}
