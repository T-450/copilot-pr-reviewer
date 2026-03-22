import { describe, expect, test } from "bun:test";
import {
	buildReplyCandidateThread,
	buildThreadTranscript,
	sanitizeThreadCommentContent,
	type RawAdoThread,
} from "../src/thread-context.ts";

function makeRawThread(overrides: Partial<RawAdoThread> = {}): RawAdoThread {
	return {
		id: overrides.id ?? 41,
		status: overrides.status ?? 1,
		threadContext: overrides.threadContext ?? { filePath: "src/review.ts" },
		comments: overrides.comments ?? [
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
					"<!-- fingerprint:fp-thread -->",
				].join("\n"),
				publishedDate: "2026-03-22T12:00:00.000Z",
				lastUpdatedDate: "2026-03-22T12:00:00.000Z",
				isDeleted: false,
				author: {
					id: "bot-1",
					displayName: "Copilot Reviewer",
					uniqueName: "bot@example.com",
					isContainer: false,
				},
			},
			{
				id: 20,
				parentCommentId: 10,
				content: "Can you clarify the edge case?",
				publishedDate: "2026-03-22T12:02:00.000Z",
				lastUpdatedDate: "2026-03-22T12:02:00.000Z",
				isDeleted: false,
				author: {
					id: "user-1",
					displayName: "Ada Reviewer",
					uniqueName: "ada@example.com",
					isContainer: false,
				},
			},
			{
				id: 25,
				parentCommentId: 10,
				content: [
					"The helper only decides whether the fallback branch runs.",
					"",
					"---",
					"<sub>Follow-up from Copilot PR Reviewer</sub>",
					"",
					"<!-- copilot-pr-reviewer-reply -->",
					"<!-- in-reply-to:20 -->",
				].join("\n"),
				publishedDate: "2026-03-22T12:03:00.000Z",
				lastUpdatedDate: "2026-03-22T12:03:00.000Z",
				isDeleted: false,
				author: {
					id: "bot-1",
					displayName: "Copilot Reviewer",
					uniqueName: "bot@example.com",
					isContainer: false,
				},
			},
			{
				id: 30,
				parentCommentId: 10,
				content: "Does that still apply after the fallback change?",
				publishedDate: "2026-03-22T12:04:00.000Z",
				lastUpdatedDate: "2026-03-22T12:04:00.000Z",
				isDeleted: false,
				author: {
					id: "user-2",
					displayName: "Lin Reviewer",
					uniqueName: "lin@example.com",
					isContainer: false,
				},
			},
		],
		...overrides,
	};
}

describe("sanitizeThreadCommentContent", () => {
	test("removes bot-only metadata while keeping visible reply text", () => {
		const sanitized = sanitizeThreadCommentContent(
			[
				"Visible reply",
				"",
				"---",
				"<sub>Follow-up from Copilot PR Reviewer</sub>",
				"",
				"<!-- copilot-pr-reviewer-reply -->",
				"<!-- in-reply-to:20 -->",
			].join("\n"),
		);

		expect(sanitized).toBe("Visible reply");
	});
});

describe("buildReplyCandidateThread", () => {
	test("assembles finding summary, reply checkpoints, and latest unresolved follow-up", () => {
		const thread = buildReplyCandidateThread(makeRawThread());

		expect(thread).not.toBeNull();
		expect(thread?.fingerprint).toBe("fp-thread");
		expect(thread?.findingSummary).toContain(
			"Null branch can bypass the guard",
		);
		expect(thread?.answeredCommentIds).toEqual([20]);
		expect(thread?.latestBotCheckpoint).toEqual({
			commentId: 25,
			answeredCommentId: 20,
			publishedDate: "2026-03-22T12:03:00.000Z",
		});
		expect(thread?.latestUserFollowUp?.id).toBe(30);
		expect(thread?.latestUserFollowUp?.role).toBe("user");
	});

	test("keeps chronological order and reply boundaries on normalized comments", () => {
		const baseComments = makeRawThread().comments;
		if (!baseComments) {
			throw new Error("Expected sample comments");
		}

		const thread = buildReplyCandidateThread(
			makeRawThread({
				comments: [
					baseComments[3],
					baseComments[0],
					baseComments[2],
					baseComments[1],
				],
			}),
		);

		expect(thread?.comments.map((comment) => comment.id)).toEqual([
			10, 20, 25, 30,
		]);
		expect(thread?.comments[2]?.replyToCommentId).toBe(20);
		expect(thread?.comments[2]?.role).toBe("bot");
	});

	test("targets the newest unresolved follow-up when an older comment was answered late", () => {
		const baseComments = makeRawThread().comments;
		if (!baseComments) {
			throw new Error("Expected sample comments");
		}

		const thread = buildReplyCandidateThread(
			makeRawThread({
				comments: [
					baseComments[0],
					baseComments[1],
					baseComments[3],
					{
						id: 35,
						parentCommentId: 10,
						content: [
							"Answering the earlier clarification only.",
							"",
							"---",
							"<sub>Follow-up from Copilot PR Reviewer</sub>",
							"",
							"<!-- copilot-pr-reviewer-reply -->",
							"<!-- in-reply-to:20 -->",
						].join("\n"),
						publishedDate: "2026-03-22T12:05:00.000Z",
						lastUpdatedDate: "2026-03-22T12:05:00.000Z",
						isDeleted: false,
						author: {
							id: "bot-1",
							displayName: "Copilot Reviewer",
							uniqueName: "bot@example.com",
							isContainer: false,
						},
					},
				],
			}),
		);

		expect(thread?.answeredCommentIds).toEqual([20]);
		expect(thread?.latestUserFollowUp?.id).toBe(30);
	});

	test("suppresses duplicate replies when the newest user follow-up already has a checkpoint", () => {
		const baseComments = makeRawThread().comments;
		if (!baseComments) {
			throw new Error("Expected sample comments");
		}

		const thread = buildReplyCandidateThread(
			makeRawThread({
				comments: [
					baseComments[0],
					baseComments[1],
					{
						id: 30,
						parentCommentId: 10,
						content: "Does that still apply after the fallback change?",
						publishedDate: "2026-03-22T12:04:00.000Z",
						lastUpdatedDate: "2026-03-22T12:04:00.000Z",
						isDeleted: false,
						author: {
							id: "user-2",
							displayName: "Lin Reviewer",
							uniqueName: "lin@example.com",
							isContainer: false,
						},
					},
					{
						id: 35,
						parentCommentId: 10,
						content: [
							"Yes, it still applies after the fallback change.",
							"",
							"---",
							"<sub>Follow-up from Copilot PR Reviewer</sub>",
							"",
							"<!-- copilot-pr-reviewer-reply -->",
							"<!-- in-reply-to:30 -->",
						].join("\n"),
						publishedDate: "2026-03-22T12:05:00.000Z",
						lastUpdatedDate: "2026-03-22T12:05:00.000Z",
						isDeleted: false,
						author: {
							id: "bot-1",
							displayName: "Copilot Reviewer",
							uniqueName: "bot@example.com",
							isContainer: false,
						},
					},
				],
			}),
		);

		expect(thread?.answeredCommentIds).toEqual([30]);
		expect(thread?.latestUserFollowUp).toBeNull();
	});
});

describe("buildThreadTranscript", () => {
	test("renders ordered transcript from normalized comments", () => {
		const thread = buildReplyCandidateThread(makeRawThread());
		if (thread === null) {
			throw new Error("Expected thread to normalize");
		}

		const transcript = buildThreadTranscript(thread.comments);

		expect(transcript).toContain("Copilot Reviewer: 🟡 **WARNING**");
		expect(transcript).toContain(
			"Ada Reviewer: Can you clarify the edge case?",
		);
		expect(transcript).toContain(
			"Lin Reviewer: Does that still apply after the fallback change?",
		);
	});
});
