import type { PRMetadata, ChangedFile } from "../ado/client.ts";
import type { Config } from "../config.ts";
import { CHANGE_TYPE_LABELS } from "../types.ts";
import type { ReviewMode } from "./review-modes.ts";

// ---------------------------------------------------------------------------
// System prompt — static review contract frame + dynamic PR context
// ---------------------------------------------------------------------------

const SYSTEM_PREAMBLE =
	"You are reviewing a pull request and must report issues with the emit_finding tool.";

const REVIEW_CONTRACT_RULES = [
	"Each finding MUST include: filePath, startLine, endLine, severity, category, title, message, confidence",
	"Use categories: correctness, security, reliability, maintainability, testing",
];

export function renderSystemPrompt(
	pr: PRMetadata,
	config: Config,
	_mode: ReviewMode = "quick-pass",
): string {
	const sections = [SYSTEM_PREAMBLE, "", "## PR Context", `**Title:** ${pr.title}`];

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
// ---------------------------------------------------------------------------

const FILE_REVIEW_INSTRUCTION =
	"Call `emit_finding` for each issue found. If the file is clean, respond with a brief confirmation and do not call `emit_finding`.";

export function renderFilePrompt(
	filePath: string,
	changeType: string,
	_mode: ReviewMode = "quick-pass",
): string {
	return [
		`Review the following file. Change type: ${changeType}.`,
		`File: ${filePath}`,
		"",
		FILE_REVIEW_INSTRUCTION,
	].join("\n");
}

// ---------------------------------------------------------------------------
// Planning prompt — review strategy before per-file passes
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
	_mode: ReviewMode = "quick-pass",
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
