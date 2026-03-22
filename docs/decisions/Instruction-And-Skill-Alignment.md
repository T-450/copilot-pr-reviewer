---
type: analysis
title: Instruction and Skill Alignment Decision
created: 2026-03-22
tags:
  - architecture
  - copilot-sdk
  - instructions
  - skills
  - phase-02
related:
  - "[[Prompt-And-Instruction-Composition-Map]]"
  - "[[Copilot-SDK-0.2.0-Verified-Capabilities]]"
  - "[[Copilot-SDK-0.2.0-Migration-Decisions]]"
---

# Instruction and Skill Alignment Decision

Documents which review behaviors remain in prompt templates, which could move to SDK-managed skills or workflows, and why each decision was made.

## SDK Surface Summary

The Copilot SDK 0.2.0 `SessionConfig` exposes three distinct extension mechanisms:

| Mechanism | SessionConfig Property | How It Works |
|-----------|----------------------|--------------|
| **Instructions** | _(none — env var only)_ | SDK discovers `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md` from directories listed in `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` |
| **Skills** | `skillDirectories: string[]` | SDK loads skill definitions from specified directories at session creation |
| **Custom Agents** | `customAgents: CustomAgentConfig[]` | Inline agent definitions with prompt, tools, and optional MCP servers |

Additionally, `disabledSkills: string[]` allows selectively disabling loaded skills.

## Decision: Instructions Stay Env-Var-Based

**Status:** Keep `configureBundledInstructionDirs()` as-is.

**Rationale:** The SDK does not expose an `instructionDirs` or equivalent property in `SessionConfig`. The `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` environment variable is the **only** mechanism for instruction discovery. There is no alternative API surface to migrate to.

**What this covers:**
- `.github/copilot-instructions.md` — session-level review philosophy (focus areas, reporting rules, tool usage)
- `.github/instructions/auth.instructions.md` — file-scoped auth scrutiny (`applyTo: "**/*auth*.*"`)
- `.github/instructions/secrets.instructions.md` — file-scoped secrets scrutiny (`applyTo: "**/*secret*.*"`)

These are static, repo-scoped assets that the SDK handles automatically once the env var is configured. No code change needed.

## Decision: Skills Are Not Used

**Status:** `skillDirectories` is set to `[]` explicitly in session config.

**Rationale:** SDK skills are designed for interactive, user-invokable workflows (e.g., "use the refactoring skill"). The PR review pipeline is a fully automated, non-interactive process where:

1. **No user invocation** — The reviewer runs as a pipeline task. There is no interactive user to invoke skills.
2. **Review logic is prompt-driven** — The system prompt, planning prompt, and per-file prompts define the review contract. These are dynamic (interpolate PR metadata, config thresholds) and cannot be expressed as static skill definitions.
3. **Sub-agents cover specialization** — Security and test review specialization is handled by `customAgents`, which are a better fit because they scope both the prompt and the allowed tool set per specialist.

Setting `skillDirectories: []` explicitly in `buildSessionInstructionConfig()` documents this decision in code rather than leaving it as an implicit default.

## Decision: Sub-Agent Prompts Stay as customAgents

**Status:** Keep `securityAgentConfig` and `testAgentConfig` in `src/prompts/agents.ts`, passed via `customAgents`.

**Rationale:** `customAgents` is the correct SDK mechanism for these because:

1. **Tool scoping** — Each agent restricts its tool set to `["emit_finding", "read_file", "list_files"]`. This cannot be expressed in a skill definition.
2. **Prompt isolation** — Each agent has a focused prompt (OWASP checklist for security, coverage patterns for testing) that should not leak into the main session context.
3. **Inference control** — The `infer` property (defaults to `true`) controls whether the SDK can automatically dispatch to these agents. This is a runtime behavior not available in skills.

## Decision: Session-Start Hook Context Is Retained (For Now)

**Status:** Keep `createSessionStartHook()` returning `"This is an automated code review session. Focus on actionable findings only."`.

**Rationale:** The Prompt Composition Map flagged this as partially redundant with `.github/copilot-instructions.md` ("Prefer actionable findings"). However:

1. The hook fires at session start, reinforcing the automated context before any review prompts arrive.
2. Removing it is a low-risk cleanup but not part of the instruction/skill alignment scope.
3. Future phases can consolidate this if the redundancy causes confusion.

## Behavior Location Summary

| Review Behavior | Location | Mechanism | Why Here |
|----------------|----------|-----------|----------|
| Review philosophy & reporting rules | `.github/copilot-instructions.md` | SDK instruction discovery | Static, repo-scoped, SDK-native |
| Auth file scrutiny | `.github/instructions/auth.instructions.md` | SDK instruction discovery (glob-scoped) | Static, file-scoped, SDK-native |
| Secrets file scrutiny | `.github/instructions/secrets.instructions.md` | SDK instruction discovery (glob-scoped) | Static, file-scoped, SDK-native |
| PR context & review contract | `src/prompts/templates.ts` → `renderSystemPrompt()` | `systemMessage` session option | Dynamic — interpolates PR metadata + config |
| Review planning | `src/prompts/templates.ts` → `renderPlanningPrompt()` | `session.sendAndWait()` prompt | Dynamic — interpolates file list |
| Per-file review instruction | `src/review.ts` → `buildFileReviewRequest()` | `session.sendAndWait()` prompt + `type: "file"` attachment | Dynamic — prompt has path + change type; attachment has file content |
| Security specialist | `src/prompts/agents.ts` → `securityAgentConfig` | `customAgents` session option | Tool-scoped, prompt-isolated |
| Test specialist | `src/prompts/agents.ts` → `testAgentConfig` | `customAgents` session option | Tool-scoped, prompt-isolated |
| Test companion hints | `src/hooks.ts` → `createPostToolUseHook()` | `onPostToolUse` hook | Runtime-contextual, depends on tool args |
| Automated session framing | `src/hooks.ts` → `createSessionStartHook()` | `onSessionStart` hook | Reinforces automated context at session start |

## Decision: Attachment-First File Review Inputs

**Status:** All executable paths use `buildFileReviewRequest()` from `src/review.ts`.

**Rationale:** The SDK `MessageOptions.attachments` array accepts `{ type: "file", path }` entries that the SDK tokenises and manages within the context window natively. Embedding file content directly in prompt text wastes prompt tokens, bypasses SDK context management, and creates a maintenance divergence between production and test paths.

**Policy:**

1. **File content → attachment.** Every per-file review request uses `buildFileReviewRequest()`, which pairs a contextual prompt (path, change type, review instructions) with a `type: "file"` attachment. No path should read file content and inject it into prompt text.
2. **Metadata → prompt.** File paths, change-type labels, PR title/description, and review instructions remain prompt-injected because they are structural metadata the model needs before seeing the file content.
3. **Planning prompt is metadata-only.** `renderPlanningPrompt()` includes file paths and change labels but never file contents — files are not attached during planning because the model is only producing a review order, not reviewing code.

**What changed:**

- `src/review.ts` — added `buildFileReviewRequest()` returning `MessageOptions` with prompt + attachment.
- `src/index.ts` — refactored per-file loop to use `buildFileReviewRequest()`.
- `src/prototype.ts` — same refactor.
- `tests/e2e-orchestrator.test.ts` — **converted from inline content injection** (reading files via `Bun.file()` and embedding in code fences) to `buildFileReviewRequest()` with native attachments.
- `tests/sdk-integration.test.ts` — already used attachments, no change needed.

## When to Revisit

- If the SDK adds an `instructionDirs` property to `SessionConfig`, migrate `configureBundledInstructionDirs()` to use it.
- If the reviewer gains interactive modes (e.g., a developer asks for a deeper review on specific files), skills may become appropriate.
- If sub-agent prompts grow complex enough to warrant file-based management, consider skill directories.
- If the SDK adds diff-aware attachment types (e.g., `type: "diff"`), consider using them for the per-file review to give the model change hunks rather than whole files.
