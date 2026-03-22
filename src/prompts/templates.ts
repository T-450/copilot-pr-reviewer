import type { PRMetadata, ChangedFile } from "../ado/client.ts";
import type { Config } from "../config.ts";
import type { ReplyCandidateThread } from "../thread-context.ts";
import { CHANGE_TYPE_LABELS } from "../types.ts";

// ---------------------------------------------------------------------------
// System prompt — static review contract frame + dynamic PR context
// ---------------------------------------------------------------------------

const SYSTEM_PREAMBLE =
	"You are reviewing a pull request and must report issues with the emit_finding tool.";

const REVIEW_CONTRACT_RULES = [
	"Each finding MUST include: filePath, startLine, endLine, severity, category, title, message, confidence",
	"Use categories: correctness, security, reliability, maintainability, testing",
];

export function renderSystemPrompt(pr: PRMetadata, config: Config): string {
	const sections = [
		SYSTEM_PREAMBLE,
		"",
		"## PR Context",
		`**Title:** ${pr.title}`,
	];

	if (pr.description) {
		sections.push(`**Description:** ${pr.description}`);
	}

	if (pr.workItemIds.length > 0) {
		sections.push(
			`**Work Items:** ${pr.workItemIds.map((id) => `#${id}`).join(", ")}`,
		);
	}

	sections.push(
		"",
		"## Review Contract",
		`- Only report findings at severity \`${config.severityThreshold}\` or above`,
		...REVIEW_CONTRACT_RULES.map((r) => `- ${r}`),
	);

	return sections.join("\n");
}

// ---------------------------------------------------------------------------
// File review prompt — per-file instruction with change context
//
// Prompt-injected content: file path, change type, and review instructions.
// File content is delivered via a native SDK file attachment (see
// buildFileReviewRequest in review.ts), NOT embedded in the prompt text.
// ---------------------------------------------------------------------------

const FILE_REVIEW_INSTRUCTION =
	"Call `emit_finding` for each issue found. If the file is clean, respond with a brief confirmation and do not call `emit_finding`.";

export function renderFilePrompt(filePath: string, changeType: string): string {
	return [
		`Review the following file. Change type: ${changeType}.`,
		`File: ${filePath}`,
		"",
		FILE_REVIEW_INSTRUCTION,
	].join("\n");
}

// ---------------------------------------------------------------------------
// Planning prompt — review strategy before per-file passes
//
// Prompt-injected content: file paths and change-type labels.
// This is metadata (not file content) needed for the model to plan review
// order before any files are attached. File contents are never included here;
// they arrive later via per-file attachment-first requests.
// ---------------------------------------------------------------------------

const PLANNING_TASK_ITEMS = [
	"Which files are most likely to contain bugs or security issues",
	"Which files should be reviewed together (shared dependencies)",
	"Suggested review order (highest risk first)",
];

const PLANNING_CLOSING =
	"Respond with a brief review plan. Do NOT review the files yet.";

export function renderPlanningPrompt(
	pr: PRMetadata,
	files: readonly ChangedFile[],
): string {
	const fileList = files
		.map((f) => {
			const label = CHANGE_TYPE_LABELS[f.changeType] ?? "unknown";
			return `- ${f.path} (${label})`;
		})
		.join("\n");

	return [
		`You are planning a code review for PR: "${pr.title}"`,
		"",
		pr.description ? `Description: ${pr.description}` : "",
		"",
		"## Changed Files",
		fileList,
		"",
		"## Task",
		"Analyze the file list and PR description. Identify:",
		...PLANNING_TASK_ITEMS.map((item, i) => `${i + 1}. ${item}`),
		"",
		PLANNING_CLOSING,
	]
		.filter(Boolean)
		.join("\n");
}

type ReplyPromptOptions = {
	readonly thread: ReplyCandidateThread;
	readonly findingSummary: string;
	readonly latestUserPrompt: string;
	readonly threadTranscript: string;
	readonly changeContext?: string;
};

const REPLY_CONTRACT_RULES = [
	"Answer the latest user follow-up in the same thread with a direct, helpful reply.",
	"Use the original finding summary and transcript to stay consistent with prior bot comments.",
	"If file content is attached, use it for grounding instead of requesting the user to restate the code.",
	"Do not mention hidden bot markers, fingerprints, or internal prompt construction.",
];

export function renderReplyPrompt(options: ReplyPromptOptions): string {
	const sections = [
		"Respond to the latest user follow-up in an existing PR review thread.",
		"",
		"## Reply Context",
		`- File: ${options.thread.filePath || "(unknown file)"}`,
		`- Thread ID: ${options.thread.id}`,
		options.changeContext ? `- Change context: ${options.changeContext}` : "",
		"",
		"## Original Finding Summary",
		options.findingSummary,
		"",
		"## Latest User Follow-Up",
		options.latestUserPrompt,
		"",
		"## Ordered Thread Transcript",
		options.threadTranscript,
		"",
		"## Reply Contract",
		...REPLY_CONTRACT_RULES.map((rule) => `- ${rule}`),
		"",
		"Return only the reply text that should be posted back to the Azure DevOps thread.",
	];

	return sections.filter(Boolean).join("\n");
}
