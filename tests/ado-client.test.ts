import {
	describe,
	expect,
	test,
	mock,
	spyOn,
	beforeEach,
	afterEach,
} from "bun:test";
import {
	reconcile,
	collectFeedback,
	fetchPRMetadata,
	fetchIterationDiff,
	listBotThreads,
	listReplyCandidateThreads,
	createThread,
	createThreadReply,
	resolveThread,
	type BotThread,
	type ChangedFile,
	type ReplyCandidateThread,
} from "../src/ado/client.ts";
import type { Finding } from "../src/types.ts";

// --- Factories ---

function makeFinding(overrides: Partial<Finding> = {}): Finding {
	return {
		filePath: "src/app.ts",
		startLine: 10,
		endLine: 15,
		severity: "warning",
		category: "correctness",
		title: "Possible null dereference",
		message: "Variable may be null",
		confidence: "high",
		fingerprint: "abc123",
		...overrides,
	};
}

function makeThread(overrides: Partial<BotThread> = {}): BotThread {
	return {
		id: 1,
		filePath: "src/app.ts",
		fingerprint: "abc123",
		status: 1,
		...overrides,
	};
}

function makeFile(overrides: Partial<ChangedFile> = {}): ChangedFile {
	return {
		path: "src/app.ts",
		changeType: 2,
		changeTrackingId: 100,
		...overrides,
	};
}

function makeAdoComment(
	overrides: Partial<{
		id: number;
		parentCommentId: number;
		content: string;
		publishedDate: string;
		lastUpdatedDate: string;
		isDeleted: boolean;
		author: {
			id?: string;
			displayName?: string;
			uniqueName?: string;
			isContainer?: boolean;
		};
	}> = {},
): {
	id: number;
	parentCommentId: number;
	content: string;
	publishedDate: string;
	lastUpdatedDate: string;
	isDeleted: boolean;
	author: {
		id: string;
		displayName: string;
		uniqueName: string;
		isContainer: boolean;
	};
} {
	const publishedDate = overrides.publishedDate ?? "2026-03-22T12:00:00.000Z";
	return {
		id: overrides.id ?? 1,
		parentCommentId: overrides.parentCommentId ?? 0,
		content: overrides.content ?? "comment",
		publishedDate,
		lastUpdatedDate: overrides.lastUpdatedDate ?? publishedDate,
		isDeleted: overrides.isDeleted ?? false,
		author: {
			id: overrides.author?.id ?? "user-1",
			displayName: overrides.author?.displayName ?? "Reviewer",
			uniqueName: overrides.author?.uniqueName ?? "reviewer@example.com",
			isContainer: overrides.author?.isContainer ?? false,
		},
	};
}

function makeAdoThread(
	overrides: Partial<{
		id: number;
		status: number;
		threadContext: { filePath?: string };
		comments: ReturnType<typeof makeAdoComment>[];
	}> = {},
): {
	id: number;
	status: number;
	threadContext: { filePath?: string };
	comments: ReturnType<typeof makeAdoComment>[];
} {
	return {
		id: overrides.id ?? 1,
		status: overrides.status ?? 1,
		threadContext: overrides.threadContext ?? { filePath: "src/app.ts" },
		comments: overrides.comments ?? [],
	};
}

// --- Helpers ---

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function errorResponse(
	status: number,
	statusText: string,
	headers?: Record<string, string>,
): Response {
	return new Response(null, { status, statusText, headers });
}

// --- Env setup ---

const ENV_VARS = {
	ADO_ORG: "test-org",
	ADO_PROJECT: "test-project",
	ADO_REPO_ID: "repo-1",
	ADO_PR_ID: "42",
	ADO_PAT: "test-pat-token",
};

function setEnv(): void {
	for (const [key, val] of Object.entries(ENV_VARS)) {
		process.env[key] = val;
	}
}

function clearEnv(): void {
	for (const key of Object.keys(ENV_VARS)) {
		delete process.env[key];
	}
}

// --- Tests ---

describe("reconcile", () => {
	test("new finding not in existing threads → toPost", () => {
		const existingThreads: BotThread[] = [];
		const findings = [makeFinding({ fingerprint: "new123" })];
		const files = [makeFile()];

		const result = reconcile(existingThreads, findings, files);

		expect(result.pendingThreads).toHaveLength(1);
		expect(result.pendingThreads[0].finding.fingerprint).toBe("new123");
		expect(result.threadsForReview).toHaveLength(0);
	});

	test("same fingerprint in existing thread and findings → skip", () => {
		const existingThreads = [makeThread({ fingerprint: "abc123" })];
		const findings = [makeFinding({ fingerprint: "abc123" })];
		const files = [makeFile()];

		const result = reconcile(existingThreads, findings, files);

		expect(result.pendingThreads).toHaveLength(0);
		expect(result.threadsForReview).toHaveLength(0);
	});

	test("existing thread for file in diff but fingerprint gone → toResolve", () => {
		const existingThreads = [
			makeThread({ fingerprint: "old123", filePath: "src/app.ts" }),
		];
		const findings = [makeFinding({ fingerprint: "new456" })];
		const files = [makeFile({ path: "src/app.ts" })];

		const result = reconcile(existingThreads, findings, files);

		expect(result.pendingThreads).toHaveLength(1);
		expect(result.threadsForReview).toHaveLength(1);
		expect(result.threadsForReview[0]).toBe(1);
	});

	test("existing thread for file NOT in diff → untouched", () => {
		const existingThreads = [
			makeThread({ fingerprint: "old123", filePath: "src/other.ts" }),
		];
		const findings: Finding[] = [];
		const files = [makeFile({ path: "src/app.ts" })];

		const result = reconcile(existingThreads, findings, files);

		expect(result.pendingThreads).toHaveLength(0);
		expect(result.threadsForReview).toHaveLength(0);
	});

	test("already resolved thread is not re-resolved", () => {
		const existingThreads = [
			makeThread({
				fingerprint: "old123",
				filePath: "src/app.ts",
				status: 2,
			}),
		];
		const findings: Finding[] = [];
		const files = [makeFile({ path: "src/app.ts" })];

		const result = reconcile(existingThreads, findings, files);

		expect(result.threadsForReview).toHaveLength(0);
	});

	test("maps finding to correct file in toPost", () => {
		const files = [
			makeFile({ path: "src/app.ts", changeTrackingId: 100 }),
			makeFile({ path: "src/utils.ts", changeTrackingId: 200 }),
		];
		const findings = [
			makeFinding({ filePath: "src/utils.ts", fingerprint: "util1" }),
		];

		const result = reconcile([], findings, files);

		expect(result.pendingThreads).toHaveLength(1);
		expect(result.pendingThreads[0].file.changeTrackingId).toBe(200);
	});
});

describe("collectFeedback", () => {
	test("status 2 (resolved) → addressed", async () => {
		const threads = [makeThread({ status: 2, fingerprint: "fp1" })];
		const result = await collectFeedback(threads, false);

		expect(result).toHaveLength(1);
		expect(result[0].signal).toBe("addressed");
	});

	test("status 3 → rejected", async () => {
		const threads = [makeThread({ status: 3, fingerprint: "fp1" })];
		const result = await collectFeedback(threads, false);

		expect(result).toHaveLength(1);
		expect(result[0].signal).toBe("rejected");
	});

	test("status 4 → rejected", async () => {
		const threads = [makeThread({ status: 4, fingerprint: "fp1" })];
		const result = await collectFeedback(threads, false);

		expect(result).toHaveLength(1);
		expect(result[0].signal).toBe("rejected");
	});

	test("status 1 with prMerged=true → ignored", async () => {
		const threads = [makeThread({ status: 1, fingerprint: "fp1" })];
		const result = await collectFeedback(threads, true);

		expect(result).toHaveLength(1);
		expect(result[0].signal).toBe("ignored");
	});

	test("status 1 with prMerged=false → filtered out", async () => {
		const threads = [makeThread({ status: 1, fingerprint: "fp1" })];
		const result = await collectFeedback(threads, false);

		expect(result).toHaveLength(0);
	});

	test("empty fingerprint → filtered out", async () => {
		const threads = [makeThread({ status: 2, fingerprint: "" })];
		const result = await collectFeedback(threads, false);

		expect(result).toHaveLength(0);
	});

	test("includes threadId in signal", async () => {
		const threads = [makeThread({ id: 99, status: 2, fingerprint: "fp1" })];
		const result = await collectFeedback(threads, false);

		expect(result[0].threadId).toBe(99);
	});
});

describe("fetchPRMetadata", () => {
	let fetchSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		setEnv();
		fetchSpy = spyOn(globalThis, "fetch");
	});

	afterEach(() => {
		mock.restore();
		clearEnv();
	});

	test("returns PR title, description, and work item IDs", async () => {
		fetchSpy.mockImplementation((url: string | URL | Request) => {
			const urlStr = typeof url === "string" ? url : url.toString();
			if (urlStr.includes("/workitems")) {
				return Promise.resolve(
					jsonResponse({ value: [{ id: 101 }, { id: 202 }] }),
				);
			}
			return Promise.resolve(
				jsonResponse({ title: "Fix bug", description: "A fix" }),
			);
		});

		const result = await fetchPRMetadata();

		expect(result.title).toBe("Fix bug");
		expect(result.description).toBe("A fix");
		expect(result.workItemIds).toEqual([101, 202]);
	});

	test("returns empty description when undefined", async () => {
		fetchSpy.mockImplementation((url: string | URL | Request) => {
			const urlStr = typeof url === "string" ? url : url.toString();
			if (urlStr.includes("/workitems")) {
				return Promise.resolve(jsonResponse({ value: [] }));
			}
			return Promise.resolve(
				jsonResponse({ title: "No desc", description: undefined }),
			);
		});

		const result = await fetchPRMetadata();

		expect(result.description).toBe("");
	});

	test("returns empty workItemIds when workitems fetch fails", async () => {
		fetchSpy.mockImplementation((url: string | URL | Request) => {
			const urlStr = typeof url === "string" ? url : url.toString();
			if (urlStr.includes("/workitems")) {
				return Promise.reject(new Error("Network error"));
			}
			return Promise.resolve(
				jsonResponse({ title: "PR Title", description: "desc" }),
			);
		});

		const result = await fetchPRMetadata();

		expect(result.title).toBe("PR Title");
		expect(result.workItemIds).toEqual([]);
	});

	test("appends api-version to URL", async () => {
		fetchSpy.mockImplementation((url: string | URL | Request) => {
			const urlStr = typeof url === "string" ? url : url.toString();
			if (urlStr.includes("/workitems")) {
				return Promise.resolve(jsonResponse({ value: [] }));
			}
			return Promise.resolve(jsonResponse({ title: "T", description: "D" }));
		});

		await fetchPRMetadata();

		const firstCallUrl = fetchSpy.mock.calls[0][0] as string;
		expect(firstCallUrl).toContain("api-version=7.1");
	});

	test("sends Basic auth header", async () => {
		fetchSpy.mockImplementation((url: string | URL | Request) => {
			const urlStr = typeof url === "string" ? url : url.toString();
			if (urlStr.includes("/workitems")) {
				return Promise.resolve(jsonResponse({ value: [] }));
			}
			return Promise.resolve(jsonResponse({ title: "T", description: "D" }));
		});

		await fetchPRMetadata();

		const firstCallInit = fetchSpy.mock.calls[0][1] as RequestInit;
		const authHeader = (firstCallInit.headers as Record<string, string>)
			.Authorization;
		const expected = `Basic ${Buffer.from(":test-pat-token").toString("base64")}`;
		expect(authHeader).toBe(expected);
	});
});

describe("fetchIterationDiff", () => {
	let fetchSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		setEnv();
		fetchSpy = spyOn(globalThis, "fetch");
	});

	afterEach(() => {
		mock.restore();
		clearEnv();
	});

	test("returns current/previous iterations and filtered files", async () => {
		fetchSpy.mockImplementation((url: string | URL | Request) => {
			const urlStr = typeof url === "string" ? url : url.toString();
			if (urlStr.includes("/iterations") && !urlStr.includes("/changes")) {
				return Promise.resolve(jsonResponse({ value: [{ id: 1 }, { id: 2 }] }));
			}
			return Promise.resolve(
				jsonResponse({
					changeEntries: [
						{
							changeTrackingId: 1,
							item: { path: "/src/app.ts" },
							changeType: "add",
						},
						{
							changeTrackingId: 2,
							item: { path: "/src/utils.ts" },
							changeType: "edit",
						},
						{
							changeTrackingId: 3,
							item: { path: "/src/old.ts" },
							changeType: "delete",
						},
					],
				}),
			);
		});

		const result = await fetchIterationDiff();

		expect(result.currentIteration).toBe(2);
		expect(result.previousIteration).toBe(1);
		expect(result.files).toHaveLength(2);
		expect(result.files[0].path).toBe("src/app.ts");
		expect(result.files[0].changeType).toBe(1);
		expect(result.files[1].path).toBe("src/utils.ts");
		expect(result.files[1].changeType).toBe(2);
	});

	test("single iteration sets previousIteration to 0", async () => {
		fetchSpy.mockImplementation((url: string | URL | Request) => {
			const urlStr = typeof url === "string" ? url : url.toString();
			if (urlStr.includes("/iterations") && !urlStr.includes("/changes")) {
				return Promise.resolve(jsonResponse({ value: [{ id: 1 }] }));
			}
			return Promise.resolve(jsonResponse({ changeEntries: [] }));
		});

		const result = await fetchIterationDiff();

		expect(result.currentIteration).toBe(1);
		expect(result.previousIteration).toBe(0);
	});

	test("filters out binary extensions", async () => {
		fetchSpy.mockImplementation((url: string | URL | Request) => {
			const urlStr = typeof url === "string" ? url : url.toString();
			if (urlStr.includes("/iterations") && !urlStr.includes("/changes")) {
				return Promise.resolve(jsonResponse({ value: [{ id: 1 }] }));
			}
			return Promise.resolve(
				jsonResponse({
					changeEntries: [
						{
							changeTrackingId: 1,
							item: { path: "/assets/logo.png" },
							changeType: "add",
						},
						{
							changeTrackingId: 2,
							item: { path: "/lib/code.wasm" },
							changeType: "add",
						},
						{
							changeTrackingId: 3,
							item: { path: "/src/valid.ts" },
							changeType: "add",
						},
					],
				}),
			);
		});

		const result = await fetchIterationDiff();

		expect(result.files).toHaveLength(1);
		expect(result.files[0].path).toBe("src/valid.ts");
	});

	test("handles numeric changeType values", async () => {
		fetchSpy.mockImplementation((url: string | URL | Request) => {
			const urlStr = typeof url === "string" ? url : url.toString();
			if (urlStr.includes("/iterations") && !urlStr.includes("/changes")) {
				return Promise.resolve(jsonResponse({ value: [{ id: 1 }] }));
			}
			return Promise.resolve(
				jsonResponse({
					changeEntries: [
						{
							changeTrackingId: 1,
							item: { path: "/src/foo.ts" },
							changeType: 1,
						},
						{
							changeTrackingId: 2,
							item: { path: "/src/bar.ts" },
							changeType: 2,
						},
						{
							changeTrackingId: 3,
							item: { path: "/src/baz.ts" },
							changeType: 3,
						},
					],
				}),
			);
		});

		const result = await fetchIterationDiff();

		expect(result.files).toHaveLength(2);
		expect(result.files[0].changeType).toBe(1);
		expect(result.files[1].changeType).toBe(2);
	});

	test("strips leading slash from paths", async () => {
		fetchSpy.mockImplementation((url: string | URL | Request) => {
			const urlStr = typeof url === "string" ? url : url.toString();
			if (urlStr.includes("/iterations") && !urlStr.includes("/changes")) {
				return Promise.resolve(jsonResponse({ value: [{ id: 1 }] }));
			}
			return Promise.resolve(
				jsonResponse({
					changeEntries: [
						{
							changeTrackingId: 1,
							item: { path: "/src/app.ts" },
							changeType: "add",
						},
					],
				}),
			);
		});

		const result = await fetchIterationDiff();

		expect(result.files[0].path).toBe("src/app.ts");
	});

	test("includes $compareTo param when previous iteration exists", async () => {
		fetchSpy.mockImplementation((url: string | URL | Request) => {
			const urlStr = typeof url === "string" ? url : url.toString();
			if (urlStr.includes("/iterations") && !urlStr.includes("/changes")) {
				return Promise.resolve(jsonResponse({ value: [{ id: 1 }, { id: 2 }] }));
			}
			return Promise.resolve(jsonResponse({ changeEntries: [] }));
		});

		await fetchIterationDiff();

		const changesCallUrl = fetchSpy.mock.calls[1][0] as string;
		expect(changesCallUrl).toContain("$compareTo=1");
	});
});

describe("listBotThreads", () => {
	let fetchSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		setEnv();
		fetchSpy = spyOn(globalThis, "fetch");
	});

	afterEach(() => {
		mock.restore();
		clearEnv();
	});

	test("returns only threads with bot marker", async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse({
				value: [
					makeAdoThread({
						id: 1,
						threadContext: { filePath: "src/a.ts" },
						comments: [
							makeAdoComment({
								content:
									"<!-- copilot-pr-reviewer-bot -->\n<!-- fingerprint:fp1 -->",
								author: { id: "bot-1", displayName: "Copilot Reviewer" },
							}),
						],
					}),
					makeAdoThread({
						id: 2,
						threadContext: { filePath: "src/b.ts" },
						comments: [makeAdoComment({ content: "Human comment" })],
					}),
				],
			}),
		);

		const result = await listBotThreads();

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(1);
	});

	test("extracts fingerprint from comment", async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse({
				value: [
					makeAdoThread({
						id: 1,
						threadContext: { filePath: "src/a.ts" },
						comments: [
							makeAdoComment({
								content:
									"<!-- copilot-pr-reviewer-bot -->\n<!-- fingerprint:abc123def456 -->",
								author: { id: "bot-1", displayName: "Copilot Reviewer" },
							}),
						],
					}),
				],
			}),
		);

		const result = await listBotThreads();

		expect(result[0].fingerprint).toBe("abc123def456");
	});

	test("returns empty fingerprint when no fingerprint marker", async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse({
				value: [
					makeAdoThread({
						id: 1,
						threadContext: { filePath: "src/a.ts" },
						comments: [
							makeAdoComment({
								content: "<!-- copilot-pr-reviewer-bot -->",
								author: { id: "bot-1", displayName: "Copilot Reviewer" },
							}),
						],
					}),
				],
			}),
		);

		const result = await listBotThreads();

		expect(result[0].fingerprint).toBe("");
	});

	test("returns empty filePath when threadContext missing", async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse({
				value: [
					makeAdoThread({
						id: 1,
						threadContext: {},
						comments: [
							makeAdoComment({
								content:
									"<!-- copilot-pr-reviewer-bot -->\n<!-- fingerprint:fp1 -->",
								author: { id: "bot-1", displayName: "Copilot Reviewer" },
							}),
						],
					}),
				],
			}),
		);

		const result = await listBotThreads();

		expect(result[0].filePath).toBe("");
	});
});

describe("listReplyCandidateThreads", () => {
	let fetchSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		setEnv();
		fetchSpy = spyOn(globalThis, "fetch");
	});

	afterEach(() => {
		mock.restore();
		clearEnv();
	});

	test("returns ordered comments, author metadata, and latest actionable follow-up", async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse({
				value: [
					makeAdoThread({
						id: 11,
						threadContext: { filePath: "src/review.ts" },
						comments: [
							makeAdoComment({
								id: 30,
								parentCommentId: 10,
								content: "Can you clarify the edge case?",
								publishedDate: "2026-03-22T12:04:00.000Z",
								author: { id: "user-2", displayName: "Ada Reviewer" },
							}),
							makeAdoComment({
								id: 10,
								content:
									"<!-- copilot-pr-reviewer-bot -->\n<!-- fingerprint:fp-reply -->",
								publishedDate: "2026-03-22T12:00:00.000Z",
								author: { id: "bot-1", displayName: "Copilot Reviewer" },
							}),
							makeAdoComment({
								id: 20,
								parentCommentId: 10,
								content: "I was looking at the null branch.",
								publishedDate: "2026-03-22T12:02:00.000Z",
								author: { id: "user-1", displayName: "Lin Reviewer" },
							}),
							makeAdoComment({
								id: 25,
								parentCommentId: 20,
								content: "Good catch, I meant the fallback path.",
								publishedDate: "2026-03-22T12:03:00.000Z",
								author: { id: "bot-1", displayName: "Copilot Reviewer" },
							}),
						],
					}),
				],
			}),
		);

		const result = await listReplyCandidateThreads();
		const [thread] = result as ReplyCandidateThread[];

		expect(result).toHaveLength(1);
		expect(thread.fingerprint).toBe("fp-reply");
		expect(thread.rootBotCommentId).toBe(10);
		expect(thread.botAuthorId).toBe("bot-1");
		expect(thread.latestBotReplyAt).toBe("2026-03-22T12:03:00.000Z");
		expect(thread.comments.map((comment) => comment.id)).toEqual([
			10, 20, 25, 30,
		]);
		expect(thread.comments[1].author.displayName).toBe("Lin Reviewer");
		expect(thread.comments[3].isBot).toBe(false);
		expect(thread.latestUserFollowUp?.id).toBe(30);
		expect(thread.latestUserFollowUp?.parentCommentId).toBe(10);
	});

	test("ignores deleted, empty, and already-answered user comments when finding follow-ups", async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse({
				value: [
					makeAdoThread({
						comments: [
							makeAdoComment({
								id: 1,
								content:
									"<!-- copilot-pr-reviewer-bot -->\n<!-- fingerprint:fp-ignore -->",
								publishedDate: "2026-03-22T12:00:00.000Z",
								author: { id: "bot-1", displayName: "Copilot Reviewer" },
							}),
							makeAdoComment({
								id: 2,
								content: "Earlier question",
								publishedDate: "2026-03-22T12:01:00.000Z",
								author: { id: "user-1", displayName: "Lin Reviewer" },
							}),
							makeAdoComment({
								id: 3,
								content:
									"Reply from bot\n\n<!-- copilot-pr-reviewer-reply -->\n<!-- in-reply-to:2 -->",
								publishedDate: "2026-03-22T12:02:00.000Z",
								author: { id: "bot-1", displayName: "Copilot Reviewer" },
							}),
							makeAdoComment({
								id: 4,
								content: "   ",
								publishedDate: "2026-03-22T12:03:00.000Z",
								author: { id: "user-2", displayName: "Ada Reviewer" },
							}),
							makeAdoComment({
								id: 5,
								content: "Deleted note",
								publishedDate: "2026-03-22T12:04:00.000Z",
								isDeleted: true,
								author: { id: "user-3", displayName: "Deleted Reviewer" },
							}),
						],
					}),
				],
			}),
		);

		const [thread] = await listReplyCandidateThreads();

		expect(thread.latestUserFollowUp).toBeNull();
	});

	test("preserves edited follow-up text and empty bot reply bodies for thread context", async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse({
				value: [
					makeAdoThread({
						id: 23,
						threadContext: { filePath: "src/auth.ts" },
						comments: [
							makeAdoComment({
								id: 1,
								content: [
									"Root finding summary",
									"",
									"<!-- copilot-pr-reviewer-bot -->",
									"<!-- fingerprint:fp-context -->",
								].join("\n"),
								publishedDate: "2026-03-22T12:00:00.000Z",
								author: { id: "bot-1", displayName: "Copilot Reviewer" },
							}),
							makeAdoComment({
								id: 2,
								parentCommentId: 1,
								content: "Can you clarify the null path?",
								publishedDate: "2026-03-22T12:01:00.000Z",
								author: { id: "user-1", displayName: "Ada Reviewer" },
							}),
							makeAdoComment({
								id: 3,
								parentCommentId: 1,
								content: [
									"---",
									"<sub>Follow-up from Copilot PR Reviewer</sub>",
									"",
									"<!-- copilot-pr-reviewer-reply -->",
									"<!-- in-reply-to:2 -->",
								].join("\n"),
								publishedDate: "2026-03-22T12:02:00.000Z",
								author: { id: "bot-1", displayName: "Copilot Reviewer" },
							}),
							makeAdoComment({
								id: 4,
								parentCommentId: 1,
								content:
									"I rechecked the logout flow. Is `session.user.id` still reachable?",
								publishedDate: "2026-03-22T12:03:00.000Z",
								lastUpdatedDate: "2026-03-22T12:04:00.000Z",
								author: { id: "user-2", displayName: "Lin Reviewer" },
							}),
						],
					}),
				],
			}),
		);

		const [thread] = await listReplyCandidateThreads();

		expect(thread.comments.map((comment) => comment.id)).toEqual([1, 2, 3, 4]);
		expect(thread.comments[2].body).toBe("");
		expect(thread.latestUserFollowUp?.id).toBe(4);
		expect(thread.latestUserFollowUp?.body).toContain("still reachable");
		expect(thread.latestUserFollowUp?.lastUpdatedDate).toBe(
			"2026-03-22T12:04:00.000Z",
		);
	});

	test("ignores non-bot threads and keeps comment order stable on timestamp ties", async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse({
				value: [
					makeAdoThread({
						id: 21,
						threadContext: { filePath: "src/review.ts" },
						comments: [
							makeAdoComment({
								id: 9,
								content:
									"<!-- copilot-pr-reviewer-bot -->\n<!-- fingerprint:fp-order -->",
								publishedDate: "2026-03-22T12:00:00.000Z",
								author: { id: "bot-1", displayName: "Copilot Reviewer" },
							}),
							makeAdoComment({
								id: 11,
								parentCommentId: 9,
								content: "Second same-timestamp follow-up",
								publishedDate: "2026-03-22T12:01:00.000Z",
								author: { id: "user-2", displayName: "Ada Reviewer" },
							}),
							makeAdoComment({
								id: 10,
								parentCommentId: 9,
								content: "First same-timestamp follow-up",
								publishedDate: "2026-03-22T12:01:00.000Z",
								author: { id: "user-1", displayName: "Lin Reviewer" },
							}),
						],
					}),
					makeAdoThread({
						id: 22,
						threadContext: { filePath: "src/ignored.ts" },
						comments: [makeAdoComment({ content: "Human-only thread" })],
					}),
				],
			}),
		);

		const result = await listReplyCandidateThreads();

		expect(result).toHaveLength(1);
		expect(result[0].comments.map((comment) => comment.id)).toEqual([
			9, 10, 11,
		]);
		expect(result[0].latestUserFollowUp?.id).toBe(11);
	});
});

describe("createThread", () => {
	let fetchSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		setEnv();
		fetchSpy = spyOn(globalThis, "fetch");
	});

	afterEach(() => {
		mock.restore();
		clearEnv();
	});

	test("sends POST with correct body structure", async () => {
		fetchSpy.mockResolvedValue(jsonResponse({ id: 1 }));

		const finding = makeFinding({
			filePath: "src/app.ts",
			startLine: 10,
			endLine: 15,
			severity: "warning",
			title: "Test issue",
			message: "Test message",
			fingerprint: "fp123",
		});
		const file = makeFile({ path: "src/app.ts", changeTrackingId: 100 });

		await createThread(finding, file, { current: 2, previous: 1 });

		const callInit = fetchSpy.mock.calls[0][1] as RequestInit;
		expect(callInit.method).toBe("POST");

		const body = JSON.parse(callInit.body as string);
		expect(body.status).toBe(1);
		expect(body.threadContext.filePath).toBe("src/app.ts");
		expect(body.threadContext.rightFileStart.line).toBe(10);
		expect(body.threadContext.rightFileEnd.line).toBe(15);
		expect(body.pullRequestThreadContext.changeTrackingId).toBe(100);
		expect(body.pullRequestThreadContext.iterationContext).toEqual({
			firstComparingIteration: 1,
			secondComparingIteration: 2,
		});
	});

	test("includes suggestion code fence when finding has suggestion", async () => {
		fetchSpy.mockResolvedValue(jsonResponse({ id: 1 }));

		const finding = makeFinding({
			suggestion: "const x = 1;",
		});

		await createThread(finding, makeFile(), { current: 1, previous: 0 });

		const body = JSON.parse(
			(fetchSpy.mock.calls[0][1] as RequestInit).body as string,
		);
		const content = body.comments[0].content as string;
		expect(content).toContain("```suggestion");
		expect(content).toContain("const x = 1;");
	});

	test("omits suggestion code fence when no suggestion", async () => {
		fetchSpy.mockResolvedValue(jsonResponse({ id: 1 }));

		const finding = makeFinding({ suggestion: undefined });

		await createThread(finding, makeFile(), { current: 1, previous: 0 });

		const body = JSON.parse(
			(fetchSpy.mock.calls[0][1] as RequestInit).body as string,
		);
		const content = body.comments[0].content as string;
		expect(content).not.toContain("```suggestion");
	});

	test("includes bot marker and fingerprint in comment", async () => {
		fetchSpy.mockResolvedValue(jsonResponse({ id: 1 }));

		const finding = makeFinding({ fingerprint: "myfingerprint" });

		await createThread(finding, makeFile(), { current: 1, previous: 0 });

		const body = JSON.parse(
			(fetchSpy.mock.calls[0][1] as RequestInit).body as string,
		);
		const content = body.comments[0].content as string;
		expect(content).toContain("<!-- copilot-pr-reviewer-bot -->");
		expect(content).toContain("<!-- fingerprint:myfingerprint -->");
	});

	test("uses 1 for firstComparingIteration when previous is 0", async () => {
		fetchSpy.mockResolvedValue(jsonResponse({ id: 1 }));

		await createThread(makeFinding(), makeFile(), {
			current: 1,
			previous: 0,
		});

		const body = JSON.parse(
			(fetchSpy.mock.calls[0][1] as RequestInit).body as string,
		);
		expect(
			body.pullRequestThreadContext.iterationContext.firstComparingIteration,
		).toBe(1);
	});
});

describe("resolveThread", () => {
	let fetchSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		setEnv();
		fetchSpy = spyOn(globalThis, "fetch");
	});

	afterEach(() => {
		mock.restore();
		clearEnv();
	});

	test("sends PATCH with status 2", async () => {
		fetchSpy.mockResolvedValue(jsonResponse({}));

		await resolveThread(42);

		const callUrl = fetchSpy.mock.calls[0][0] as string;
		expect(callUrl).toContain("/threads/42");

		const callInit = fetchSpy.mock.calls[0][1] as RequestInit;
		expect(callInit.method).toBe("PATCH");

		const body = JSON.parse(callInit.body as string);
		expect(body.status).toBe(2);
	});
});

describe("createThreadReply", () => {
	let fetchSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		setEnv();
		fetchSpy = spyOn(globalThis, "fetch");
	});

	afterEach(() => {
		mock.restore();
		clearEnv();
	});

	test("posts a same-thread reply with reply metadata", async () => {
		fetchSpy.mockResolvedValue(jsonResponse({ id: 99 }));

		await createThreadReply({
			threadId: 42,
			parentCommentId: 10,
			replyText: "Thanks - the null branch still reaches readUserId().",
			followUpCommentId: 30,
		});

		const callUrl = fetchSpy.mock.calls[0][0] as string;
		expect(callUrl).toContain("/threads/42/comments");

		const callInit = fetchSpy.mock.calls[0][1] as RequestInit;
		expect(callInit.method).toBe("POST");

		const body = JSON.parse(callInit.body as string);
		expect(body.parentCommentId).toBe(10);
		expect(body.commentType).toBe(1);
		expect(body.content).toContain(
			"Thanks - the null branch still reaches readUserId().",
		);
		expect(body.content).toContain(
			"<sub>Follow-up from Copilot PR Reviewer</sub>",
		);
		expect(body.content).toContain("<!-- copilot-pr-reviewer-reply -->");
		expect(body.content).toContain("<!-- in-reply-to:30 -->");
		expect(body.content).not.toContain("<!-- copilot-pr-reviewer-bot -->");
	});

	test("omits follow-up metadata when no triggering comment id is provided", async () => {
		fetchSpy.mockResolvedValue(jsonResponse({ id: 100 }));

		await createThreadReply({
			threadId: 7,
			parentCommentId: 1,
			replyText: "Followed up in thread.",
		});

		const body = JSON.parse(
			(fetchSpy.mock.calls[0][1] as RequestInit).body as string,
		);
		expect(body.content).not.toContain("<!-- in-reply-to:");
	});

	test("sanitizes duplicated reply metadata before posting", async () => {
		fetchSpy.mockResolvedValue(jsonResponse({ id: 101 }));

		await createThreadReply({
			threadId: 9,
			parentCommentId: 2,
			replyText:
				"Helpful follow-up.\n\n<!-- copilot-pr-reviewer-reply -->\n<!-- in-reply-to:12 -->\n---",
			followUpCommentId: 12,
		});

		const body = JSON.parse(
			(fetchSpy.mock.calls[0][1] as RequestInit).body as string,
		);
		expect(
			body.content.match(/<!-- copilot-pr-reviewer-reply -->/g),
		).toHaveLength(1);
		expect(body.content.match(/<!-- in-reply-to:12 -->/g)).toHaveLength(1);
		expect(body.content).not.toContain("\n---\n---\n");
	});

	test("rejects reply bodies that become empty after sanitization", async () => {
		fetchSpy.mockResolvedValue(jsonResponse({ id: 102 }));

		await expect(
			createThreadReply({
				threadId: 9,
				parentCommentId: 2,
				replyText: "<!-- copilot-pr-reviewer-reply -->",
				followUpCommentId: 12,
			}),
		).rejects.toThrow("Reply body is empty after sanitization");
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe("adoFetch error handling", () => {
	let fetchSpy: ReturnType<typeof spyOn>;
	let sleepSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		setEnv();
		fetchSpy = spyOn(globalThis, "fetch");
		sleepSpy = spyOn(Bun, "sleep").mockResolvedValue(undefined as never);
	});

	afterEach(() => {
		mock.restore();
		clearEnv();
	});

	test("throws on 401 with auth error message", async () => {
		fetchSpy.mockResolvedValue(errorResponse(401, "Unauthorized"));

		await expect(resolveThread(1)).rejects.toThrow("ADO auth failed (401)");
	});

	test("retries on 429 and succeeds", async () => {
		let callCount = 0;
		fetchSpy.mockImplementation(() => {
			callCount++;
			if (callCount <= 1) {
				return Promise.resolve(
					errorResponse(429, "Too Many Requests", { "Retry-After": "1" }),
				);
			}
			return Promise.resolve(jsonResponse({}));
		});

		await resolveThread(1);

		expect(sleepSpy).toHaveBeenCalledWith(1000);
	});

	test("throws after max retries on repeated 429", async () => {
		fetchSpy.mockResolvedValue(
			errorResponse(429, "Too Many Requests", { "Retry-After": "1" }),
		);

		await expect(resolveThread(1)).rejects.toThrow(
			"ADO API rate limit exceeded after max retries",
		);
	});

	test("throws on 500 with status text", async () => {
		fetchSpy.mockResolvedValue(errorResponse(500, "Internal Server Error"));

		await expect(resolveThread(1)).rejects.toThrow(
			"ADO API error: 500 Internal Server Error",
		);
	});

	test("uses default Retry-After of 5 when header missing", async () => {
		let callCount = 0;
		fetchSpy.mockImplementation(() => {
			callCount++;
			if (callCount <= 1) {
				return Promise.resolve(errorResponse(429, "Too Many Requests"));
			}
			return Promise.resolve(jsonResponse({}));
		});

		await resolveThread(1);

		expect(sleepSpy).toHaveBeenCalledWith(5000);
	});
});
