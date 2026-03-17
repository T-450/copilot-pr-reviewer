import type { Finding, FindingCluster } from "./types.ts";

export function normalizeTitle(title: string): string {
	return title
		.toLowerCase()
		.replace(/`[^`]*`/g, "``")
		.replace(/\b\w+\.\w+\b/g, "X")
		.replace(/\bline \d+\b/g, "line N");
}

export function titleSimilarity(a: string, b: string): number {
	const wordsA = new Set(normalizeTitle(a).split(/\s+/));
	const wordsB = new Set(normalizeTitle(b).split(/\s+/));

	if (wordsA.size === 0 && wordsB.size === 0) return 1;

	let intersection = 0;
	for (const word of wordsA) {
		if (wordsB.has(word)) intersection++;
	}

	const union = new Set([...wordsA, ...wordsB]).size;
	return union === 0 ? 0 : intersection / union;
}

export function clusterFindings(
	findings: readonly Finding[],
	threshold: number,
): readonly FindingCluster[] {
	const groups: Finding[][] = [];
	const assigned = new Set<number>();

	for (let i = 0; i < findings.length; i++) {
		if (assigned.has(i)) continue;

		const group = [findings[i]];
		assigned.add(i);

		for (let j = i + 1; j < findings.length; j++) {
			if (assigned.has(j)) continue;

			const a = findings[i];
			const b = findings[j];

			if (
				a.category === b.category &&
				a.severity === b.severity &&
				titleSimilarity(a.title, b.title) >= 0.85
			) {
				group.push(b);
				assigned.add(j);
			}
		}

		groups.push(group);
	}

	return groups.map((members) => {
		const isClustered = members.length >= threshold;
		const sorted = [...members].sort((a, b) =>
			a.fingerprint.localeCompare(b.fingerprint),
		);
		const composite = new Bun.CryptoHasher("sha256");
		for (const m of sorted) {
			composite.update(m.fingerprint);
		}
		const clusterFingerprint = composite.digest("hex").slice(0, 16);

		return {
			primary: members[0],
			members,
			clusterFingerprint,
			isClustered,
		};
	});
}
