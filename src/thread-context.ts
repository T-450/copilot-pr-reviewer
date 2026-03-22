export const BOT_MARKER = "<!-- copilot-pr-reviewer-bot -->";
export const REPLY_MARKER = "<!-- copilot-pr-reviewer-reply -->";

const FINGERPRINT_RE = /<!-- fingerprint:([^\s]+) -->/;
const REPLY_TO_RE = /<!-- in-reply-to:(\d+) -->/;

export type ThreadCommentAuthor = {
	readonly id: string;
	readonly displayName: string;
	readonly uniqueName: string;
	readonly isContainer: boolean;
};

export type ThreadCommentRole = "bot" | "user";

export type ThreadComment = {
	readonly id: number;
	readonly parentCommentId: number;
	readonly content: string;
	readonly body: string;
	readonly publishedDate: string;
	readonly lastUpdatedDate: string;
	readonly isDeleted: boolean;
	readonly author: ThreadCommentAuthor;
	readonly isBot: boolean;
	readonly role: ThreadCommentRole;
	readonly replyToCommentId: number | null;
};

export type ThreadReplyCheckpoint = {
	readonly commentId: number;
	readonly answeredCommentId: number | null;
	readonly publishedDate: string;
};

export type ReplyCandidateThread = {
	readonly id: number;
	readonly filePath: string;
	readonly fingerprint: string;
	readonly status: number;
	readonly rootBotCommentId: number;
	readonly botAuthorId: string;
	readonly findingSummary: string;
	readonly comments: readonly ThreadComment[];
	readonly latestBotReplyAt: string;
	readonly latestBotCheckpoint: ThreadReplyCheckpoint | null;
	readonly latestUserFollowUp: ThreadComment | null;
	readonly answeredCommentIds: readonly number[];
};

export type RawAdoComment = {
	readonly id?: number;
	readonly parentCommentId?: number;
	readonly content?: string;
	readonly publishedDate?: string;
	readonly lastUpdatedDate?: string;
	readonly isDeleted?: boolean;
	readonly author?: {
		readonly id?: string;
		readonly displayName?: string;
		readonly uniqueName?: string;
		readonly isContainer?: boolean;
	};
};

export type RawAdoThread = {
	readonly id: number;
	readonly status: number;
	readonly threadContext?: { readonly filePath?: string };
	readonly comments?: readonly RawAdoComment[];
};

export function parseTimestamp(value: string): number {
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

export function compareThreadComments(
	a: ThreadComment,
	b: ThreadComment,
): number {
	return (
		parseTimestamp(a.publishedDate) - parseTimestamp(b.publishedDate) ||
		a.id - b.id
	);
}

export function sanitizeThreadCommentContent(content: string): string {
	return content
		.split("\n")
		.filter((line) => {
			const trimmed = line.trim();
			return (
				trimmed !== BOT_MARKER &&
				trimmed !== REPLY_MARKER &&
				!trimmed.startsWith("<!-- fingerprint:") &&
				!trimmed.startsWith("<!-- in-reply-to:") &&
				trimmed !== "<sub>Was this helpful? React with 👍 or 👎</sub>" &&
				trimmed !== "<sub>Follow-up from Copilot PR Reviewer</sub>"
			);
		})
		.join("\n")
		.replace(/\n?---\n?/g, "\n")
		.trim();
}

export function formatTranscriptComment(comment: ThreadComment): string {
	const author = comment.author.displayName || (comment.isBot ? "Bot" : "User");
	const timestamp = comment.publishedDate || "unknown-time";
	const content = comment.body || "(empty comment)";
	return `[${timestamp}] ${author}: ${content}`;
}

export function buildThreadTranscript(
	comments: readonly ThreadComment[],
): string {
	return comments.map(formatTranscriptComment).join("\n\n");
}

function normalizeThreadComment(
	comment: RawAdoComment,
	botAuthorId: string,
): ThreadComment {
	const authorId = comment.author?.id ?? "";
	const content = comment.content ?? "";
	const isBot = authorId !== "" && authorId === botAuthorId;
	return {
		id: comment.id ?? 0,
		parentCommentId: comment.parentCommentId ?? 0,
		content,
		body: sanitizeThreadCommentContent(content),
		publishedDate: comment.publishedDate ?? "",
		lastUpdatedDate: comment.lastUpdatedDate ?? comment.publishedDate ?? "",
		isDeleted: comment.isDeleted ?? false,
		author: {
			id: authorId,
			displayName: comment.author?.displayName ?? "Unknown",
			uniqueName: comment.author?.uniqueName ?? "",
			isContainer: comment.author?.isContainer ?? false,
		},
		isBot,
		role: isBot ? "bot" : "user",
		replyToCommentId: isBot
			? Number(content.match(REPLY_TO_RE)?.[1] ?? "") || null
			: null,
	};
}

function isActionableUserComment(comment: ThreadComment): boolean {
	return !comment.isDeleted && comment.body.trim() !== "" && !comment.isBot;
}

function findLatestActionableUserComment(
	comments: readonly ThreadComment[],
): ThreadComment | null {
	return comments
		.filter(isActionableUserComment)
		.reduce<ThreadComment | null>((latest, comment) => {
			if (latest === null) {
				return comment;
			}
			return compareThreadComments(latest, comment) < 0 ? comment : latest;
		}, null);
}

function resolveLatestUserFollowUp(
	comments: readonly ThreadComment[],
	answeredCommentIds: readonly number[],
): ThreadComment | null {
	const latestActionableUserComment = findLatestActionableUserComment(comments);
	if (latestActionableUserComment === null) {
		return null;
	}

	return answeredCommentIds.includes(latestActionableUserComment.id)
		? null
		: latestActionableUserComment;
}

export function buildReplyCandidateThread(
	thread: RawAdoThread,
): ReplyCandidateThread | null {
	const rootBotComment = (thread.comments ?? []).find((comment) =>
		(comment.content ?? "").includes(BOT_MARKER),
	);
	if (!rootBotComment) {
		return null;
	}

	const rootContent = rootBotComment.content ?? "";
	const fingerprint = rootContent.match(FINGERPRINT_RE)?.[1] ?? "";
	const botAuthorId = rootBotComment.author?.id ?? "";
	const comments = (thread.comments ?? [])
		.map((comment) => normalizeThreadComment(comment, botAuthorId))
		.sort(compareThreadComments);
	const rootCommentId = rootBotComment.id ?? 0;
	const findingSummary =
		comments.find((comment) => comment.id === rootCommentId)?.body ||
		"Original finding summary unavailable.";

	const latestBotReplyAt = comments
		.filter((comment) => comment.isBot)
		.reduce(
			(latest, comment) =>
				parseTimestamp(comment.publishedDate) > parseTimestamp(latest)
					? comment.publishedDate
					: latest,
			rootBotComment.publishedDate ?? "",
		);

	const checkpoints = comments
		.filter((comment) => comment.isBot)
		.map((comment) => ({
			commentId: comment.id,
			answeredCommentId: comment.replyToCommentId,
			publishedDate: comment.publishedDate,
		}))
		.sort((left, right) => {
			return (
				parseTimestamp(left.publishedDate) -
					parseTimestamp(right.publishedDate) ||
				left.commentId - right.commentId
			);
		});
	const latestBotCheckpoint =
		checkpoints.findLast(
			(checkpoint) => checkpoint.answeredCommentId !== null,
		) ?? null;
	const answeredCommentIds = [
		...new Set(
			checkpoints
				.map((checkpoint) => checkpoint.answeredCommentId)
				.filter((commentId): commentId is number => commentId !== null),
		),
	].sort((left, right) => left - right);
	const latestUserFollowUp = resolveLatestUserFollowUp(
		comments,
		answeredCommentIds,
	);

	return {
		id: thread.id,
		filePath: thread.threadContext?.filePath ?? "",
		fingerprint,
		status: thread.status,
		rootBotCommentId: rootCommentId,
		botAuthorId,
		findingSummary,
		comments,
		latestBotReplyAt,
		latestBotCheckpoint,
		latestUserFollowUp,
		answeredCommentIds,
	};
}
