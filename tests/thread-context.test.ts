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

	test("keeps edited follow-up text and renders marker-only bot replies as empty transcript entries", () => {
		const baseComments = makeRawThread().comments;
		if (!baseComments) {
			throw new Error("Expected sample comments");
		}

		const thread = buildReplyCandidateThread(
			makeRawThread({
				comments: [
					{
						...baseComments[3],
						id: 31,
						content:
							"I re-ran the logout flow. Does `readUserId()` still dereference `session.user` after the fallback change?",
						publishedDate: "2026-03-22T12:06:00.000Z",
						lastUpdatedDate: "2026-03-22T12:07:00.000Z",
					},
					{
						...baseComments[2],
						content: [
							"---",
							"<sub>Follow-up from Copilot PR Reviewer</sub>",
							"",
							"<!-- copilot-pr-reviewer-reply -->",
							"<!-- in-reply-to:20 -->",
						].join("\n"),
					},
					baseComments[0],
					baseComments[1],
				],
			}),
		);

		expect(thread?.comments.map((comment) => comment.id)).toEqual([
			10, 20, 25, 31,
		]);
		expect(thread?.comments[2]?.body).toBe("");
		expect(thread?.latestUserFollowUp?.id).toBe(31);
		expect(thread?.latestUserFollowUp?.body).toContain("fallback change");
		expect(thread?.latestUserFollowUp?.lastUpdatedDate).toBe(
			"2026-03-22T12:07:00.000Z",
		);

		if (thread === null) {
			throw new Error("Expected thread to normalize");
		}

		const transcript = buildThreadTranscript(thread.comments);
		expect(transcript).toContain("Copilot Reviewer: (empty comment)");
		expect(transcript).toContain(
			"Lin Reviewer: I re-ran the logout flow. Does `readUserId()` still dereference `session.user` after the fallback change?",
		);
	});

	test("returns null for threads without any bot marker comment", () => {
		const thread = buildReplyCandidateThread(
			makeRawThread({
				comments: [
					{
						id: 10,
						parentCommentId: 0,
						content: "Plain user comment without bot markers",
						publishedDate: "2026-03-22T12:00:00.000Z",
						isDeleted: false,
						author: {
							id: "user-1",
							displayName: "Ada",
							uniqueName: "ada@example.com",
							isContainer: false,
						},
					},
				],
			}),
		);

		expect(thread).toBeNull();
	});

	test("returns null latestUserFollowUp when all comments are from the bot", () => {
		const thread = buildReplyCandidateThread(
			makeRawThread({
				comments: [
					{
						id: 10,
						parentCommentId: 0,
						content: [
							"Finding text",
							"<!-- copilot-pr-reviewer-bot -->",
							"<!-- fingerprint:fp-bot-only -->",
						].join("\n"),
						publishedDate: "2026-03-22T12:00:00.000Z",
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

		expect(thread).not.toBeNull();
		expect(thread?.latestUserFollowUp).toBeNull();
		expect(thread?.answeredCommentIds).toEqual([]);
	});

	test("uses empty filePath when threadContext is missing", () => {
		const thread = buildReplyCandidateThread(
			makeRawThread({ threadContext: undefined }),
		);

		expect(thread).not.toBeNull();
		expect(thread?.filePath).toBe("");
	});

	test("targets the correct follow-up across three users with interleaved bot replies", () => {
		const thread = buildReplyCandidateThread(
			makeRawThread({
				comments: [
					{
						id: 10,
						parentCommentId: 0,
						content: [
							"Root finding",
							"<!-- copilot-pr-reviewer-bot -->",
							"<!-- fingerprint:fp-multi -->",
						].join("\n"),
						publishedDate: "2026-03-22T12:00:00.000Z",
						isDeleted: false,
						author: {
							id: "bot-1",
							displayName: "Bot",
							uniqueName: "bot@example.com",
							isContainer: false,
						},
					},
					{
						id: 20,
						parentCommentId: 10,
						content: "First question from user A",
						publishedDate: "2026-03-22T12:01:00.000Z",
						isDeleted: false,
						author: {
							id: "user-a",
							displayName: "User A",
							uniqueName: "a@example.com",
							isContainer: false,
						},
					},
					{
						id: 25,
						parentCommentId: 10,
						content: [
							"Reply to A",
							"<!-- copilot-pr-reviewer-reply -->",
							"<!-- in-reply-to:20 -->",
						].join("\n"),
						publishedDate: "2026-03-22T12:02:00.000Z",
						isDeleted: false,
						author: {
							id: "bot-1",
							displayName: "Bot",
							uniqueName: "bot@example.com",
							isContainer: false,
						},
					},
					{
						id: 30,
						parentCommentId: 10,
						content: "Question from user B",
						publishedDate: "2026-03-22T12:03:00.000Z",
						isDeleted: false,
						author: {
							id: "user-b",
							displayName: "User B",
							uniqueName: "b@example.com",
							isContainer: false,
						},
					},
					{
						id: 35,
						parentCommentId: 10,
						content: [
							"Reply to B",
							"<!-- copilot-pr-reviewer-reply -->",
							"<!-- in-reply-to:30 -->",
						].join("\n"),
						publishedDate: "2026-03-22T12:04:00.000Z",
						isDeleted: false,
						author: {
							id: "bot-1",
							displayName: "Bot",
							uniqueName: "bot@example.com",
							isContainer: false,
						},
					},
					{
						id: 40,
						parentCommentId: 10,
						content: "Follow-up from user C — the unanswered one",
						publishedDate: "2026-03-22T12:05:00.000Z",
						isDeleted: false,
						author: {
							id: "user-c",
							displayName: "User C",
							uniqueName: "c@example.com",
							isContainer: false,
						},
					},
				],
			}),
		);

		expect(thread?.answeredCommentIds).toEqual([20, 30]);
		expect(thread?.latestUserFollowUp?.id).toBe(40);
		expect(thread?.latestUserFollowUp?.body).toContain("user C");
	});

	test("skips deleted user comments when finding the latest follow-up", () => {
		const thread = buildReplyCandidateThread(
			makeRawThread({
				comments: [
					{
						id: 10,
						parentCommentId: 0,
						content: [
							"Finding",
							"<!-- copilot-pr-reviewer-bot -->",
							"<!-- fingerprint:fp-del -->",
						].join("\n"),
						publishedDate: "2026-03-22T12:00:00.000Z",
						isDeleted: false,
						author: {
							id: "bot-1",
							displayName: "Bot",
							uniqueName: "bot@example.com",
							isContainer: false,
						},
					},
					{
						id: 20,
						parentCommentId: 10,
						content: "Early question",
						publishedDate: "2026-03-22T12:01:00.000Z",
						isDeleted: false,
						author: {
							id: "user-1",
							displayName: "User",
							uniqueName: "user@example.com",
							isContainer: false,
						},
					},
					{
						id: 30,
						parentCommentId: 10,
						content: "This was deleted",
						publishedDate: "2026-03-22T12:02:00.000Z",
						isDeleted: true,
						author: {
							id: "user-1",
							displayName: "User",
							uniqueName: "user@example.com",
							isContainer: false,
						},
					},
				],
			}),
		);

		expect(thread?.latestUserFollowUp?.id).toBe(20);
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
