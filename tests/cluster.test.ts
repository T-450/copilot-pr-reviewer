import { describe, expect, test } from "bun:test";
import {
	normalizeTitle,
	titleSimilarity,
	clusterFindings,
} from "../src/cluster.ts";
import type { Finding } from "../src/types.ts";

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

describe("normalizeTitle", () => {
	test("lowercases", () => {
		expect(normalizeTitle("Possible NULL Dereference")).toBe(
			"possible null dereference",
		);
	});

	test("replaces inline code refs with placeholder", () => {
		expect(normalizeTitle("Variable `foo` may be null")).toBe(
			"variable `` may be null",
		);
	});

	test("replaces line refs", () => {
		expect(normalizeTitle("Error at line 42")).toBe("error at line N");
	});

	test("replaces Type.Member with X", () => {
		expect(normalizeTitle("Missing check for User.isAdmin")).toBe(
			"missing check for X",
		);
	});
});

describe("titleSimilarity", () => {
	test("identical titles → 1.0", () => {
		expect(titleSimilarity("foo bar baz", "foo bar baz")).toBe(1);
	});

	test("completely different titles → 0.0", () => {
		expect(titleSimilarity("alpha beta", "gamma delta")).toBe(0);
	});

	test("partial overlap", () => {
		const sim = titleSimilarity(
			"possible null check",
			"possible null dereference",
		);
		expect(sim).toBeGreaterThan(0.3);
		expect(sim).toBeLessThan(1);
	});
});

describe("clusterFindings", () => {
	test("5 similar findings → 1 cluster with 5 members", () => {
		const findings = Array.from({ length: 5 }, (_, i) =>
			makeFinding({
				filePath: `src/file${i}.ts`,
				fingerprint: `fp${i}`,
				title: "Possible null dereference",
				category: "correctness",
				severity: "warning",
			}),
		);

		const clusters = clusterFindings(findings, 3);

		const clustered = clusters.filter((c) => c.isClustered);
		expect(clustered).toHaveLength(1);
		expect(clustered[0].members).toHaveLength(5);
	});

	test("2 similar findings → 1 group below threshold, not clustered", () => {
		const findings = [
			makeFinding({ fingerprint: "fp1", filePath: "a.ts" }),
			makeFinding({ fingerprint: "fp2", filePath: "b.ts" }),
		];

		const clusters = clusterFindings(findings, 3);

		expect(clusters.filter((c) => c.isClustered)).toHaveLength(0);
		expect(clusters).toHaveLength(1);
		expect(clusters[0].members).toHaveLength(2);
	});

	test("different categories never cluster", () => {
		const findings = Array.from({ length: 5 }, (_, i) =>
			makeFinding({
				filePath: `src/file${i}.ts`,
				fingerprint: `fp${i}`,
				title: "Possible null dereference",
				category: i < 3 ? "correctness" : "security",
				severity: "warning",
			}),
		);

		const clusters = clusterFindings(findings, 3);
		const clustered = clusters.filter((c) => c.isClustered);

		// Only the 3 correctness findings can cluster
		expect(clustered).toHaveLength(1);
		expect(clustered[0].members).toHaveLength(3);
	});

	test("composite fingerprint is deterministic", () => {
		const findings = Array.from({ length: 3 }, (_, i) =>
			makeFinding({
				filePath: `src/file${i}.ts`,
				fingerprint: `fp${i}`,
			}),
		);

		const clusters1 = clusterFindings(findings, 3);
		const clusters2 = clusterFindings([...findings].reverse(), 3);

		const clustered1 = clusters1.find((c) => c.isClustered);
		const clustered2 = clusters2.find((c) => c.isClustered);

		expect(clustered1?.clusterFingerprint).toBe(
			clustered2?.clusterFingerprint ?? "",
		);
	});
});
