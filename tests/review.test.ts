import { describe, expect, test } from "bun:test";
import {
	buildSystemPrompt,
	buildFilePrompt,
	buildReplyPrompt,
	createEmitFindingTool,
	buildPlanningPrompt,
	buildFileReviewRequest,
	buildReplyRequest,
} from "../src/review.ts";
import type {
	PRMetadata,
	ChangedFile,
	ReplyCandidateThread,
} from "../src/ado/client.ts";
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

const sampleReplyThread: ReplyCandidateThread = {
	id: 17,
	filePath: "src/auth.ts",
	fingerprint: "fp-123",
	status: 1,
	rootBotCommentId: 10,
	findingSummary:
		"🟡 **WARNING** — Null branch can bypass the guard\n\nThe fallback path can still dereference `session.user` after logout.",
	answeredCommentIds: [],
	latestUserFollowUp: {
		id: 30,
		parentCommentId: 10,
		content: "Can you explain why the null branch is still risky?",
		body: "Can you explain why the null branch is still risky?",
		publishedDate: "2026-03-22T12:04:00.000Z",
		lastUpdatedDate: "2026-03-22T12:04:00.000Z",
		isDeleted: false,
		author: {
			id: "user-1",
			displayName: "Ada Reviewer",
			uniqueName: "ada@example.com",
			isContainer: false,
		},
		isBot: false,
		role: "user",
		replyToCommentId: null,
	},
	comments: [
		{
			id: 10,
			parentCommentId: 0,
			content: [
				"🟡 **WARNING** — Null branch can bypass the guard",
				"",
				"The fallback path can still dereference `session.user` after logout.",
				"",
				"---",
				"<sub>Was this helpful? React with 👍 or 👎</sub>",
				"",
				"<!-- copilot-pr-reviewer-bot -->",
				"<!-- fingerprint:fp-123 -->",
			].join("\n"),
			body: "🟡 **WARNING** — Null branch can bypass the guard\n\nThe fallback path can still dereference `session.user` after logout.",
			publishedDate: "2026-03-22T12:00:00.000Z",
			lastUpdatedDate: "2026-03-22T12:00:00.000Z",
			isDeleted: false,
			author: {
				id: "bot-1",
				displayName: "Copilot Reviewer",
				uniqueName: "bot@example.com",
				isContainer: false,
			},
			isBot: true,
			role: "bot",
			replyToCommentId: null,
		},
		{
			id: 20,
			parentCommentId: 10,
			content: "I was looking at the branch after logout.",
			body: "I was looking at the branch after logout.",
			publishedDate: "2026-03-22T12:02:00.000Z",
			lastUpdatedDate: "2026-03-22T12:02:00.000Z",
			isDeleted: false,
			author: {
				id: "user-2",
				displayName: "Lin Reviewer",
				uniqueName: "lin@example.com",
				isContainer: false,
			},
			isBot: false,
			role: "user",
			replyToCommentId: null,
		},
		{
			id: 25,
			parentCommentId: 20,
			content: "The risk is the stale fallback path, not the main login flow.",
			body: "The risk is the stale fallback path, not the main login flow.",
			publishedDate: "2026-03-22T12:03:00.000Z",
			lastUpdatedDate: "2026-03-22T12:03:00.000Z",
			isDeleted: false,
			author: {
				id: "bot-1",
				displayName: "Copilot Reviewer",
				uniqueName: "bot@example.com",
				isContainer: false,
			},
			isBot: true,
			role: "bot",
			replyToCommentId: null,
		},
		{
			id: 30,
			parentCommentId: 10,
			content: "Can you explain why the null branch is still risky?",
			body: "Can you explain why the null branch is still risky?",
			publishedDate: "2026-03-22T12:04:00.000Z",
			lastUpdatedDate: "2026-03-22T12:04:00.000Z",
			isDeleted: false,
			author: {
				id: "user-1",
				displayName: "Ada Reviewer",
				uniqueName: "ada@example.com",
				isContainer: false,
			},
			isBot: false,
			role: "user",
			replyToCommentId: null,
		},
	],
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
				// biome-ignore lint/suspicious/noExplicitAny: testing incomplete finding shape
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

describe("buildFileReviewRequest", () => {
	test("returns prompt and attachments in MessageOptions shape", () => {
		const request = buildFileReviewRequest(
			"src/auth.ts",
			"edit",
			"/repo/src/auth.ts",
		);

		expect(request.prompt).toBeDefined();
		expect(request.attachments).toBeDefined();
		expect(request.attachments).toHaveLength(1);
	});

	test("prompt contains file path and change type", () => {
		const request = buildFileReviewRequest(
			"src/config.ts",
			"add",
			"/repo/src/config.ts",
		);

		expect(request.prompt).toContain("src/config.ts");
		expect(request.prompt).toContain("add");
	});

	test("prompt contains emit_finding instruction", () => {
		const request = buildFileReviewRequest(
			"src/f.ts",
			"edit",
			"/repo/src/f.ts",
		);

		expect(request.prompt).toContain("emit_finding");
	});

	test("attachment has type 'file' and correct absolute path", () => {
		const absPath = "/home/user/repo/src/auth.ts";
		const request = buildFileReviewRequest("src/auth.ts", "edit", absPath);
		const att = request.attachments?.[0];
		expect(att).toBeDefined();
		expect(att?.type).toBe("file");
		if (att?.type === "file") {
			expect(att.path).toBe(absPath);
		}
	});

	test("attachment path is absolute, not relative", () => {
		const request = buildFileReviewRequest(
			"src/auth.ts",
			"edit",
			"/absolute/path/src/auth.ts",
		);
		const att = request.attachments?.[0];
		expect(att).toBeDefined();
		if (att?.type === "file") {
			expect(att.path.startsWith("/")).toBe(true);
		}
	});

	test("prompt does not embed file content (attachment-first invariant)", () => {
		const request = buildFileReviewRequest(
			"src/auth.ts",
			"edit",
			"/repo/src/auth.ts",
		);

		// Prompt should have metadata only — no code fences, imports, or function defs
		expect(request.prompt).not.toContain("```");
		expect(request.prompt).not.toContain("import ");
		expect(request.prompt).not.toContain("function ");
	});

	test("works with all change types", () => {
		for (const changeType of ["add", "edit", "delete", "rename", "unknown"]) {
			const request = buildFileReviewRequest(
				"src/f.ts",
				changeType,
				"/repo/src/f.ts",
			);

			expect(request.prompt).toContain(changeType);
			expect(request.attachments).toHaveLength(1);
		}
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

describe("buildReplyPrompt", () => {
	test("includes file path, change context, and latest follow-up", () => {
		const prompt = buildReplyPrompt({
			thread: sampleReplyThread,
			changeContext: "edit in auth fallback handling",
		});

		expect(prompt).toContain("src/auth.ts");
		expect(prompt).toContain("edit in auth fallback handling");
		expect(prompt).toContain(
			"Can you explain why the null branch is still risky?",
		);
	});

	test("sanitizes root finding summary before embedding it", () => {
		const prompt = buildReplyPrompt({ thread: sampleReplyThread });

		expect(prompt).toContain("Null branch can bypass the guard");
		expect(prompt).not.toContain("<!-- copilot-pr-reviewer-bot -->");
		expect(prompt).not.toContain("<!-- fingerprint:fp-123 -->");
	});

	test("preserves ordered transcript entries with authors", () => {
		const prompt = buildReplyPrompt({ thread: sampleReplyThread });

		const rootIndex = prompt.indexOf("Copilot Reviewer: 🟡 **WARNING**");
		const firstUserIndex = prompt.indexOf(
			"Lin Reviewer: I was looking at the branch after logout.",
		);
		const lastUserIndex = prompt.indexOf(
			"Ada Reviewer: Can you explain why the null branch is still risky?",
		);

		expect(rootIndex).toBeGreaterThan(-1);
		expect(firstUserIndex).toBeGreaterThan(rootIndex);
		expect(lastUserIndex).toBeGreaterThan(firstUserIndex);
	});

	test("adds conversational quality guardrails for uncertainty and concise grounding", () => {
		const prompt = buildReplyPrompt({ thread: sampleReplyThread });

		expect(prompt).toContain(
			"Start by answering the latest unresolved question",
		);
		expect(prompt).toContain(
			"do not restate the full finding unless it helps clarify the answer",
		);
		expect(prompt).toContain(
			"acknowledge the uncertainty and say what cannot be confirmed",
		);
		expect(prompt).toContain("instead of guessing or bluffing");
	});

	test("renders multi-turn context with the newest edited follow-up and empty bot replies", () => {
		const thread: ReplyCandidateThread = {
			...sampleReplyThread,
			latestUserFollowUp: {
				id: 40,
				parentCommentId: 10,
				content:
					"I rechecked the patch. Is the dereference still reachable after logout?",
				body: "I rechecked the patch. Is the dereference still reachable after logout?",
				publishedDate: "2026-03-22T12:05:00.000Z",
				lastUpdatedDate: "2026-03-22T12:06:00.000Z",
				isDeleted: false,
				author: {
					id: "user-2",
					displayName: "Lin Reviewer",
					uniqueName: "lin@example.com",
					isContainer: false,
				},
				isBot: false,
				role: "user",
				replyToCommentId: null,
			},
			comments: [
				...sampleReplyThread.comments,
				{
					id: 35,
					parentCommentId: 10,
					content: [
						"---",
						"<sub>Follow-up from Copilot PR Reviewer</sub>",
						"",
						"<!-- copilot-pr-reviewer-reply -->",
						"<!-- in-reply-to:30 -->",
					].join("\n"),
					body: "",
					publishedDate: "2026-03-22T12:04:30.000Z",
					lastUpdatedDate: "2026-03-22T12:04:30.000Z",
					isDeleted: false,
					author: {
						id: "bot-1",
						displayName: "Copilot Reviewer",
						uniqueName: "bot@example.com",
						isContainer: false,
					},
					isBot: true,
					role: "bot",
					replyToCommentId: 30,
				},
				{
					id: 40,
					parentCommentId: 10,
					content:
						"I rechecked the patch. Is the dereference still reachable after logout?",
					body: "I rechecked the patch. Is the dereference still reachable after logout?",
					publishedDate: "2026-03-22T12:05:00.000Z",
					lastUpdatedDate: "2026-03-22T12:06:00.000Z",
					isDeleted: false,
					author: {
						id: "user-2",
						displayName: "Lin Reviewer",
						uniqueName: "lin@example.com",
						isContainer: false,
					},
					isBot: false,
					role: "user",
					replyToCommentId: null,
				},
			],
		};

		const prompt = buildReplyPrompt({ thread });

		expect(prompt).toContain(
			"I rechecked the patch. Is the dereference still reachable after logout?",
		);
		expect(prompt).toContain("Copilot Reviewer: (empty comment)");
		expect(prompt).toContain(
			"Lin Reviewer: I was looking at the branch after logout.",
		);
		expect(prompt).not.toContain("<!-- copilot-pr-reviewer-reply -->");
		expect(prompt).not.toContain("<!-- in-reply-to:30 -->");
	});
});

describe("buildReplyRequest", () => {
	test("returns prompt with file attachment when absolute path is provided", () => {
		const request = buildReplyRequest({
			thread: sampleReplyThread,
			absolutePath: "/repo/src/auth.ts",
			changeContext: "edit",
		});

		expect(request.prompt).toContain("Ordered Thread Transcript");
		expect(request.attachments).toHaveLength(1);
		const attachment = request.attachments?.[0];
		if (attachment?.type === "file") {
			expect(attachment.path).toBe("/repo/src/auth.ts");
		}
	});

	test("keeps the prompt attachment-first and excludes raw bot markers", () => {
		const request = buildReplyRequest({
			thread: sampleReplyThread,
			absolutePath: "/repo/src/auth.ts",
		});

		expect(request.prompt).toContain(
			"Can you explain why the null branch is still risky?",
		);
		expect(request.prompt).not.toContain("<!-- copilot-pr-reviewer-bot -->");
		expect(request.prompt).not.toContain("<!-- fingerprint:fp-123 -->");
		expect(request.prompt).not.toContain("export function readUserId");
	});

	test("omits attachments when no file path is needed", () => {
		const request = buildReplyRequest({ thread: sampleReplyThread });

		expect(request.attachments).toBeUndefined();
		expect(request.prompt).toContain("Return only the reply text");
	});
});
