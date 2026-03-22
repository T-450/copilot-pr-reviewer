import { afterEach, describe, expect, test } from "bun:test";
import { delimiter } from "node:path";
import {
	configureBundledInstructionDirs,
	getBundledInstructionRoot,
	buildSessionInstructionConfig,
	type SessionInstructionConfig,
} from "../src/instructions.ts";

const ORIGINAL_DIRS = process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS;

afterEach(() => {
	if (ORIGINAL_DIRS === undefined) {
		delete process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS;
		return;
	}

	process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS = ORIGINAL_DIRS;
});

describe("configureBundledInstructionDirs", () => {
	test("prepends bundled instruction root", () => {
		process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS = [
			"/tmp/custom-one",
			"/tmp/custom-two",
		].join(delimiter);

		const dirs = configureBundledInstructionDirs();

		expect(dirs[0]).toBe(getBundledInstructionRoot());
		expect(dirs).toContain("/tmp/custom-one");
		expect(dirs).toContain("/tmp/custom-two");
	});

	test("does not duplicate bundled instruction root", () => {
		process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS = [
			getBundledInstructionRoot(),
			"/tmp/custom-one",
		].join(delimiter);

		const dirs = configureBundledInstructionDirs();

		expect(
			dirs.filter((entry) => entry === getBundledInstructionRoot()),
		).toHaveLength(1);
	});
});

describe("buildSessionInstructionConfig", () => {
	test("returns skillDirectories as empty array", () => {
		const config = buildSessionInstructionConfig();
		expect(config.skillDirectories).toEqual([]);
	});

	test("returns disabledSkills as empty array", () => {
		const config = buildSessionInstructionConfig();
		expect(config.disabledSkills).toEqual([]);
	});

	test("returns only the expected keys", () => {
		const config = buildSessionInstructionConfig();
		const keys = Object.keys(config).sort();
		expect(keys).toEqual(["disabledSkills", "skillDirectories"]);
	});

	test("config is spreadable into session options", () => {
		const config = buildSessionInstructionConfig();
		const sessionOpts = {
			model: "gpt-4.1",
			...config,
		};
		expect(sessionOpts.skillDirectories).toEqual([]);
		expect(sessionOpts.disabledSkills).toEqual([]);
		expect(sessionOpts.model).toBe("gpt-4.1");
	});

	test("satisfies SessionInstructionConfig type shape", () => {
		const config: SessionInstructionConfig = buildSessionInstructionConfig();
		expect(Array.isArray(config.skillDirectories)).toBe(true);
		expect(Array.isArray(config.disabledSkills)).toBe(true);
	});

	test("multiple calls return independent objects", () => {
		const config1 = buildSessionInstructionConfig();
		const config2 = buildSessionInstructionConfig();
		expect(config1).toEqual(config2);
		expect(config1).not.toBe(config2);
	});

	test("returned arrays are mutable without affecting future calls", () => {
		const config1 = buildSessionInstructionConfig();
		config1.skillDirectories.push("/tmp/test-skill");
		config1.disabledSkills.push("some-skill");

		const config2 = buildSessionInstructionConfig();
		expect(config2.skillDirectories).toEqual([]);
		expect(config2.disabledSkills).toEqual([]);
	});
});

describe("configureBundledInstructionDirs — regression", () => {
	test("sets COPILOT_CUSTOM_INSTRUCTIONS_DIRS env var", () => {
		delete process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS;
		configureBundledInstructionDirs();

		expect(process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS).toBeDefined();
	});

	test("bundled root appears first even when env var has existing entries", () => {
		process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS = [
			"/first",
			"/second",
		].join(delimiter);

		const dirs = configureBundledInstructionDirs();
		const bundled = getBundledInstructionRoot();

		expect(dirs[0]).toBe(bundled);
	});

	test("preserves order of existing non-bundled entries", () => {
		process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS = [
			"/alpha",
			"/beta",
			"/gamma",
		].join(delimiter);

		const dirs = configureBundledInstructionDirs();

		const withoutBundled = dirs.filter(
			(d) => d !== getBundledInstructionRoot(),
		);
		expect(withoutBundled).toEqual(["/alpha", "/beta", "/gamma"]);
	});

	test("works when env var is initially unset", () => {
		delete process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS;
		const dirs = configureBundledInstructionDirs();

		expect(dirs).toContain(getBundledInstructionRoot());
	});
});
