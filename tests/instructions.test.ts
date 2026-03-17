import { afterEach, describe, expect, test } from "bun:test";
import { delimiter } from "node:path";
import {
	configureBundledInstructionDirs,
	getBundledInstructionRoot,
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
