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

// ---------------------------------------------------------------------------
// Env-var instruction loading — the only mechanism the SDK exposes for
// instruction discovery (no `instructionDirs` exists in SessionConfig).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Explicit SDK session options for skills and instruction-adjacent config.
//
// The SDK SessionConfig exposes `skillDirectories` and `disabledSkills` as
// first-class options.  We configure them explicitly here so the session
// creation call in index.ts documents the deliberate decision rather than
// relying on implicit defaults.
//
// Current policy (see docs/decisions/Instruction-And-Skill-Alignment.md):
//   • Review behavior lives in prompt templates + customAgents, NOT skills.
//   • skillDirectories is empty — no skill directories are loaded.
//   • disabledSkills is empty — nothing to disable when none are loaded.
// ---------------------------------------------------------------------------

export interface SessionInstructionConfig {
	skillDirectories: string[];
	disabledSkills: string[];
}

export function buildSessionInstructionConfig(): SessionInstructionConfig {
	return {
		skillDirectories: [],
		disabledSkills: [],
	};
}
