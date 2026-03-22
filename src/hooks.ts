import type { ToolResultObject } from "@github/copilot-sdk";

type Invocation = { sessionId: string };

type BaseHookInput = {
	timestamp: number;
	cwd: string;
};

type PreToolUseInput = BaseHookInput & {
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
type PostToolUseInput = BaseHookInput & {
	toolName: string;
	toolArgs: unknown;
	toolResult: ToolResultObject;
};
type PostToolUseOutput = {
	modifiedResult?: ToolResultObject;
	additionalContext?: string;
	suppressOutput?: boolean;
};
type UserPromptSubmittedInput = BaseHookInput & {
	prompt: string;
};
type UserPromptSubmittedOutput = {
	modifiedPrompt?: string;
	additionalContext?: string;
	suppressOutput?: boolean;
};
type ErrorOccurredInput = BaseHookInput & {
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
type SessionEndInput = BaseHookInput & {
	reason: "complete" | "error" | "abort" | "timeout" | "user_exit";
	finalMessage?: string;
	error?: string;
};
type SessionEndOutput = {
	suppressOutput?: boolean;
	cleanupActions?: string[];
	sessionSummary?: string;
};
type SessionStartInput = BaseHookInput & {
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
	) => Promise<PreToolUseOutput | void> | PreToolUseOutput | void;
	onPostToolUse?: (
		input: PostToolUseInput,
		inv: Invocation,
	) => Promise<PostToolUseOutput | void> | PostToolUseOutput | void;
	onUserPromptSubmitted?: (
		input: UserPromptSubmittedInput,
		inv: Invocation,
	) =>
		| Promise<UserPromptSubmittedOutput | void>
		| UserPromptSubmittedOutput
		| void;
	onErrorOccurred?: (
		input: ErrorOccurredInput,
		inv: Invocation,
	) => Promise<ErrorOccurredOutput | void> | ErrorOccurredOutput | void;
	onSessionEnd?: (
		input: SessionEndInput,
		inv: Invocation,
	) => Promise<SessionEndOutput | void> | SessionEndOutput | void;
	onSessionStart?: (
		input: SessionStartInput,
		inv: Invocation,
	) => Promise<SessionStartOutput | void> | SessionStartOutput | void;
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

const DENIED_TOOLS = new Set([
	"edit_file",
	"write_file",
	"shell",
	"git_push",
	"web_fetch",
]);

export function createPreToolUseHook(): (
	input: PreToolUseInput,
	inv: Invocation,
) => PreToolUseOutput | undefined {
	return (input, _invocation) => {
		if (DENIED_TOOLS.has(input.toolName)) {
			return {
				permissionDecision: "deny" as const,
				permissionDecisionReason: `Tool "${input.toolName}" is not allowed in automated review sessions`,
			};
		}
		return undefined;
	};
}

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

export function createUserPromptSubmittedHook(): (
	input: UserPromptSubmittedInput,
	inv: Invocation,
) => UserPromptSubmittedOutput | undefined {
	return (input, _invocation) => {
		if (!input.prompt || input.prompt.trim().length === 0) {
			return { suppressOutput: true };
		}
		return undefined;
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
		onPreToolUse: createPreToolUseHook(),
		onPostToolUse: createPostToolUseHook(),
		onUserPromptSubmitted: createUserPromptSubmittedHook(),
		onErrorOccurred: createErrorOccurredHook(),
		onSessionEnd: createSessionEndHook(),
		onSessionStart: createSessionStartHook(),
	};
}
