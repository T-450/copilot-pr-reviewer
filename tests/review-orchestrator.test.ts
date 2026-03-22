import { describe, expect, test } from "bun:test";
import type {
	BotThread,
	ChangedFile,
	FeedbackSignal,
} from "../src/ado/client.ts";
import { runPostReviewActions } from "../src/review-orchestrator.ts";
import type { ReplyLoopResult } from "../src/reply-loop.ts";
import type { Finding } from "../src/types.ts";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
	return {
		filePath: "src/reply-loop.ts",
		startLine: 10,
		endLine: 12,
		severity: "warning",
		category: "correctness",
		title: "Guard the nullable value",
		message: "A null value can reach the follow-up branch.",
		confidence: "high",
		fingerprint: "fp-reply-1",
		...overrides,
	};
}

function makeFile(overrides: Partial<ChangedFile> = {}): ChangedFile {
	return {
		path: "src/reply-loop.ts",
		changeType: 2,
		changeTrackingId: 77,
		...overrides,
	};
}

function makeThread(overrides: Partial<BotThread> = {}): BotThread {
	return {
		id: 400,
		filePath: "src/reply-loop.ts",
		fingerprint: "fp-reply-1",
		status: 1,
		...overrides,
	};
}

describe("runPostReviewActions", () => {
	test("runs thread creation, resolution, reply handling, then feedback collection in order", async () => {
		const steps: string[] = [];
		const feedback: readonly FeedbackSignal[] = [
			{ fingerprint: "fp-reply-1", signal: "addressed", threadId: 400 },
		];
		const replyResult: ReplyLoopResult = {
			scannedThreads: 3,
			actionableThreads: 1,
			repliesPosted: 1,
		};

		const result = await runPostReviewActions({
			threadsToCreate: [
				{ finding: makeFinding({ fingerprint: "fp-a" }), file: makeFile() },
				{
					finding: makeFinding({
						fingerprint: "fp-b",
						filePath: "src/session.ts",
					}),
					file: makeFile({ path: "src/session.ts", changeTrackingId: 88 }),
				},
			],
			threadsToResolve: [400, 401],
			existingThreads: [makeThread()],
			createThread: async (finding, file, iteration) => {
				steps.push(
					`create:${finding.fingerprint}:${file.path}:${iteration.current}`,
				);
			},
			resolveThread: async (threadId) => {
				steps.push(`resolve:${threadId}`);
			},
			runReplyLoop: async () => {
				steps.push("reply-loop");
				return replyResult;
			},
			collectFeedback: async (threads, prMerged) => {
				steps.push(`feedback:${threads.length}:${prMerged}`);
				return feedback;
			},
			sleep: async (milliseconds) => {
				steps.push(`sleep:${milliseconds}`);
			},
			threadActionDelayMs: 500,
			iteration: { current: 7, previous: 6 },
		});

		expect(steps).toEqual([
			"create:fp-a:src/reply-loop.ts:7",
			"sleep:500",
			"create:fp-b:src/session.ts:7",
			"sleep:500",
			"resolve:400",
			"sleep:500",
			"resolve:401",
			"sleep:500",
			"reply-loop",
			"feedback:1:false",
		]);
		expect(result).toEqual({ replyResult, feedback });
	});

	test("preserves normal review comment creation when no reply follow-ups exist", async () => {
		const createdFingerprints: string[] = [];
		let replyLoopCalls = 0;

		const result = await runPostReviewActions({
			threadsToCreate: [
				{
					finding: makeFinding({ fingerprint: "fp-normal-comment" }),
					file: makeFile({ path: "src/index.ts" }),
				},
			],
			threadsToResolve: [],
			existingThreads: [makeThread({ fingerprint: "fp-existing" })],
			createThread: async (finding) => {
				createdFingerprints.push(finding.fingerprint);
			},
			resolveThread: async () => undefined,
			runReplyLoop: async () => {
				replyLoopCalls += 1;
				return {
					scannedThreads: 2,
					actionableThreads: 0,
					repliesPosted: 0,
				};
			},
			collectFeedback: async () => [],
			sleep: async () => undefined,
			threadActionDelayMs: 0,
			iteration: { current: 4, previous: 3 },
		});

		expect(createdFingerprints).toEqual(["fp-normal-comment"]);
		expect(replyLoopCalls).toBe(1);
		expect(result.replyResult.repliesPosted).toBe(0);
		expect(result.feedback).toEqual([]);
	});
});
