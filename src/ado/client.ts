import type { Finding } from "../types.ts";
import {
BOT_MARKER,
REPLY_MARKER,
buildReplyCandidateThread,
type RawAdoThread,
type ReplyCandidateThread,
} from "../thread-context.ts";

export type {
RawAdoComment,
RawAdoThread,
ReplyCandidateThread,
ThreadComment,
ThreadCommentAuthor,
} from "../thread-context.ts";

export type ChangedFile = {
readonly path: string;
readonly changeType: number;
readonly changeTrackingId: number;
};

export type BotThread = {
readonly id: number;
readonly filePath: string;
readonly fingerprint: string;
readonly status: number;
};

type ReconcileResult = {
readonly pendingThreads: ReadonlyArray<{
finding: Finding;
file: ChangedFile;
}>;
readonly threadsForReview: readonly number[];
};

const REPLY_METADATA_RE =
/<!--\s*(?:copilot-pr-reviewer-bot|copilot-pr-reviewer-reply|fingerprint:[^>]+|in-reply-to:\d+)\s*-->/g;

const BINARY_EXTS = new Set([
".png",
".jpg",
".jpeg",
".gif",
".webp",
".ico",
".svg",
".woff",
".woff2",
".ttf",
".eot",
".dll",
".exe",
".zip",
".tar",
".gz",
".wasm",
".map",
]);

function env(key: string): string {
const val = process.env[key];
if (!val) throw new Error(`Missing environment variable: ${key}`);
return val;
}

function baseUrl(): string {
const org = env("ADO_ORG");
const project = env("ADO_PROJECT");
const repoId = env("ADO_REPO_ID");
const prId = env("ADO_PR_ID");
return `https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repoId}/pullRequests/${prId}`;
}

function authHeaders(): Record<string, string> {
const pat = env("ADO_PAT");
const encoded = Buffer.from(`:${pat}`).toString("base64");
return {
Authorization: `Basic ${encoded}`,
"Content-Type": "application/json",
};
}

const MAX_RETRIES = 3;

async function fetchThreads(): Promise<readonly RawAdoThread[]> {
const base = baseUrl();
const threads = await adoFetch<{ value: RawAdoThread[] }>(`${base}/threads`);
return threads.value;
}

async function adoFetch<T>(
url: string,
init?: RequestInit,
retryCount = 0,
): Promise<T> {
const separator = url.includes("?") ? "&" : "?";
const fullUrl = `${url}${separator}api-version=7.1`;
const res = await fetch(fullUrl, {
...init,
headers: { ...authHeaders(), ...init?.headers },
});

if (res.status === 401) {
console.warn(
"##vso[task.logissue type=warning]ADO PAT may be expired or invalid (401)",
);
throw new Error("ADO auth failed (401)");
}

if (res.status === 429) {
if (retryCount >= MAX_RETRIES) {
throw new Error("ADO API rate limit exceeded after max retries");
}
const retryAfter = Number(res.headers.get("Retry-After") ?? "5");
await Bun.sleep(retryAfter * 1000);
return adoFetch<T>(url, init, retryCount + 1);
}

if (!res.ok) {
throw new Error(`ADO API error: ${res.status} ${res.statusText}`);
}

return res.json() as Promise<T>;
}

// --- Public API ---

export type PRMetadata = {
readonly title: string;
readonly description: string;
readonly workItemIds: readonly number[];
};

export async function fetchPRMetadata(): Promise<PRMetadata> {
const base = baseUrl();

const [pr, workItems] = await Promise.all([
adoFetch<{ title: string; description: string }>(base),
adoFetch<{ value: Array<{ id: number }> }>(`${base}/workitems`).catch(
() => ({ value: [] }),
),
]);

return {
title: pr.title,
description: pr.description ?? "",
workItemIds: workItems.value.map((wi) => wi.id),
};
}

export type IterationDiff = {
readonly currentIteration: number;
readonly previousIteration: number;
readonly files: readonly ChangedFile[];
};

export async function fetchIterationDiff(): Promise<IterationDiff> {
const base = baseUrl();
const iterations = await adoFetch<{ value: Array<{ id: number }> }>(
`${base}/iterations`,
);

const sorted = iterations.value.map((i) => i.id).sort((a, b) => a - b);
const current = sorted[sorted.length - 1] ?? 1;
const previous = current > 1 ? current - 1 : 0;

const compareTo = previous > 0 ? `?$compareTo=${previous}` : "";
const changes = await adoFetch<{
changeEntries: Array<{
changeTrackingId: number;
item: { path: string };
changeType: string | number;
}>;
}>(`${base}/iterations/${current}/changes${compareTo}`);

const INCLUDED_TYPES = new Set<string | number>(["add", "edit", 1, 2]);

const files = changes.changeEntries
.filter((e) => INCLUDED_TYPES.has(e.changeType))
.filter((e) => {
const ext = e.item.path.slice(e.item.path.lastIndexOf("."));
return !BINARY_EXTS.has(ext.toLowerCase());
})
.map((e) => ({
path: e.item.path.replace(/^\//, ""),
changeType:
typeof e.changeType === "string"
? ({ add: 1, edit: 2, delete: 3, rename: 4 }[e.changeType] ?? 0)
: e.changeType,
changeTrackingId: e.changeTrackingId,
}));

return { currentIteration: current, previousIteration: previous, files };
}

export async function listBotThreads(): Promise<readonly BotThread[]> {
const threads = await fetchThreads();
return threads
.map(buildReplyCandidateThread)
.filter((thread): thread is ReplyCandidateThread => thread !== null)
.map((thread) => ({
id: thread.id,
filePath: thread.filePath,
fingerprint: thread.fingerprint,
status: thread.status,
}));
}

export async function listReplyCandidateThreads(): Promise<
readonly ReplyCandidateThread[]
> {
const threads = await fetchThreads();
return threads
.map(buildReplyCandidateThread)
.filter((thread): thread is ReplyCandidateThread => thread !== null);
}

const SEVERITY_ICONS: Record<string, string> = {
critical: "\uD83D\uDD34",
warning: "\uD83D\uDFE1",
suggestion: "\uD83D\uDD35",
nitpick: "\u26AA",
};

function formatThreadBody(finding: Finding): string {
const icon = SEVERITY_ICONS[finding.severity] ?? "";
const lines = [
`${icon} **${finding.severity.toUpperCase()}** — ${finding.title}`,
"",
finding.message,
];
// Azure DevOps renders ```suggestion fences as "Apply change" actions.
if (finding.suggestion) {
lines.push(
"",
"**Suggested fix:**",
"```suggestion",
finding.suggestion,
"```",
);
}

lines.push(
"",
"---",
"<sub>Was this helpful? React with \uD83D\uDC4D or \uD83D\uDC4E</sub>",
"",
BOT_MARKER,
`<!-- fingerprint:${finding.fingerprint} -->`,
);

return lines.join("\n");
}

function formatReplyBody(
replyText: string,
metadata: {
readonly followUpCommentId?: number;
},
): string {
const sanitizedReplyText = replyText
.replace(REPLY_METADATA_RE, "")
.replace(/\n?---\n?/g, "\n")
.trim();

if (sanitizedReplyText === "") {
throw new Error("Reply body is empty after sanitization");
}

const lines = [
sanitizedReplyText,
"",
"---",
"<sub>Follow-up from Copilot PR Reviewer</sub>",
"",
REPLY_MARKER,
];

if (metadata.followUpCommentId !== undefined) {
lines.push(`<!-- in-reply-to:${metadata.followUpCommentId} -->`);
}

return lines.join("\n");
}

export async function createThread(
finding: Finding,
file: ChangedFile,
iteration: { current: number; previous: number },
): Promise<void> {
const base = baseUrl();
const body = {
comments: [
{
parentCommentId: 0,
content: formatThreadBody(finding),
commentType: 1,
},
],
status: 1,
threadContext: {
filePath: file.path,
rightFileStart: { line: finding.startLine, offset: 1 },
rightFileEnd: { line: finding.endLine, offset: 1 },
},
pullRequestThreadContext: {
changeTrackingId: file.changeTrackingId,
iterationContext: {
firstComparingIteration: iteration.previous || 1,
secondComparingIteration: iteration.current,
},
},
};

await adoFetch(`${base}/threads`, {
method: "POST",
body: JSON.stringify(body),
});
}

export async function createThreadReply(options: {
readonly threadId: number;
readonly parentCommentId: number;
readonly replyText: string;
readonly followUpCommentId?: number;
}): Promise<void> {
const base = baseUrl();
const body = {
parentCommentId: options.parentCommentId,
content: formatReplyBody(options.replyText, {
followUpCommentId: options.followUpCommentId,
}),
commentType: 1,
};

await adoFetch(`${base}/threads/${options.threadId}/comments`, {
method: "POST",
body: JSON.stringify(body),
});
}

export async function resolveThread(threadId: number): Promise<void> {
const base = baseUrl();
await adoFetch(`${base}/threads/${threadId}`, {
method: "PATCH",
body: JSON.stringify({ status: 2 }),
});
}

export type FeedbackSignal = {
readonly fingerprint: string;
readonly signal: "addressed" | "rejected" | "ignored";
readonly threadId: number;
};

export async function collectFeedback(
existingThreads: readonly BotThread[],
prMerged: boolean,
): Promise<readonly FeedbackSignal[]> {
return existingThreads
.filter((t) => t.fingerprint !== "")
.map((t) => {
let signal: FeedbackSignal["signal"];
if (t.status === 2) {
signal = "addressed";
} else if (t.status === 3 || t.status === 4) {
signal = "rejected";
} else if (t.status === 1 && prMerged) {
signal = "ignored";
} else {
return null;
}
return { fingerprint: t.fingerprint, signal, threadId: t.id };
})
.filter((s): s is FeedbackSignal => s !== null);
}

export function reconcile(
existingThreads: readonly BotThread[],
newFindings: readonly Finding[],
files: readonly ChangedFile[],
): ReconcileResult {
const existingFingerprints = new Set(
existingThreads.map((t) => t.fingerprint),
);
const newFingerprints = new Set(newFindings.map((f) => f.fingerprint));
const diffFilePaths = new Set(files.map((f) => f.path));
const fileByPath = new Map(files.map((f) => [f.path, f]));

const toPost = newFindings
.filter(
(f) =>
!existingFingerprints.has(f.fingerprint) && fileByPath.has(f.filePath),
)
.map((finding) => ({
finding,
file: fileByPath.get(finding.filePath)!,
}));

const toResolve = existingThreads
.filter(
(t) =>
t.status === 1 &&
diffFilePaths.has(t.filePath) &&
!newFingerprints.has(t.fingerprint),
)
.map((t) => t.id);

return { pendingThreads: toPost, threadsForReview: toResolve };
}
