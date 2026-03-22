import {
	CopilotClient,
	approveAll,
	type MessageOptions,
} from "@github/copilot-sdk";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHooks } from "./hooks.ts";
import { configureBundledInstructionDirs } from "./instructions.ts";
import { extractAssistantText } from "./reply-loop.ts";
import { buildReplyRequest } from "./review.ts";
import { getReplySystemPrompt } from "./session.ts";
import {
	buildReplyCandidateThread,
	type RawAdoThread,
	type ReplyCandidateThread,
} from "./thread-context.ts";

const REPLY_TIMEOUT = 60_000;
const SAMPLE_FILE_PATH = "src/auth.ts";

const SAMPLE_FILE_CONTENT = [
	"type Session = { user: { id: string } | null };",
	"",
	"export function canUseFallback(session: Session): boolean {",
	"\tif (!session.user) {",
	"\t\treturn true;",
	"\t}",
	"",
	'\treturn session.user.id.startsWith("svc_");',
	"}",
	"",
	"export function readUserId(session: Session): string {",
	"\tif (canUseFallback(session)) {",
	"\t\treturn session.user.id;",
	"\t}",
	"",
	"\treturn session.user.id;",
	"}",
].join("\n");

const SAMPLE_ROOT_COMMENT = [
	"🟡 **WARNING** — Null branch can bypass the guard",
	"",
	"The fallback path can still dereference `session.user` after logout, so a null session can reach `readUserId`.",
	"",
	"---",
	"<sub>Was this helpful? React with 👍 or 👎</sub>",
	"",
	"<!-- copilot-pr-reviewer-bot -->",
	"<!-- fingerprint:reply-prototype-fp -->",
].join("\n");

type ReplyPrototypePreparation = {
	readonly thread: ReplyCandidateThread;
	readonly request: MessageOptions;
};

export type ReplyPrototypeResult = ReplyPrototypePreparation & {
	readonly replyText: string;
	readonly report: string;
	readonly mode: "copilot-sdk" | "controlled";
};

type ReplyResponder = (request: MessageOptions) => Promise<unknown>;

function createSampleReplyCandidateThread(): ReplyCandidateThread {
	const thread = {
		id: 701,
		status: 1,
		threadContext: { filePath: SAMPLE_FILE_PATH },
		comments: [
			{
				id: 10,
				parentCommentId: 0,
				content: SAMPLE_ROOT_COMMENT,
				publishedDate: "2026-03-22T13:00:00.000Z",
				lastUpdatedDate: "2026-03-22T13:00:00.000Z",
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
				content:
					"I was tracing the logout flow and saw the fallback branch before `readUserId()`.",
				publishedDate: "2026-03-22T13:02:00.000Z",
				lastUpdatedDate: "2026-03-22T13:02:00.000Z",
				isDeleted: false,
				author: {
					id: "user-1",
					displayName: "Lin Reviewer",
					uniqueName: "lin@example.com",
					isContainer: false,
				},
			},
			{
				id: 25,
				parentCommentId: 20,
				content:
					"Right, the helper returns `true`, but `readUserId()` still dereferences `session.user` immediately afterward.",
				publishedDate: "2026-03-22T13:03:00.000Z",
				lastUpdatedDate: "2026-03-22T13:03:00.000Z",
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
				content:
					"Can you explain why the null branch is still risky if `canUseFallback()` already checks `session.user`?",
				publishedDate: "2026-03-22T13:04:00.000Z",
				lastUpdatedDate: "2026-03-22T13:04:00.000Z",
				isDeleted: false,
				author: {
					id: "user-2",
					displayName: "Ada Reviewer",
					uniqueName: "ada@example.com",
					isContainer: false,
				},
			},
		],
	} satisfies RawAdoThread;

	const normalized = buildReplyCandidateThread(thread);
	if (normalized === null) {
		throw new Error("Sample reply thread failed to normalize");
	}

	return normalized;
}

async function scaffoldReplyPrototypeDir(): Promise<{
	readonly tmpDir: string;
	readonly absolutePath: string;
}> {
	const tmpDir = await mkdtemp(join(tmpdir(), "pr-reviewer-reply-prototype-"));
	const absolutePath = join(tmpDir, SAMPLE_FILE_PATH);

	await mkdir(join(tmpDir, ".github"), { recursive: true });
	await mkdir(join(tmpDir, "src"), { recursive: true });
	await writeFile(
		join(tmpDir, ".github", "copilot-instructions.md"),
		"Respond as a careful PR reviewer. Keep thread replies concise and specific to the code.",
	);
	await writeFile(absolutePath, SAMPLE_FILE_CONTENT);

	return { tmpDir, absolutePath };
}

export function prepareReplyPrototype(
	absolutePath: string,
): ReplyPrototypePreparation {
	const thread = createSampleReplyCandidateThread();
	const request = buildReplyRequest({
		thread,
		absolutePath,
		changeContext: "edit in auth fallback handling",
	});

	return { thread, request };
}

function extractPromptSection(prompt: string, heading: string): string {
	const marker = `## ${heading}`;
	const start = prompt.indexOf(marker);
	if (start === -1) {
		return "(section unavailable)";
	}

	const bodyStart = start + marker.length;
	const remaining = prompt.slice(bodyStart).trimStart();
	const nextHeadingIndex = remaining.indexOf("\n## ");
	return (
		nextHeadingIndex === -1 ? remaining : remaining.slice(0, nextHeadingIndex)
	).trim();
}

function buildControlledReply(thread: ReplyCandidateThread): string {
	const followUp = thread.latestUserFollowUp?.content.trim() ?? "the follow-up";
	return [
		"The null branch is still risky because `canUseFallback()` only decides whether the fallback path runs; it does not make `session.user` safe for the later dereference in `readUserId()`.",
		"In this flow the helper can return `true` when `session.user` is already null, and the next line still reads `session.user.id`, so the logout path can crash even though the guard looked correct in isolation.",
		`That is why the follow-up focuses on ${followUp} -- the fix needs to guard the dereference itself or return before touching \`session.user.id\`.`,
	].join(" ");
}

export function formatReplyPrototypeReport(
	result: ReplyPrototypeResult,
): string {
	const followUp = result.thread.latestUserFollowUp;
	const triggerLine = followUp
		? `[${followUp.publishedDate}] ${followUp.author.displayName}: ${followUp.content.trim()}`
		: "(no actionable follow-up detected)";

	const replyContext = extractPromptSection(
		result.request.prompt,
		"Reply Context",
	);
	const findingSummary = extractPromptSection(
		result.request.prompt,
		"Original Finding Summary",
	);
	const transcript = extractPromptSection(
		result.request.prompt,
		"Ordered Thread Transcript",
	);

	return [
		"Same-Thread Reply Prototype",
		"=".repeat(60),
		`Mode: ${result.mode}`,
		"",
		"Detected trigger comment:",
		triggerLine,
		"",
		"Conversation context used:",
		replyContext,
		"",
		"Original finding summary:",
		findingSummary,
		"",
		"Ordered thread transcript:",
		transcript,
		"",
		"Generated same-thread reply:",
		result.replyText,
		"=".repeat(60),
	].join("\n");
}

export async function runReplyPrototypeFlow(options: {
	readonly absolutePath: string;
	readonly mode: ReplyPrototypeResult["mode"];
	readonly respond: ReplyResponder;
}): Promise<ReplyPrototypeResult> {
	const prepared = prepareReplyPrototype(options.absolutePath);
	const rawResponse = await options.respond(prepared.request);
	const replyText = extractAssistantText(rawResponse);
	const result: ReplyPrototypeResult = {
		...prepared,
		replyText,
		mode: options.mode,
		report: "",
	};

	return {
		...result,
		report: formatReplyPrototypeReport(result),
	};
}

type PrototypeResponder = {
	readonly mode: ReplyPrototypeResult["mode"];
	readonly respond: ReplyResponder;
	readonly close: () => Promise<void>;
};

async function createPrototypeResponder(
	tmpDir: string,
	thread: ReplyCandidateThread,
): Promise<PrototypeResponder> {
	const ghToken = process.env.COPILOT_GITHUB_TOKEN;
	if (!ghToken) {
		return {
			mode: "controlled",
			respond: async () => buildControlledReply(thread),
			close: async () => Promise.resolve(),
		};
	}

	configureBundledInstructionDirs();
	const client = new CopilotClient({ cwd: tmpDir });
	await client.start();

	const session = await client.createSession({
		sessionId: `reply-prototype-${Date.now()}`,
		model: process.env.COPILOT_MODEL ?? "gpt-4.1",
		streaming: false,
		excludedTools: [
			"edit_file",
			"write_file",
			"shell",
			"git_push",
			"web_fetch",
		],
		hooks: createHooks(),
		systemMessage: {
			content: getReplySystemPrompt(),
			mode: "append",
		},
		onPermissionRequest: approveAll,
		workingDirectory: tmpDir,
	});

	return {
		mode: "copilot-sdk",
		respond: (request) => session.sendAndWait(request, REPLY_TIMEOUT),
		close: async () => {
			await session.disconnect();
			await client.stop();
		},
	};
}

async function runReplyPrototype(): Promise<void> {
	console.log("Thread Conversation Prototype — Same-Thread Reply");
	console.log("=".repeat(60));

	const { tmpDir, absolutePath } = await scaffoldReplyPrototypeDir();
	const thread = createSampleReplyCandidateThread();
	const responder = await createPrototypeResponder(tmpDir, thread);

	try {
		const result = await runReplyPrototypeFlow({
			absolutePath,
			mode: responder.mode,
			respond: responder.respond,
		});

		if (result.mode === "controlled") {
			console.log(
				"Using controlled offline responder because COPILOT_GITHUB_TOKEN is not set.",
			);
			console.log();
		}

		console.log(result.report);
	} finally {
		await responder.close();
		await rm(tmpDir, { recursive: true, force: true });
	}
}

runReplyPrototype().catch((error) => {
	console.error(
		`Reply prototype failed: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
});
