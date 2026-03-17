import { z } from "zod";
import type { Tool, ToolInvocation } from "@github/copilot-sdk";
import type { PRMetadata, ChangedFile } from "./ado/client.ts";
import type { Config } from "./config.ts";
import {
	CHANGE_TYPE_LABELS,
	type Finding,
	type Severity,
	type Category,
	type Confidence,
} from "./types.ts";

const FindingArgsSchema = z.object({
	filePath: z.string(),
	startLine: z.number().int().positive(),
	endLine: z.number().int().positive(),
	severity: z.enum(["critical", "warning", "suggestion", "nitpick"]),
	category: z.enum([
		"correctness",
		"security",
		"reliability",
		"maintainability",
		"testing",
	]),
	title: z.string().min(1).max(120),
	message: z.string().min(1),
	suggestion: z.string().optional(),
	confidence: z.enum(["high", "medium", "low"]),
});

type FindingArgs = z.infer<typeof FindingArgsSchema>;

function computeFingerprint(args: FindingArgs): string {
	const input = [args.filePath, args.category, args.title, args.startLine].join(
		"|",
	);
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(input);
	return hasher.digest("hex").slice(0, 16);
}

export function createEmitFindingTool(findings: Finding[]): Tool {
	return {
		name: "emit_finding",
		description:
			"Report a code review finding. Call once per distinct issue found. Include file path, line range, severity, category, and a clear explanation.",
		parameters: FindingArgsSchema,
		handler: async (rawArgs: unknown, _invocation: ToolInvocation) => {
			const parsed = FindingArgsSchema.safeParse(rawArgs);
			if (!parsed.success) {
				return `Invalid finding: ${parsed.error.issues.map((i) => i.message).join(", ")}`;
			}

			const args = parsed.data;
			const fingerprint = computeFingerprint(args);

			const finding: Finding = {
				filePath: args.filePath,
				startLine: args.startLine,
				endLine: args.endLine,
				severity: args.severity as Severity,
				category: args.category as Category,
				title: args.title,
				message: args.message,
				suggestion: args.suggestion,
				confidence: args.confidence as Confidence,
				fingerprint,
			};

			findings.push(finding);

			return `Finding recorded: [${finding.severity}] ${finding.title} (${finding.filePath}:${finding.startLine})`;
		},
	};
}

export function buildSystemPrompt(pr: PRMetadata, config: Config): string {
	const sections = [
		"You are reviewing a pull request and must report issues with the emit_finding tool.",
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
		"- Each finding MUST include: filePath, startLine, endLine, severity, category, title, message, confidence",
		"- Use categories: correctness, security, reliability, maintainability, testing",
	);

	return sections.join("\n");
}

export function buildFilePrompt(filePath: string, changeType: string): string {
	return [
		`Review the following file. Change type: ${changeType}.`,
		`File: ${filePath}`,
		"",
		"Call `emit_finding` for each issue found. If the file is clean, respond with a brief confirmation and do not call `emit_finding`.",
	].join("\n");
}

export function buildPlanningPrompt(
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
		"1. Which files are most likely to contain bugs or security issues",
		"2. Which files should be reviewed together (shared dependencies)",
		"3. Suggested review order (highest risk first)",
		"",
		"Respond with a brief review plan. Do NOT review the files yet.",
	]
		.filter(Boolean)
		.join("\n");
}
