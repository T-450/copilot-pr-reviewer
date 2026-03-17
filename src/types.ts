export type Severity = "critical" | "warning" | "suggestion" | "nitpick";
export type Category =
	| "correctness"
	| "security"
	| "reliability"
	| "maintainability"
	| "testing";
export type Confidence = "high" | "medium" | "low";

export type Finding = {
	readonly filePath: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly severity: Severity;
	readonly category: Category;
	readonly title: string;
	readonly message: string;
	readonly suggestion?: string;
	readonly confidence: Confidence;
	readonly fingerprint: string;
};

export type FindingCluster = {
	readonly primary: Finding;
	readonly members: readonly Finding[];
	readonly clusterFingerprint: string;
	readonly isClustered: boolean;
};

export const CHANGE_TYPE_LABELS: Readonly<Record<number, string>> = {
	1: "add",
	2: "edit",
	3: "delete",
	4: "rename",
};
