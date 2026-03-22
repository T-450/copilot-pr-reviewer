import { describe, expect, test, spyOn, mock, afterEach } from "bun:test";
import { createStreamingHandler } from "../src/streaming.ts";
import type { SessionEvent } from "@github/copilot-sdk";
import { meetsThreshold } from "../src/config.ts";
import { clusterFindings } from "../src/cluster.ts";
import {
	reconcile,
	type ChangedFile,
	type BotThread,
} from "../src/ado/client.ts";
import type { Finding } from "../src/types.ts";

// ── Factories ────────────────────────────────────────────────────────────────

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

// ── Streaming progress handling ──────────────────────────────────────────────

describe("createStreamingHandler — streaming progress handling", () => {
	afterEach(() => {
		mock.restore();
	});

	test("writes dot on assistant.message_delta", () => {
		const writeSpy = spyOn(process.stdout, "write").mockReturnValue(true);
		const handler = createStreamingHandler();

		// biome-ignore lint/suspicious/noExplicitAny: testing with minimal SessionEvent shape
		handler({ type: "assistant.message_delta" } as any);

		expect(writeSpy).toHaveBeenCalledWith(".");
	});

	test("writes newline on assistant.message (complete)", () => {
		const writeSpy = spyOn(process.stdout, "write").mockReturnValue(true);
		const handler = createStreamingHandler();

		// biome-ignore lint/suspicious/noExplicitAny: testing with minimal SessionEvent shape
		handler({ type: "assistant.message" } as any);

		expect(writeSpy).toHaveBeenCalledWith("\n");
	});

	test("logs error with message on session.error", () => {
		const errorSpy = spyOn(console, "error").mockImplementation(() => {
			/* noop */
		});
		const handler = createStreamingHandler();

		handler({
			type: "session.error",
			data: { message: "Rate limit hit" },
		} as unknown as SessionEvent);

		expect(errorSpy).toHaveBeenCalledTimes(1);
		const logged = errorSpy.mock.calls[0][0] as string;
		expect(logged).toContain("[stream error]");
		expect(logged).toContain("Rate limit hit");
	});

	test("does not write or log on session.idle", () => {
		const writeSpy = spyOn(process.stdout, "write").mockReturnValue(true);
		const errorSpy = spyOn(console, "error").mockImplementation(() => {
			/* noop */
		});
		const handler = createStreamingHandler();

		// biome-ignore lint/suspicious/noExplicitAny: testing with minimal SessionEvent shape
		handler({ type: "session.idle" } as any);

		expect(writeSpy).not.toHaveBeenCalled();
		expect(errorSpy).not.toHaveBeenCalled();
	});

	test("handles unknown event types gracefully without crashing", () => {
		const writeSpy = spyOn(process.stdout, "write").mockReturnValue(true);
		const errorSpy = spyOn(console, "error").mockImplementation(() => {
			/* noop */
		});
		const handler = createStreamingHandler();

		// biome-ignore lint/suspicious/noExplicitAny: testing unknown event type
		handler({ type: "unknown.future.event" } as any);

		expect(writeSpy).not.toHaveBeenCalled();
		expect(errorSpy).not.toHaveBeenCalled();
	});

	test("handler is reusable across multiple events", () => {
		const writeSpy = spyOn(process.stdout, "write").mockReturnValue(true);
		const handler = createStreamingHandler();

		// biome-ignore lint/suspicious/noExplicitAny: testing with minimal SessionEvent shape
		handler({ type: "assistant.message_delta" } as any);
		// biome-ignore lint/suspicious/noExplicitAny: testing with minimal SessionEvent shape
		handler({ type: "assistant.message_delta" } as any);
		// biome-ignore lint/suspicious/noExplicitAny: testing with minimal SessionEvent shape
		handler({ type: "assistant.message" } as any);

		expect(writeSpy).toHaveBeenCalledTimes(3);
		expect(writeSpy.mock.calls[0][0]).toBe(".");
		expect(writeSpy.mock.calls[1][0]).toBe(".");
		expect(writeSpy.mock.calls[2][0]).toBe("\n");
	});

	test("each call to createStreamingHandler returns an independent handler", () => {
		const handler1 = createStreamingHandler();
		const handler2 = createStreamingHandler();
		expect(handler1).not.toBe(handler2);
	});
});

// ── File filtering with ignore globs ─────────────────────────────────────────
//
// The orchestrator (index.ts) filters files using:
//   files.filter(f => !config.ignore.some(p => new Bun.Glob(p).match(f.path)))
// These tests verify the glob-based filtering pattern with Bun.Glob.

describe("orchestration — file filtering with ignore globs", () => {
	function filterFiles(
		files: { path: string }[],
		ignore: string[],
	): { path: string }[] {
		return files.filter(
			(f) => !ignore.some((pattern) => new Bun.Glob(pattern).match(f.path)),
		);
	}

	test("filters files matching a single glob pattern", () => {
		const files = [
			{ path: "src/app.ts" },
			{ path: "src/app.generated.ts" },
			{ path: "src/deep/nested.generated.ts" },
		];

		const filtered = filterFiles(files, ["**/*.generated.ts"]);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].path).toBe("src/app.ts");
	});

	test("filters files matching multiple glob patterns", () => {
		const files = [
			{ path: "src/app.ts" },
			{ path: "vendor/lib.ts" },
			{ path: "tests/app.test.ts" },
			{ path: "src/utils.ts" },
		];

		const filtered = filterFiles(files, ["vendor/**", "**/*.test.ts"]);

		expect(filtered).toHaveLength(2);
		expect(filtered.map((f) => f.path)).toEqual(["src/app.ts", "src/utils.ts"]);
	});

	test("no ignore patterns passes all files through", () => {
		const files = [{ path: "src/a.ts" }, { path: "src/b.ts" }];

		const filtered = filterFiles(files, []);

		expect(filtered).toHaveLength(2);
	});

	test("all files ignored results in empty array", () => {
		const files = [{ path: "vendor/a.ts" }, { path: "vendor/b.ts" }];

		const filtered = filterFiles(files, ["vendor/**"]);

		expect(filtered).toHaveLength(0);
	});

	test("maxFiles caps the number of reviewed files", () => {
		const files = Array.from({ length: 50 }, (_, i) => ({
			path: `src/file${i}.ts`,
		}));
		const maxFiles = 30;

		const filtered = files.slice(0, maxFiles);

		expect(filtered).toHaveLength(30);
		expect(filtered[0].path).toBe("src/file0.ts");
		expect(filtered[29].path).toBe("src/file29.ts");
	});

	test("maxFiles has no effect when fewer files than limit", () => {
		const files = [{ path: "src/a.ts" }, { path: "src/b.ts" }];
		const maxFiles = 30;

		const filtered = files.slice(0, maxFiles);

		expect(filtered).toHaveLength(2);
	});
});

// ── Clustering disabled passthrough ──────────────────────────────────────────
//
// When config.clustering is false, the orchestrator creates passthrough
// clusters — each finding becomes a single-member group with isClustered=false.

describe("orchestration — clustering disabled passthrough", () => {
	test("each finding becomes its own single-member cluster", () => {
		const findings = [
			makeFinding({ fingerprint: "fp1", filePath: "a.ts" }),
			makeFinding({ fingerprint: "fp2", filePath: "b.ts" }),
			makeFinding({ fingerprint: "fp3", filePath: "c.ts" }),
		];

		// Replicate the inline passthrough path from index.ts
		const clusters = findings.map((f) => ({
			primary: f,
			members: [f],
			clusterFingerprint: f.fingerprint,
			isClustered: false,
		}));

		expect(clusters).toHaveLength(3);
		for (let i = 0; i < clusters.length; i++) {
			expect(clusters[i].primary).toBe(findings[i]);
			expect(clusters[i].members).toHaveLength(1);
			expect(clusters[i].isClustered).toBe(false);
			expect(clusters[i].clusterFingerprint).toBe(findings[i].fingerprint);
		}
	});

	test("passthrough clusters extract all members when not clustered", () => {
		const findings = [
			makeFinding({ fingerprint: "fp1" }),
			makeFinding({ fingerprint: "fp2" }),
		];

		const clusters = findings.map((f) => ({
			primary: f,
			members: [f],
			clusterFingerprint: f.fingerprint,
			isClustered: false,
		}));

		// In production: clusters.flatMap(c => c.isClustered ? [c.primary] : c.members)
		const toReconcile = clusters.flatMap((c) =>
			c.isClustered ? [c.primary] : c.members,
		);

		expect(toReconcile).toHaveLength(2);
		expect(toReconcile).toEqual(findings);
	});

	test("enabled clustering collapses above-threshold groups to primary only", () => {
		const findings = Array.from({ length: 4 }, (_, i) =>
			makeFinding({
				fingerprint: `fp${i}`,
				filePath: `src/file${i}.ts`,
				title: "Possible null dereference",
				category: "correctness",
				severity: "warning",
			}),
		);

		const clusters = clusterFindings(findings, 3);
		const toReconcile = clusters.flatMap((c) =>
			c.isClustered ? [c.primary] : c.members,
		);

		// 4 similar findings with threshold 3 → 1 cluster with isClustered=true
		// Only the primary finding is reconciled
		expect(clusters).toHaveLength(1);
		expect(clusters[0].isClustered).toBe(true);
		expect(toReconcile).toHaveLength(1);
	});
});

// ── Threshold filtering pipeline ─────────────────────────────────────────────
//
// The orchestrator filters findings with:
//   findings.filter(f => meetsThreshold(f.severity, config.severityThreshold))

describe("orchestration — threshold filtering pipeline", () => {
	test("warning threshold filters out suggestions and nitpicks", () => {
		const findings = [
			makeFinding({ severity: "critical", fingerprint: "fp1" }),
			makeFinding({ severity: "warning", fingerprint: "fp2" }),
			makeFinding({ severity: "suggestion", fingerprint: "fp3" }),
			makeFinding({ severity: "nitpick", fingerprint: "fp4" }),
		];

		const threshold = "warning" as const;
		const filtered = findings.filter((f) =>
			meetsThreshold(f.severity, threshold),
		);

		expect(filtered).toHaveLength(2);
		expect(filtered[0].severity).toBe("critical");
		expect(filtered[1].severity).toBe("warning");
	});

	test("nitpick threshold passes all findings through", () => {
		const findings = [
			makeFinding({ severity: "critical", fingerprint: "fp1" }),
			makeFinding({ severity: "warning", fingerprint: "fp2" }),
			makeFinding({ severity: "suggestion", fingerprint: "fp3" }),
			makeFinding({ severity: "nitpick", fingerprint: "fp4" }),
		];

		const filtered = findings.filter((f) =>
			meetsThreshold(f.severity, "nitpick"),
		);

		expect(filtered).toHaveLength(4);
	});

	test("critical threshold only passes critical findings", () => {
		const findings = [
			makeFinding({ severity: "critical", fingerprint: "fp1" }),
			makeFinding({ severity: "warning", fingerprint: "fp2" }),
			makeFinding({ severity: "suggestion", fingerprint: "fp3" }),
		];

		const filtered = findings.filter((f) =>
			meetsThreshold(f.severity, "critical"),
		);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].severity).toBe("critical");
	});

	test("empty findings array produces empty filtered result", () => {
		const filtered: Finding[] = [];
		expect(
			filtered.filter((f) => meetsThreshold(f.severity, "suggestion")),
		).toHaveLength(0);
	});
});

// ── Pipeline stage composition ───────────────────────────────────────────────
//
// Tests verifying that the pipeline stages compose correctly:
// filter → cluster → reconcile

describe("orchestration — pipeline stage composition", () => {
	test("filter → cluster → reconcile produces correct thread actions", () => {
		const allFindings = [
			makeFinding({
				severity: "warning",
				fingerprint: "fp1",
				filePath: "src/a.ts",
				title: "Issue A",
			}),
			makeFinding({
				severity: "nitpick",
				fingerprint: "fp2",
				filePath: "src/b.ts",
				title: "Issue B",
			}),
			makeFinding({
				severity: "warning",
				fingerprint: "fp3",
				filePath: "src/c.ts",
				title: "Issue C",
			}),
		];

		const files: ChangedFile[] = [
			{ path: "src/a.ts", changeType: 2, changeTrackingId: 1 },
			{ path: "src/b.ts", changeType: 2, changeTrackingId: 2 },
			{ path: "src/c.ts", changeType: 1, changeTrackingId: 3 },
		];

		// Step 1: Filter by threshold (warning)
		const filtered = allFindings.filter((f) =>
			meetsThreshold(f.severity, "warning"),
		);
		expect(filtered).toHaveLength(2);

		// Step 2: Cluster (disabled path)
		const clusters = filtered.map((f) => ({
			primary: f,
			members: [f],
			clusterFingerprint: f.fingerprint,
			isClustered: false,
		}));

		// Step 3: Extract findings for reconciliation
		const toReconcile = clusters.flatMap((c) =>
			c.isClustered ? [c.primary] : c.members,
		);

		// Step 4: Reconcile with no existing threads
		const { pendingThreads, threadsForReview } = reconcile(
			[],
			toReconcile,
			files,
		);

		expect(pendingThreads).toHaveLength(2);
		expect(threadsForReview).toHaveLength(0);
		expect(pendingThreads[0].finding.filePath).toBe("src/a.ts");
		expect(pendingThreads[1].finding.filePath).toBe("src/c.ts");
	});

	test("filter → cluster → reconcile with existing threads deduplicates", () => {
		const findings = [
			makeFinding({
				severity: "warning",
				fingerprint: "existing-fp",
				filePath: "src/a.ts",
			}),
			makeFinding({
				severity: "warning",
				fingerprint: "new-fp",
				filePath: "src/b.ts",
			}),
		];

		const files: ChangedFile[] = [
			{ path: "src/a.ts", changeType: 2, changeTrackingId: 1 },
			{ path: "src/b.ts", changeType: 2, changeTrackingId: 2 },
		];

		const existingThreads: BotThread[] = [
			{
				id: 100,
				filePath: "src/a.ts",
				fingerprint: "existing-fp",
				status: 1,
			},
		];

		const { pendingThreads, threadsForReview } = reconcile(
			existingThreads,
			findings,
			files,
		);

		// existing-fp is already posted → skip; new-fp is new → post
		expect(pendingThreads).toHaveLength(1);
		expect(pendingThreads[0].finding.fingerprint).toBe("new-fp");
		expect(threadsForReview).toHaveLength(0);
	});

	test("stale thread is resolved when its fingerprint no longer matches", () => {
		const findings = [
			makeFinding({
				severity: "warning",
				fingerprint: "updated-fp",
				filePath: "src/a.ts",
			}),
		];

		const files: ChangedFile[] = [
			{ path: "src/a.ts", changeType: 2, changeTrackingId: 1 },
		];

		const existingThreads: BotThread[] = [
			{
				id: 100,
				filePath: "src/a.ts",
				fingerprint: "old-fp",
				status: 1,
			},
		];

		const { pendingThreads, threadsForReview } = reconcile(
			existingThreads,
			findings,
			files,
		);

		expect(pendingThreads).toHaveLength(1);
		expect(threadsForReview).toHaveLength(1);
		expect(threadsForReview[0]).toBe(100);
	});
});

// ── Planning gate condition ──────────────────────────────────────────────────
//
// The orchestrator only triggers planning when:
//   config.planning === true && filesToReview.length > 5

describe("orchestration — planning gate", () => {
	function shouldPlan(planning: boolean, fileCount: number): boolean {
		return planning && fileCount > 5;
	}

	test("triggers when planning enabled and file count > 5", () => {
		expect(shouldPlan(true, 6)).toBe(true);
		expect(shouldPlan(true, 10)).toBe(true);
		expect(shouldPlan(true, 100)).toBe(true);
	});

	test("skips when file count is exactly 5 or below", () => {
		expect(shouldPlan(true, 5)).toBe(false);
		expect(shouldPlan(true, 4)).toBe(false);
		expect(shouldPlan(true, 1)).toBe(false);
		expect(shouldPlan(true, 0)).toBe(false);
	});

	test("skips when planning is disabled regardless of file count", () => {
		expect(shouldPlan(false, 6)).toBe(false);
		expect(shouldPlan(false, 100)).toBe(false);
		expect(shouldPlan(false, 0)).toBe(false);
	});
});
