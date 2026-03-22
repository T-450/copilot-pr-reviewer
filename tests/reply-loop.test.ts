import { describe, expect, test } from "bun:test";
import type { ReplyCandidateThread } from "../src/thread-context.ts";
import {
	extractAssistantText,
	MAX_REPLIES_PER_RUN,
	orderReplyCandidateThreads,
	runReplyLoop,
} from "../src/reply-loop.ts";

function makeThread(
	overrides: Partial<ReplyCandidateThread> = {},
): ReplyCandidateThread {
	return {
		id: overrides.id ?? 10,
		filePath: overrides.filePath ?? "src/auth.ts",
		fingerprint: overrides.fingerprint ?? "fp-1",
		status: overrides.status ?? 1,
		rootBotCommentId: overrides.rootBotCommentId ?? 100,
		findingSummary:
			overrides.findingSummary ?? "Original finding summary unavailable.",
		answeredCommentIds: overrides.answeredCommentIds ?? [],
		latestUserFollowUp:
			overrides.latestUserFollowUp === undefined
				? {
						id: 200,
						parentCommentId: 100,
						content: "Can you clarify the null guard?",
						body: "Can you clarify the null guard?",
						publishedDate: "2026-03-22T12:05:00.000Z",
						lastUpdatedDate: "2026-03-22T12:05:00.000Z",
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
					}
				: overrides.latestUserFollowUp,
		comments: overrides.comments ?? [],
	};
}

function makeFollowUp(
	overrides: Partial<
		NonNullable<ReplyCandidateThread["latestUserFollowUp"]>
	> = {},
) {
	return {
		id: overrides.id ?? 200,
		parentCommentId: overrides.parentCommentId ?? 100,
		content: overrides.content ?? "Can you clarify the null guard?",
		body:
			overrides.body ?? overrides.content ?? "Can you clarify the null guard?",
		publishedDate: overrides.publishedDate ?? "2026-03-22T12:05:00.000Z",
		lastUpdatedDate:
			overrides.lastUpdatedDate ??
			overrides.publishedDate ??
			"2026-03-22T12:05:00.000Z",
		isDeleted: overrides.isDeleted ?? false,
		author: overrides.author ?? {
			id: "user-1",
			displayName: "Ada Reviewer",
			uniqueName: "ada@example.com",
			isContainer: false,
		},
		isBot: overrides.isBot ?? false,
		role: overrides.role ?? "user",
		replyToCommentId: overrides.replyToCommentId ?? null,
	};
}

describe("extractAssistantText", () => {
	test("pulls nested assistant text from sdk-shaped objects", () => {
		const text = extractAssistantText({
			message: {
				content: [{ ignored: true }, "Reply with the concrete null guard."],
			},
		});

		expect(text).toContain("concrete null guard");
	});
});

describe("orderReplyCandidateThreads", () => {
	test("sorts actionable threads by follow-up timestamp then thread id", () => {
		const ordered = orderReplyCandidateThreads([
			makeThread({
				id: 3,
				latestUserFollowUp: makeFollowUp({
					id: 203,
					publishedDate: "2026-03-22T12:07:00.000Z",
				}),
			}),
			makeThread({
				id: 1,
				latestUserFollowUp: makeFollowUp({
					id: 201,
					publishedDate: "2026-03-22T12:05:00.000Z",
				}),
			}),
			makeThread({
				id: 2,
				latestUserFollowUp: makeFollowUp({
					id: 202,
					publishedDate: "2026-03-22T12:05:00.000Z",
				}),
			}),
		]);

		expect(ordered.map((thread) => thread.id)).toEqual([1, 2, 3]);
	});
});

describe("runReplyLoop", () => {
	test("skips session creation when there are no actionable follow-ups", async () => {
		let createdSession = false;
		const logs: string[] = [];

		const result = await runReplyLoop({
			repoRoot: "/repo",
			listThreads: async () => [
				makeThread({ status: 2 }),
				makeThread({ id: 11, latestUserFollowUp: null }),
			],
			createSession: async () => {
				createdSession = true;
				return {
					sendAndWait: async () => "",
					disconnect: async () => undefined,
				};
			},
			postReply: async () => undefined,
			sleep: async () => undefined,
			threadActionDelayMs: 0,
			log: (message) => logs.push(message),
		});

		expect(createdSession).toBe(false);
		expect(logs).toEqual([
			"Reply loop scanned 2 threads; 0 actionable follow-up candidates; 0 replies posted",
		]);
		expect(result).toEqual({
			scannedThreads: 2,
			actionableThreads: 0,
			repliesPosted: 0,
		});
	});

	test("posts same-thread replies for active follow-ups in stable order", async () => {
		const sendCalls: string[] = [];
		const attachmentPaths: string[] = [];
		const logs: string[] = [];
		const postedReplies: Array<{
			threadId: number;
			parentCommentId: number;
			replyText: string;
			followUpCommentId: number;
		}> = [];

		const result = await runReplyLoop({
			repoRoot: "/repo",
			listThreads: async () => [
				makeThread({
					id: 20,
					filePath: "src/older.ts",
					rootBotCommentId: 120,
					latestUserFollowUp: makeFollowUp({
						id: 220,
						parentCommentId: 120,
						publishedDate: "2026-03-22T12:02:00.000Z",
					}),
				}),
				makeThread({
					id: 30,
					filePath: "src/newer.ts",
					rootBotCommentId: 130,
					latestUserFollowUp: makeFollowUp({
						id: 230,
						parentCommentId: 130,
						publishedDate: "2026-03-22T12:04:00.000Z",
					}),
				}),
			],
			createSession: async () => ({
				sendAndWait: async (request) => {
					sendCalls.push(request.prompt);
					const attachment = request.attachments?.[0];
					if (attachment?.type === "file") {
						attachmentPaths.push(attachment.path);
					}
					return { message: { content: `Reply ${sendCalls.length}` } };
				},
				disconnect: async () => undefined,
			}),
			postReply: async (reply) => {
				postedReplies.push(reply);
			},
			sleep: async () => undefined,
			threadActionDelayMs: 0,
			fileExists: async (path) => path === "/repo/src/older.ts",
			log: (message) => logs.push(message),
			changeContextByFilePath: new Map([
				["src/older.ts", "edit"],
				["src/newer.ts", "rename"],
			]),
		});

		expect(sendCalls).toHaveLength(2);
		expect(logs).toEqual([
			"Reply loop found 2 actionable follow-up candidates; replying to 2 threads...",
			"Reply loop scanned 2 threads; 2 actionable follow-up candidates; 2 replies posted",
		]);
		expect(sendCalls[0]).toContain("- Change context: edit");
		expect(sendCalls[1]).toContain("- Change context: rename");
		expect(attachmentPaths).toEqual(["/repo/src/older.ts"]);
		expect(postedReplies).toEqual([
			{
				threadId: 20,
				parentCommentId: 120,
				replyText: "Reply 1",
				followUpCommentId: 220,
			},
			{
				threadId: 30,
				parentCommentId: 130,
				replyText: "Reply 2",
				followUpCommentId: 230,
			},
		]);
		expect(result.repliesPosted).toBe(2);
	});

	test("warns on empty reply content and still disconnects the session", async () => {
		const warnings: string[] = [];
		const logs: string[] = [];
		const postedReplies: number[] = [];
		let disconnected = false;

		const result = await runReplyLoop({
			repoRoot: "/repo",
			listThreads: async () => [makeThread({ id: 70 })],
			createSession: async () => ({
				sendAndWait: async () => "",
				disconnect: async () => {
					disconnected = true;
				},
			}),
			postReply: async (reply) => {
				postedReplies.push(reply.threadId);
			},
			sleep: async () => undefined,
			threadActionDelayMs: 0,
			fileExists: async () => false,
			log: (message) => logs.push(message),
			warn: (message) => warnings.push(message),
		});

		expect(postedReplies).toEqual([]);
		expect(logs.at(-1)).toBe(
			"Reply loop scanned 1 thread; 1 actionable follow-up candidate; 0 replies posted; skipped: 1 reply returned empty content",
		);
		expect(warnings[0]).toContain("Reply generation returned empty content");
		expect(disconnected).toBe(true);
		expect(result).toEqual({
			scannedThreads: 1,
			actionableThreads: 1,
			repliesPosted: 0,
		});
	});

	test("warns and continues when one reply generation fails", async () => {
		const warnings: string[] = [];
		const postedReplies: number[] = [];
		let callCount = 0;

		const result = await runReplyLoop({
			repoRoot: "/repo",
			listThreads: async () => [
				makeThread({ id: 10 }),
				makeThread({
					id: 11,
					latestUserFollowUp: makeFollowUp({
						id: 211,
						publishedDate: "2026-03-22T12:06:00.000Z",
					}),
				}),
			],
			createSession: async () => ({
				sendAndWait: async () => {
					callCount += 1;
					if (callCount === 1) {
						throw new Error("model timeout");
					}
					return "Recovered reply";
				},
				disconnect: async () => undefined,
			}),
			postReply: async (reply) => {
				postedReplies.push(reply.threadId);
			},
			sleep: async () => undefined,
			threadActionDelayMs: 0,
			fileExists: async () => false,
			warn: (message) => warnings.push(message),
		});

		expect(warnings[0]).toContain("thread 10");
		expect(postedReplies).toEqual([11]);
		expect(result.repliesPosted).toBe(1);
	});

	test("skips duplicate reply attempts for the same thread follow-up", async () => {
		const warnings: string[] = [];
		const logs: string[] = [];
		const postedReplies: number[] = [];

		const result = await runReplyLoop({
			repoRoot: "/repo",
			listThreads: async () => [
				makeThread({ id: 10, latestUserFollowUp: makeFollowUp({ id: 210 }) }),
				makeThread({ id: 10, latestUserFollowUp: makeFollowUp({ id: 210 }) }),
			],
			createSession: async () => ({
				sendAndWait: async () => "Deduped reply",
				disconnect: async () => undefined,
			}),
			postReply: async (reply) => {
				postedReplies.push(reply.threadId);
			},
			sleep: async () => undefined,
			threadActionDelayMs: 0,
			fileExists: async () => false,
			log: (message) => logs.push(message),
			warn: (message) => warnings.push(message),
		});

		expect(postedReplies).toEqual([10]);
		expect(logs.at(-1)).toBe(
			"Reply loop scanned 2 threads; 2 actionable follow-up candidates; 1 reply posted; skipped: 1 duplicate follow-up already attempted",
		);
		expect(warnings[0]).toContain("Skipping duplicate reply attempt");
		expect(result).toEqual({
			scannedThreads: 2,
			actionableThreads: 2,
			repliesPosted: 1,
		});
	});

	test("caps replies per run to avoid stale-scan storms", async () => {
		const warnings: string[] = [];
		const logs: string[] = [];
		const postedReplies: number[] = [];

		const result = await runReplyLoop({
			repoRoot: "/repo",
			listThreads: async () =>
				Array.from({ length: MAX_REPLIES_PER_RUN + 2 }, (_, index) =>
					makeThread({
						id: index + 1,
						rootBotCommentId: index + 100,
						latestUserFollowUp: makeFollowUp({
							id: index + 200,
							parentCommentId: index + 100,
							publishedDate: `2026-03-22T12:${String(index).padStart(
								2,
								"0",
							)}:00.000Z`,
						}),
					}),
				),
			createSession: async () => ({
				sendAndWait: async () => "Storm-safe reply",
				disconnect: async () => undefined,
			}),
			postReply: async (reply) => {
				postedReplies.push(reply.threadId);
			},
			sleep: async () => undefined,
			threadActionDelayMs: 0,
			fileExists: async () => false,
			log: (message) => logs.push(message),
			warn: (message) => warnings.push(message),
		});

		expect(postedReplies).toHaveLength(MAX_REPLIES_PER_RUN);
		expect(postedReplies.at(-1)).toBe(MAX_REPLIES_PER_RUN);
		expect(logs.at(-1)).toBe(
			`Reply loop scanned ${MAX_REPLIES_PER_RUN + 2} threads; ${MAX_REPLIES_PER_RUN + 2} actionable follow-up candidates; ${MAX_REPLIES_PER_RUN} replies posted; skipped: 2 follow-ups deferred by the run cap`,
		);
		expect(warnings[0]).toContain("avoid comment storms");
		expect(result).toEqual({
			scannedThreads: MAX_REPLIES_PER_RUN + 2,
			actionableThreads: MAX_REPLIES_PER_RUN + 2,
			repliesPosted: MAX_REPLIES_PER_RUN,
		});
	});
});
