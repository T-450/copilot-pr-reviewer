import { resolve } from "node:path";
import type { MessageOptions } from "@github/copilot-sdk";
import type { ReplyCandidateThread } from "./thread-context.ts";
import { buildReplyRequest } from "./review.ts";

export const REPLY_TIMEOUT = 120_000;
export const MAX_REPLIES_PER_RUN = 25;

export function extractAssistantText(response: unknown): string {
	if (typeof response === "string") {
		return response.trim();
	}

	if (Array.isArray(response)) {
		return response
			.map((entry) => extractAssistantText(entry))
			.filter((entry) => entry !== "")
			.join("\n\n")
			.trim();
	}

	if (response && typeof response === "object") {
		const record = response as Record<string, unknown>;
		for (const key of [
			"content",
			"text",
			"message",
			"response",
			"messages",
			"output",
			"data",
		]) {
			if (key in record) {
				const text = extractAssistantText(record[key]);
				if (text !== "") {
					return text;
				}
			}
		}
	}

	return response == null ? "" : String(response).trim();
}

export function isReplyCandidateThread(
	thread: ReplyCandidateThread,
): thread is ReplyCandidateThread & {
	readonly latestUserFollowUp: NonNullable<
		ReplyCandidateThread["latestUserFollowUp"]
	>;
} {
	return thread.status === 1 && thread.latestUserFollowUp !== null;
}

export function orderReplyCandidateThreads(
	threads: readonly ReplyCandidateThread[],
): readonly ReplyCandidateThread[] {
	return [...threads].sort((left, right) => {
		const leftAt =
			Date.parse(left.latestUserFollowUp?.publishedDate ?? "") || 0;
		const rightAt =
			Date.parse(right.latestUserFollowUp?.publishedDate ?? "") || 0;
		return leftAt - rightAt || left.id - right.id;
	});
}

async function resolveReplyAttachmentPath(
	repoRoot: string,
	filePath: string,
	fileExists: (path: string) => Promise<boolean>,
): Promise<string | undefined> {
	if (filePath.trim() === "") {
		return undefined;
	}

	const absolutePath = resolve(repoRoot, filePath);
	return (await fileExists(absolutePath)) ? absolutePath : undefined;
}

export type ReplyLoopSession = {
	readonly sendAndWait: (
		request: MessageOptions,
		timeout: number,
	) => Promise<unknown>;
	readonly disconnect: () => Promise<void>;
};

export type ReplyLoopResult = {
	readonly scannedThreads: number;
	readonly actionableThreads: number;
	readonly repliesPosted: number;
};

export async function runReplyLoop(options: {
	readonly repoRoot: string;
	readonly listThreads: () => Promise<readonly ReplyCandidateThread[]>;
	readonly createSession: () => Promise<ReplyLoopSession>;
	readonly postReply: (options: {
		readonly threadId: number;
		readonly parentCommentId: number;
		readonly replyText: string;
		readonly followUpCommentId: number;
	}) => Promise<void>;
	readonly sleep: (milliseconds: number) => Promise<void>;
	readonly threadActionDelayMs: number;
	readonly fileExists?: (path: string) => Promise<boolean>;
	readonly log?: (message: string) => void;
	readonly warn?: (message: string) => void;
	readonly changeContextByFilePath?: ReadonlyMap<string, string>;
}): Promise<ReplyLoopResult> {
	const threads = await options.listThreads();
	const actionableThreads = orderReplyCandidateThreads(
		threads.filter(isReplyCandidateThread),
	) as ReadonlyArray<
		ReplyCandidateThread & {
			readonly latestUserFollowUp: NonNullable<
				ReplyCandidateThread["latestUserFollowUp"]
			>;
		}
	>;
	const threadsToReply = actionableThreads.slice(0, MAX_REPLIES_PER_RUN);

	if (actionableThreads.length === 0) {
		return {
			scannedThreads: threads.length,
			actionableThreads: 0,
			repliesPosted: 0,
		};
	}

	if (actionableThreads.length > MAX_REPLIES_PER_RUN) {
		options.warn?.(
			`##vso[task.logissue type=warning]Reply loop limited this run to ${MAX_REPLIES_PER_RUN} threads out of ${actionableThreads.length} actionable follow-ups to avoid comment storms from stale thread scans`,
		);
	}

	options.log?.(
		`Replying to ${threadsToReply.length} follow-up thread${threadsToReply.length === 1 ? "" : "s"}...`,
	);

	const session = await options.createSession();
	const fileExists =
		options.fileExists ?? (async (path: string) => Bun.file(path).exists());
	let repliesPosted = 0;
	const attemptedReplyKeys = new Set<string>();

	try {
		for (const thread of threadsToReply) {
			try {
				const replyKey = `${thread.id}:${thread.latestUserFollowUp.id}`;
				if (attemptedReplyKeys.has(replyKey)) {
					options.warn?.(
						`##vso[task.logissue type=warning]Skipping duplicate reply attempt for thread ${thread.id} follow-up ${thread.latestUserFollowUp.id}`,
					);
					continue;
				}
				attemptedReplyKeys.add(replyKey);

				const absolutePath = await resolveReplyAttachmentPath(
					options.repoRoot,
					thread.filePath,
					fileExists,
				);
				const rawResponse = await session.sendAndWait(
					buildReplyRequest({
						thread,
						absolutePath,
						changeContext: options.changeContextByFilePath?.get(
							thread.filePath,
						),
					}),
					REPLY_TIMEOUT,
				);
				const replyText = extractAssistantText(rawResponse).trim();

				if (replyText === "") {
					options.warn?.(
						`##vso[task.logissue type=warning]Reply generation returned empty content for thread ${thread.id}`,
					);
					continue;
				}

				await options.postReply({
					threadId: thread.id,
					parentCommentId: thread.rootBotCommentId,
					replyText,
					followUpCommentId: thread.latestUserFollowUp.id,
				});
				repliesPosted += 1;
				await options.sleep(options.threadActionDelayMs);
			} catch (error) {
				options.warn?.(
					`##vso[task.logissue type=warning]Reply handling failed for thread ${thread.id}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} finally {
		await session.disconnect();
	}

	return {
		scannedThreads: threads.length,
		actionableThreads: actionableThreads.length,
		repliesPosted,
	};
}
