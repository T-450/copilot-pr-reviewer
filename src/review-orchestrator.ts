import type { BotThread, ChangedFile, FeedbackSignal } from "./ado/client.ts";
import type { Finding } from "./types.ts";
import type { ReplyLoopResult } from "./reply-loop.ts";

export async function runPostReviewActions(options: {
	readonly threadsToCreate: ReadonlyArray<{
		readonly finding: Finding;
		readonly file: ChangedFile;
	}>;
	readonly threadsToResolve: readonly number[];
	readonly existingThreads: readonly BotThread[];
	readonly createThread: (
		finding: Finding,
		file: ChangedFile,
		iteration: { current: number; previous: number },
	) => Promise<void>;
	readonly resolveThread: (threadId: number) => Promise<void>;
	readonly runReplyLoop: () => Promise<ReplyLoopResult>;
	readonly collectFeedback: (
		existingThreads: readonly BotThread[],
		prMerged: boolean,
	) => Promise<readonly FeedbackSignal[]>;
	readonly sleep: (milliseconds: number) => Promise<void>;
	readonly threadActionDelayMs: number;
	readonly iteration: { current: number; previous: number };
	readonly prMerged?: boolean;
}): Promise<{
	readonly replyResult: ReplyLoopResult;
	readonly feedback: readonly FeedbackSignal[];
}> {
	for (const createThreadTask of options.threadsToCreate) {
		await options.createThread(
			createThreadTask.finding,
			createThreadTask.file,
			options.iteration,
		);
		await options.sleep(options.threadActionDelayMs);
	}

	for (const threadId of options.threadsToResolve) {
		await options.resolveThread(threadId);
		await options.sleep(options.threadActionDelayMs);
	}

	const replyResult = await options.runReplyLoop();
	const feedback = await options.collectFeedback(
		options.existingThreads,
		options.prMerged ?? false,
	);

	return {
		replyResult,
		feedback,
	};
}
