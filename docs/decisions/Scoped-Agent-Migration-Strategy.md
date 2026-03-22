---
type: analysis
title: Scoped Agent Migration Strategy
created: 2026-03-22
tags:
  - architecture
  - copilot-sdk
  - agents
  - phase-03
related:
  - "[[Copilot-SDK-DefineAgent-Verification]]"
  - "[[Copilot-SDK-0.2.0-Verified-Capabilities]]"
  - "[[Instruction-And-Skill-Alignment]]"
  - "[[Prompt-And-Instruction-Composition-Map]]"
---

# Scoped Agent Migration Strategy

Decides how the PR reviewer's specialist sub-agents (`security-reviewer`, `test-reviewer`) should be defined and wired in SDK 0.2.0, given that no `defineAgent()` helper exists.

## Context

Phase 01 research confirmed that `@github/copilot-sdk` 0.2.0 does not export a `defineAgent()` factory. The codebase currently uses plain `CustomAgentConfig` objects in `src/prompts/agents.ts`, passed via `customAgents` in `SessionConfig`. This decision record evaluates three replacement strategies and selects the best path forward.

## Options Evaluated

### Option A: Stay on `customAgents` with cleaner configuration

**Mechanism:** Keep `CustomAgentConfig` objects. Improve by:
- Keeping agent configs in the dedicated `src/prompts/agents.ts` module (already done in Phase 02)
- Using all available `CustomAgentConfig` properties (`displayName`, `description`, `infer`) for clarity
- Relying on the SDK's built-in agent inference (`infer: true` default) for automatic dispatch

**Pros:**
- Zero breaking changes — configs already work and are tested (209 tests passing)
- `customAgents` is the only verified, published mechanism for inline agent definitions
- Tool scoping (`tools: ["emit_finding", "read_file", "list_files"]`) works as-is
- Prompt isolation is automatic — each agent's `prompt` replaces the main system prompt during dispatch
- The `infer` property enables the SDK to auto-select agents based on context, which is desirable for file-type-driven specialist dispatch

**Cons:**
- No `defineAgent()` ergonomics (must construct plain objects manually)
- No type-checked prompt composition (prompts are opaque strings)

**Risk:** Low. This is the current working state.

### Option B: Use `SessionConfig.agent` for session-level agent selection

**Mechanism:** Pre-select one custom agent at session creation via `agent: "security-reviewer"`.

**How it works (verified from SDK types):**
```typescript
SessionConfig.agent?: string;
// "Name of the custom agent to activate when the session starts.
//  Must match the `name` of one of the agents in `customAgents`.
//  Equivalent to calling `session.rpc.agent.select({ name })` after creation."
```

**Pros:**
- Enables a "default specialist" pattern where one agent is pre-activated

**Cons:**
- Selects only **one** agent at session start — cannot run both security and test agents
- Would require separate sessions per specialist, breaking the current single-session review flow
- Does not replace `customAgents` — agents must still be defined there first
- The current flow benefits from SDK auto-inference dispatching to the right agent per file, not static pre-selection

**Risk:** High. Fundamentally incompatible with multi-specialist review in a single session.

### Option C: Extension-based agent specialization via `joinSession()`

**Mechanism:** Define each specialist as a separate `.mjs` extension file under `.github/extensions/`, using `@github/copilot-sdk/extension`.

**How it works (verified from SDK docs):**
- Each extension runs as a separate Node.js child process
- Extensions call `joinSession({ tools, hooks })` to attach to the CLI session
- Extensions can register tools and hooks, but **not agent configs**

**Pros:**
- Full process isolation per specialist
- Supports extension-specific MCP servers

**Cons:**
- Extensions are designed for the Copilot CLI interactive mode, not for programmatic `CopilotClient.createSession()` pipelines
- Extensions cannot register `CustomAgentConfig` — they register tools and hooks, not agents
- Would require rewriting specialists as tool-based behaviors rather than prompt-scoped agents
- Loses tool scoping per specialist (extensions share the session's tool set)
- Loses prompt isolation (extensions don't set a system prompt; they inject context via hooks)
- `.mjs`-only constraint conflicts with this repo's TypeScript-first toolchain
- Process overhead: two additional Node.js processes for a CI pipeline task is wasteful

**Risk:** Very high. Wrong abstraction level — extensions are for CLI augmentation, not pipeline sub-agents.

## Selected Strategy

**Option A: Stay on `customAgents` with cleaner configuration.**

### Rationale

1. `customAgents` is the **only** verified SDK mechanism that provides both prompt isolation and tool scoping per specialist — the two properties that define this repo's sub-agent model.
2. The `defineAgent()` assumption was a forward-looking guess. The SDK explicitly chose `CustomAgentConfig` as a data-only interface, consistent with its pattern where `defineTool()` wraps tools (which need handler functions) but agents (which are prompt+config only) don't need a factory.
3. Option B (`agent` property) is additive and could be used in future for a "default reviewer mode" pattern, but it doesn't replace `customAgents`.
4. Option C (extensions) is architecturally inappropriate for a CI pipeline.

### Limits

- If the SDK later adds `defineAgent()`, we should migrate to it for consistency with `defineTool()`.
- `customAgents` does not support per-agent hooks or per-agent MCP server lifecycle management. If specialists need custom hooks, those must be handled in the shared session hooks with agent-name dispatch.
- The `infer` mechanism is opaque — the SDK decides when to dispatch to an agent. We cannot programmatically force agent dispatch for a specific file. If deterministic dispatch is needed, we would need to create separate sessions per specialist.

### How It Preserves Current Behavior

| Behavior | Mechanism | Status |
|----------|-----------|--------|
| Security specialist activation for HIGH_RISK files | `customAgents` + SDK inference | Preserved — `securityAgentConfig.infer` defaults to `true` |
| Test specialist activation for test files | `customAgents` + SDK inference | Preserved — `testAgentConfig.infer` defaults to `true` |
| Tool scoping to `emit_finding`, `read_file`, `list_files` | `CustomAgentConfig.tools` | Preserved — explicit tool array per agent |
| Prompt isolation (OWASP checklist / coverage patterns) | `CustomAgentConfig.prompt` | Preserved — each agent's prompt replaces system prompt during dispatch |
| Main reviewer operates when no specialist matches | Default session behavior | Preserved — SDK falls back to main session when no agent infers |
| Destructive tool exclusion | `excludedTools` on session | Preserved — applies regardless of agent |

## Implementation Plan

The selected strategy requires minimal code changes since `customAgents` is already the mechanism in use. Phase 03 implementation should:

1. Verify all `CustomAgentConfig` properties are set explicitly (add `displayName`, ensure `description` is accurate)
2. Confirm `infer` defaults are correct (security should infer for security-relevant files, test should infer for test files)
3. Move agent configs to a clean, self-documenting module structure (already at `src/prompts/agents.ts`)
4. Add focused tests for agent registration, tool scoping, and fallback behavior
5. Document the `infer` mechanism behavior in code comments where non-obvious

## Sources

- SDK types: `node_modules/@github/copilot-sdk/dist/types.d.ts` lines 585-619 (`CustomAgentConfig`), lines 727-733 (`customAgents`, `agent`)
- SDK docs: `Auto Run Docs/Working/copilot-sdk-0.2.0/package/docs/agent-author.md`, `extensions.md`
- Prior research: `docs/research/copilot-sdk/Copilot-SDK-DefineAgent-Verification.md`
- Prior decision: `docs/decisions/Instruction-And-Skill-Alignment.md`
