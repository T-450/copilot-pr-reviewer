import { z } from "zod";
import {
	defineTool,
	type Tool,
	type MessageOptions,
} from "@github/copilot-sdk";
import type { PRMetadata, ChangedFile } from "./ado/client.ts";
import type { Config } from "./config.ts";
import type { Finding, Severity, Category, Confidence } from "./types.ts";
import {
	buildThreadTranscript,
	type ReplyCandidateThread,
} from "./thread-context.ts";
import {
	renderSystemPrompt,
	renderFilePrompt,
	renderPlanningPrompt,
	renderReplyPrompt,
} from "./prompts/index.ts";

export const FindingArgsSchema = z.object({
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

export function createEmitFindingTool(findings: Finding[]): Tool<FindingArgs> {
	return defineTool("emit_finding", {
		description:
			"Report a code review finding. Call once per distinct issue found. Include file path, line range, severity, category, and a clear explanation.",
		parameters: FindingArgsSchema,
		skipPermission: true,
		handler: async (args) => {
			const parsed = FindingArgsSchema.safeParse(args);
			if (!parsed.success) {
				return `Invalid finding: ${parsed.error.issues.map((i) => i.message).join(", ")}`;
			}

			const validated = parsed.data;
			const fingerprint = computeFingerprint(validated);

			const finding: Finding = {
				filePath: validated.filePath,
				startLine: validated.startLine,
				endLine: validated.endLine,
				severity: validated.severity as Severity,
				category: validated.category as Category,
				title: validated.title,
				message: validated.message,
				suggestion: validated.suggestion,
				confidence: validated.confidence as Confidence,
				fingerprint,
			};

			findings.push(finding);

			return `Finding recorded: [${finding.severity}] ${finding.title} (${finding.filePath}:${finding.startLine})`;
		},
	});
}

export function buildSystemPrompt(pr: PRMetadata, config: Config): string {
	return renderSystemPrompt(pr, config);
}

export function buildFilePrompt(filePath: string, changeType: string): string {
	return renderFilePrompt(filePath, changeType);
}

export function buildPlanningPrompt(
	pr: PRMetadata,
	files: readonly ChangedFile[],
): string {
	return renderPlanningPrompt(pr, files);
}

type ReplyRequestOptions = {
	readonly thread: ReplyCandidateThread;
	readonly absolutePath?: string;
	readonly changeContext?: string;
};

export function buildReplyPrompt(options: ReplyRequestOptions): string {
	const latestUserPrompt = options.thread.latestUserFollowUp
		? options.thread.latestUserFollowUp.body
		: "No actionable user follow-up was detected.";

	return renderReplyPrompt({
		thread: options.thread,
		findingSummary: options.thread.findingSummary,
		latestUserPrompt,
		threadTranscript: buildThreadTranscript(options.thread.comments),
		changeContext: options.changeContext,
	});
}

/**
 * Build an attachment-first review request for a single file.
 *
 * Returns a complete `MessageOptions` payload that pairs a contextual prompt
 * (file path, change type, review instructions) with a native SDK file
 * attachment. The SDK handles tokenisation and context-window management for
 * the attachment, so file content is never injected into the prompt text.
 *
 * @param filePath  Repo-relative path (e.g. "src/auth.ts")
 * @param changeType  Human-readable change label ("add", "edit", …)
 * @param absolutePath  Fully-resolved filesystem path for the SDK attachment
 */
export function buildFileReviewRequest(
	filePath: string,
	changeType: string,
	absolutePath: string,
): MessageOptions {
	return {
		prompt: renderFilePrompt(filePath, changeType),
		attachments: [{ type: "file", path: absolutePath }],
	};
}

export function buildReplyRequest(
	options: ReplyRequestOptions,
): MessageOptions {
	const attachments = options.absolutePath
		? [{ type: "file" as const, path: options.absolutePath }]
		: undefined;

	return {
		prompt: buildReplyPrompt(options),
		attachments,
	};
}
