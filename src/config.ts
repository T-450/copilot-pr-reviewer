import { z } from "zod";
import { parse as parseYaml } from "yaml";

const Severity = z.enum(["critical", "warning", "suggestion", "nitpick"]);
type Severity = z.infer<typeof Severity>;

const SEVERITY_ORDER: Record<Severity, number> = {
	critical: 0,
	warning: 1,
	suggestion: 2,
	nitpick: 3,
};

const ConfigSchema = z
	.object({
		ignore: z.array(z.string()).default([]),
		severityThreshold: Severity.default("suggestion"),
		maxFiles: z.number().int().positive().default(30),
		planning: z.boolean().default(true),
		clustering: z.boolean().default(true),
		clusterThreshold: z.number().int().min(2).default(3),
	})
	.passthrough();

export type Config = z.infer<typeof ConfigSchema>;

export async function loadConfig(path: string): Promise<Config> {
	const defaults = ConfigSchema.parse({});

	let raw: string;
	try {
		raw = await Bun.file(path).text();
	} catch {
		return defaults;
	}

	let parsed: unknown;
	try {
		parsed = parseYaml(raw);
	} catch {
		console.warn(
			`##vso[task.logissue type=warning]Malformed YAML in ${path}, using defaults`,
		);
		return defaults;
	}

	if (parsed == null || typeof parsed !== "object") {
		return defaults;
	}

	const result = ConfigSchema.safeParse(parsed);
	if (!result.success) {
		console.warn(
			`##vso[task.logissue type=warning]Invalid config in ${path}, using defaults`,
		);
		return defaults;
	}

	const knownKeys = new Set(Object.keys(ConfigSchema.shape));
	for (const key of Object.keys(parsed as Record<string, unknown>)) {
		if (!knownKeys.has(key)) {
			console.warn(
				`##vso[task.logissue type=warning]Unknown config key: ${key}`,
			);
		}
	}

	return result.data;
}

export const meetsThreshold = (
	severity: Severity,
	threshold: Severity,
): boolean => {
	return SEVERITY_ORDER[severity] <= SEVERITY_ORDER[threshold];
};
