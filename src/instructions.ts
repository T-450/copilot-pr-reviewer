import { existsSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function splitInstructionDirs(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(delimiter)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

export function getBundledInstructionRoot(): string {
	return TOOL_ROOT;
}

export function configureBundledInstructionDirs(): string[] {
	const bundledRoot = getBundledInstructionRoot();
	const existing = splitInstructionDirs(
		process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS,
	);

	if (!existsSync(resolve(bundledRoot, ".github"))) {
		return existing;
	}

	const merged = [
		bundledRoot,
		...existing.filter((entry) => entry !== bundledRoot),
	];
	process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS = merged.join(delimiter);
	return merged;
}
