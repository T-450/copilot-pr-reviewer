import type {
SessionConfig,
CustomAgentConfig,
Tool,
} from "@github/copilot-sdk";
import { approveAll } from "@github/copilot-sdk";
import type { PRMetadata } from "./ado/client.ts";
import type { Config } from "./config.ts";
import { buildSystemPrompt } from "./review.ts";
import { createHooks } from "./hooks.ts";
import { buildSessionInstructionConfig } from "./instructions.ts";
import { reviewAgents } from "./prompts/index.ts";

export { EXCLUDED_TOOLS } from "./constants.ts";
import { EXCLUDED_TOOLS } from "./constants.ts";

const REPLY_SYSTEM_PROMPT =
"You are continuing an existing Azure DevOps PR review thread. Reply directly to the latest unresolved user follow-up, stay grounded in the original finding and any attached code, and acknowledge uncertainty instead of guessing. Return only the reply text.";

// ---------------------------------------------------------------------------
// Destructive tools excluded at the session level.
//
// This deny-list applies regardless of which agent (main or specialist) is
// active.  Specialist agents additionally restrict their tool scope via the
// `tools` property in CustomAgentConfig, but session-level exclusion is the
// safety backstop.
//
// The canonical list lives in constants.ts to avoid circular imports between
// session.ts and hooks.ts.
// ---------------------------------------------------------------------------

export interface SessionConfigInputs {
readonly repoId: string;
readonly prId: string;
readonly iteration: number;
readonly pr: PRMetadata;
readonly config: Config;
// biome-ignore lint/suspicious/noExplicitAny: SDK SessionConfig.tools is Tool<any>[]
readonly tools: Tool<any>[];
readonly agents?: readonly CustomAgentConfig[];
readonly model?: string;
readonly repoRoot?: string;
}

/**
 * Build the session configuration object for the Copilot SDK.
 *
 * This is a pure function — it returns the config data without creating a
 * session or touching the network.  The separation makes agent registration,
 * tool scoping, and hook wiring independently testable.
 */
export function buildSessionConfig(inputs: SessionConfigInputs): SessionConfig {
const { repoId, prId, iteration, pr, config, tools, model, repoRoot } =
inputs;

// Default to the verified agent configs unless the caller overrides.
// This makes the wiring explicit: reviewAgents is the single source of
// truth for specialist registration, and tests can inject alternatives.
const agents = inputs.agents ?? reviewAgents;

const instructionConfig = buildSessionInstructionConfig();
const workingDirectory = repoRoot ?? process.cwd();

return {
sessionId: `review-${repoId}-${prId}-${iteration}`,
model: model ?? process.env.COPILOT_MODEL ?? "gpt-4.1",
reasoningEffort: config.reasoningEffort,
streaming: true,
tools,
excludedTools: [...EXCLUDED_TOOLS],

infiniteSessions: {
backgroundCompactionThreshold: 0.85,
enabled: true,
bufferExhaustionThreshold: 0.7,
},

// -- Agent wiring -------------------------------------------------------
// Specialist agents are registered via `customAgents`.  Each agent has
// `infer: true`, which lets the SDK auto-dispatch to the agent whose
// description best matches the current conversation context (e.g. the
// security-reviewer activates when the model sees security-relevant code).
//
// This inference is opaque — we cannot force dispatch programmatically.
// The main reviewer handles files that don't trigger any specialist.
// See docs/decisions/Scoped-Agent-Migration-Strategy.md for the full
// rationale on why this is the chosen mechanism.
// -----------------------------------------------------------------------
customAgents: [...agents],

hooks: createHooks(),
systemMessage: {
content: buildSystemPrompt(pr, config),
mode: "append",
},
...instructionConfig,
onPermissionRequest: approveAll,
workingDirectory,
};
}

export function buildReplySessionConfig(
inputs: Omit<SessionConfigInputs, "tools" | "agents">,
): SessionConfig {
const baseConfig = buildSessionConfig({
...inputs,
tools: [],
agents: [],
});

return {
...baseConfig,
sessionId: `reply-${inputs.repoId}-${inputs.prId}-${inputs.iteration}`,
systemMessage: {
content: REPLY_SYSTEM_PROMPT,
mode: "append",
},
};
}

/**
 * Return the session-level excluded tools list.
 * Exposed for test assertions — the canonical deny-list lives here,
 * not duplicated in index.ts.
 */
export function getExcludedTools(): readonly string[] {
return EXCLUDED_TOOLS;
}

export function getReplySystemPrompt(): string {
return REPLY_SYSTEM_PROMPT;
}
