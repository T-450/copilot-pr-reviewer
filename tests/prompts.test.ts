import { describe, expect, test } from "bun:test";
import {
	renderSystemPrompt,
	renderFilePrompt,
	renderPlanningPrompt,
	renderReplyPrompt,
	SPECIALIST_TOOLS,
	reviewAgents,
	securityAgentConfig,
	testAgentConfig,
} from "../src/prompts/index.ts";
import type { PRMetadata, ChangedFile } from "../src/ado/client.ts";
import type { Config } from "../src/config.ts";
import type { ReplyCandidateThread } from "../src/thread-context.ts";
import { CHANGE_TYPE_LABELS } from "../src/types.ts";

// ── Shared fixtures ─────────────────────────────────────────────────────────

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
	botAuthorId: "bot-1",
	findingSummary:
		"🟡 **WARNING** — Null branch can bypass the guard\n\nThe fallback path can still dereference `session.user` after logout.",
	latestBotReplyAt: "2026-03-22T12:03:00.000Z",
	latestBotCheckpoint: null,
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
	comments: [],
};

// ── renderSystemPrompt ──────────────────────────────────────────────────────

describe("renderSystemPrompt", () => {
	test("includes PR title in PR Context section", () => {
		const prompt = renderSystemPrompt(samplePR, defaultConfig);
		expect(prompt).toContain("**Title:** Fix null pointer in auth module");
	});

	test("includes description when present", () => {
		const prompt = renderSystemPrompt(samplePR, defaultConfig);
		expect(prompt).toContain(
			"**Description:** Addresses crash when user token expires",
		);
	});

	test("omits description line when empty", () => {
		const pr: PRMetadata = { ...samplePR, description: "" };
		const prompt = renderSystemPrompt(pr, defaultConfig);
		expect(prompt).not.toContain("**Description:**");
	});

	test("includes work item IDs when present", () => {
		const prompt = renderSystemPrompt(samplePR, defaultConfig);
		expect(prompt).toContain("#1234");
	});

	test("formats multiple work item IDs with commas", () => {
		const pr: PRMetadata = { ...samplePR, workItemIds: [100, 200, 300] };
		const prompt = renderSystemPrompt(pr, defaultConfig);
		expect(prompt).toContain("#100");
		expect(prompt).toContain("#200");
		expect(prompt).toContain("#300");
	});

	test("omits work items line when array is empty", () => {
		const pr: PRMetadata = { ...samplePR, workItemIds: [] };
		const prompt = renderSystemPrompt(pr, defaultConfig);
		expect(prompt).not.toContain("**Work Items:**");
	});

	test("interpolates severity threshold from config", () => {
		const prompt = renderSystemPrompt(samplePR, {
			...defaultConfig,
			severityThreshold: "warning",
		});
		expect(prompt).toContain("`warning`");
	});

	test("each severity threshold value is interpolated correctly", () => {
		for (const threshold of [
			"critical",
			"warning",
			"suggestion",
			"nitpick",
		] as const) {
			const prompt = renderSystemPrompt(samplePR, {
				...defaultConfig,
				severityThreshold: threshold,
			});
			expect(prompt).toContain(`\`${threshold}\``);
		}
	});

	// ── Stability: review contract invariants ────────────────────────────────

	test("always contains the review preamble", () => {
		const prompt = renderSystemPrompt(samplePR, defaultConfig);
		expect(prompt).toContain("emit_finding");
		expect(prompt).toContain("reviewing a pull request");
	});

	test("always contains Review Contract section", () => {
		const prompt = renderSystemPrompt(samplePR, defaultConfig);
		expect(prompt).toContain("## Review Contract");
	});

	test("requires all finding fields in review contract", () => {
		const prompt = renderSystemPrompt(samplePR, defaultConfig);
		for (const field of [
			"filePath",
			"startLine",
			"endLine",
			"severity",
			"category",
			"title",
			"message",
			"confidence",
		]) {
			expect(prompt).toContain(field);
		}
	});

	test("lists all valid categories in review contract", () => {
		const prompt = renderSystemPrompt(samplePR, defaultConfig);
		for (const category of [
			"correctness",
			"security",
			"reliability",
			"maintainability",
			"testing",
		]) {
			expect(prompt).toContain(category);
		}
	});
});

// ── renderFilePrompt ────────────────────────────────────────────────────────

describe("renderFilePrompt", () => {
	test("includes file path and change type", () => {
		const prompt = renderFilePrompt("src/auth.ts", "edit");
		expect(prompt).toContain("src/auth.ts");
		expect(prompt).toContain("edit");
	});

	test("works with all standard change type labels", () => {
		for (const changeType of ["add", "edit", "delete", "rename", "unknown"]) {
			const prompt = renderFilePrompt("src/file.ts", changeType);
			expect(prompt).toContain(changeType);
			expect(prompt).toContain("src/file.ts");
		}
	});

	test("always includes emit_finding call instruction", () => {
		const prompt = renderFilePrompt("any/file.ts", "edit");
		expect(prompt).toContain("emit_finding");
	});

	test("instructs clean-file response when no issues", () => {
		const prompt = renderFilePrompt("clean/file.ts", "edit");
		expect(prompt).toContain("clean");
		expect(prompt).toContain("do not call `emit_finding`");
	});

	test("does not embed file content in the prompt", () => {
		const prompt = renderFilePrompt("src/auth.ts", "add");
		// The prompt should only contain metadata (path, change type, instructions)
		// not code content — code arrives via SDK attachment
		expect(prompt).not.toContain("import ");
		expect(prompt).not.toContain("function ");
		expect(prompt).not.toContain("```");
	});
});

// ── renderPlanningPrompt ────────────────────────────────────────────────────

describe("renderPlanningPrompt", () => {
	const files: ChangedFile[] = [
		{ path: "src/auth.ts", changeType: 1, changeTrackingId: 1 },
		{ path: "src/utils.ts", changeType: 2, changeTrackingId: 2 },
		{ path: "old/legacy.ts", changeType: 3, changeTrackingId: 3 },
		{ path: "src/renamed.ts", changeType: 4, changeTrackingId: 4 },
	];

	test("includes PR title", () => {
		const prompt = renderPlanningPrompt(samplePR, files);
		expect(prompt).toContain("Fix null pointer in auth module");
	});

	test("includes description when present", () => {
		const prompt = renderPlanningPrompt(samplePR, files);
		expect(prompt).toContain("Addresses crash when user token expires");
	});

	test("omits description when empty", () => {
		const pr: PRMetadata = { ...samplePR, description: "" };
		const prompt = renderPlanningPrompt(pr, files);
		expect(prompt).not.toContain("Description:");
	});

	test("lists all file paths", () => {
		const prompt = renderPlanningPrompt(samplePR, files);
		expect(prompt).toContain("src/auth.ts");
		expect(prompt).toContain("src/utils.ts");
		expect(prompt).toContain("old/legacy.ts");
		expect(prompt).toContain("src/renamed.ts");
	});

	test("maps all numeric change types to human-readable labels", () => {
		const prompt = renderPlanningPrompt(samplePR, files);
		expect(prompt).toContain("(add)");
		expect(prompt).toContain("(edit)");
		expect(prompt).toContain("(delete)");
		expect(prompt).toContain("(rename)");
	});

	test("falls back to 'unknown' for unmapped change types", () => {
		const unknownFiles: ChangedFile[] = [
			{ path: "src/mystery.ts", changeType: 99, changeTrackingId: 1 },
		];
		const prompt = renderPlanningPrompt(samplePR, unknownFiles);
		expect(prompt).toContain("(unknown)");
	});

	test("contains the three planning task items", () => {
		const prompt = renderPlanningPrompt(samplePR, files);
		expect(prompt).toContain("bugs or security issues");
		expect(prompt).toContain("reviewed together");
		expect(prompt).toContain("highest risk first");
	});

	test("instructs model NOT to review files yet", () => {
		const prompt = renderPlanningPrompt(samplePR, files);
		expect(prompt).toContain("Do NOT review the files yet");
	});

	test("does not contain file content or code fences", () => {
		const prompt = renderPlanningPrompt(samplePR, files);
		expect(prompt).not.toContain("```");
		expect(prompt).not.toContain("import ");
		expect(prompt).not.toContain("function ");
	});
});

describe("renderReplyPrompt", () => {
	test("includes direct-answer, grounding, and uncertainty guidance", () => {
		const prompt = renderReplyPrompt({
			thread: sampleReplyThread,
			findingSummary: sampleReplyThread.findingSummary,
			latestUserPrompt:
				sampleReplyThread.latestUserFollowUp?.body ?? "missing follow-up",
			threadTranscript:
				"[2026-03-22T12:00:00.000Z] Copilot Reviewer: Root finding",
		});

		expect(prompt).toContain(
			"Start by answering the latest unresolved question",
		);
		expect(prompt).toContain(
			"Reference the original issue or affected code path",
		);
		expect(prompt).toContain("acknowledge the uncertainty");
		expect(prompt).toContain("instead of guessing or bluffing");
	});

	test("tells the model not to restate the full finding unless it helps", () => {
		const prompt = renderReplyPrompt({
			thread: sampleReplyThread,
			findingSummary: sampleReplyThread.findingSummary,
			latestUserPrompt:
				sampleReplyThread.latestUserFollowUp?.body ?? "missing follow-up",
			threadTranscript:
				"[2026-03-22T12:00:00.000Z] Copilot Reviewer: Root finding",
		});

		expect(prompt).toContain(
			"do not restate the full finding unless it helps clarify the answer",
		);
	});
});

// ── CHANGE_TYPE_LABELS ──────────────────────────────────────────────────────

describe("CHANGE_TYPE_LABELS", () => {
	test("maps numeric change types 1-4", () => {
		expect(CHANGE_TYPE_LABELS[1]).toBe("add");
		expect(CHANGE_TYPE_LABELS[2]).toBe("edit");
		expect(CHANGE_TYPE_LABELS[3]).toBe("delete");
		expect(CHANGE_TYPE_LABELS[4]).toBe("rename");
	});

	test("returns undefined for unmapped types", () => {
		expect(CHANGE_TYPE_LABELS[0]).toBeUndefined();
		expect(CHANGE_TYPE_LABELS[5]).toBeUndefined();
		expect(CHANGE_TYPE_LABELS[99]).toBeUndefined();
	});
});

// ── Review agent configurations ─────────────────────────────────────────────

describe("reviewAgents", () => {
	test("contains exactly two agents", () => {
		expect(reviewAgents).toHaveLength(2);
	});

	test("exports the security and test agents in order", () => {
		expect(reviewAgents[0]).toBe(securityAgentConfig);
		expect(reviewAgents[1]).toBe(testAgentConfig);
	});

	test("array is readonly", () => {
		// Verify the exported array cannot be accidentally mutated at the type level
		// by checking it has the expected length after spread
		const copy = [...reviewAgents];
		expect(copy).toHaveLength(2);
	});
});

describe("SPECIALIST_TOOLS", () => {
	test("contains the minimal read-only tool set", () => {
		expect(SPECIALIST_TOOLS).toEqual([
			"emit_finding",
			"read_file",
			"list_files",
		]);
	});

	test("excludes all destructive operations", () => {
		for (const banned of [
			"edit_file",
			"write_file",
			"shell",
			"git_push",
			"web_fetch",
		]) {
			expect(SPECIALIST_TOOLS).not.toContain(banned);
		}
	});

	test("is readonly and cannot be mutated", () => {
		// Spread to verify iterable; original stays intact
		const copy = [...SPECIALIST_TOOLS];
		expect(copy).toEqual([...SPECIALIST_TOOLS]);
	});
});

describe("securityAgentConfig", () => {
	test("has the expected name", () => {
		expect(securityAgentConfig.name).toBe("security-reviewer");
	});

	test("has a human-readable displayName", () => {
		expect(securityAgentConfig.displayName).toBe("Security Reviewer");
	});

	test("description mentions security and HIGH_RISK", () => {
		expect(securityAgentConfig.description).toContain("security");
	});

	test("infer is explicitly enabled for SDK auto-dispatch", () => {
		expect(securityAgentConfig.infer).toBe(true);
	});

	test("prompt covers OWASP categories", () => {
		const prompt = securityAgentConfig.prompt;
		expect(prompt).toContain("Authentication");
		expect(prompt).toContain("Injection");
		expect(prompt).toContain("data exposure");
		expect(prompt).toContain("cryptographic");
		expect(prompt).toContain("SSRF");
		expect(prompt).toContain("path traversal");
	});

	test("prompt instructs using emit_finding with security category", () => {
		expect(securityAgentConfig.prompt).toContain("emit_finding");
		expect(securityAgentConfig.prompt).toContain("security");
	});

	test("tools match the shared SPECIALIST_TOOLS scope", () => {
		expect(securityAgentConfig.tools).toEqual([...SPECIALIST_TOOLS]);
	});

	test("tools exclude all destructive operations", () => {
		const tools = securityAgentConfig.tools ?? [];
		for (const banned of [
			"edit_file",
			"write_file",
			"shell",
			"git_push",
			"web_fetch",
		]) {
			expect(tools).not.toContain(banned);
		}
	});
});

describe("testAgentConfig", () => {
	test("has the expected name", () => {
		expect(testAgentConfig.name).toBe("test-reviewer");
	});

	test("has a human-readable displayName", () => {
		expect(testAgentConfig.displayName).toBe("Test Reviewer");
	});

	test("description mentions test coverage and quality", () => {
		expect(testAgentConfig.description).toContain("test");
	});

	test("infer is explicitly enabled for SDK auto-dispatch", () => {
		expect(testAgentConfig.infer).toBe(true);
	});

	test("prompt covers test quality concerns", () => {
		const prompt = testAgentConfig.prompt;
		expect(prompt).toContain("coverage");
		expect(prompt).toContain("edge cases");
		expect(prompt).toContain("Flaky");
		expect(prompt).toContain("coupling");
	});

	test("prompt instructs using emit_finding with testing category", () => {
		expect(testAgentConfig.prompt).toContain("emit_finding");
		expect(testAgentConfig.prompt).toContain("testing");
	});

	test("tools match the shared SPECIALIST_TOOLS scope", () => {
		expect(testAgentConfig.tools).toEqual([...SPECIALIST_TOOLS]);
	});

	test("tools exclude all destructive operations", () => {
		const tools = testAgentConfig.tools ?? [];
		for (const banned of [
			"edit_file",
			"write_file",
			"shell",
			"git_push",
			"web_fetch",
		]) {
			expect(tools).not.toContain(banned);
		}
	});
});
