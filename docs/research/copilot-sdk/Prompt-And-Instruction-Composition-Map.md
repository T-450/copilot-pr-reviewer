---
type: research
title: Prompt and Instruction Composition Map
created: 2026-03-22
tags:
  - prompts
  - instructions
  - copilot-sdk
  - refactoring-baseline
related:
  - "[[Copilot-SDK-0.2.0-Verified-Capabilities]]"
  - "[[Copilot-SDK-0.2.0-Migration-Decisions]]"
  - "[[Copilot-SDK-Upgrade-Summary]]"
---

# Prompt and Instruction Composition Map

Documents every prompt source, interpolation point, and execution order in the current review pipeline. This map serves as the baseline for Phase 02 refactoring — separating prompt templates, aligning instruction loading with verified SDK support, and removing ad-hoc prompt construction.

## 1. Prompt Sources Overview

The review pipeline injects text into the model context through **seven distinct channels**, listed here in the order they take effect during a session.

| # | Source | File(s) | Injection Point | Static / Dynamic |
|---|--------|---------|-----------------|-------------------|
| 1 | **SDK copilot-instructions** | `.github/copilot-instructions.md` | Auto-discovered by SDK via `cwd` | Static per repo |
| 2 | **SDK focus instructions** | `.github/instructions/auth.instructions.md`, `.github/instructions/secrets.instructions.md` | Auto-discovered via `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` env var | Static per repo, file-glob scoped |
| 3 | **System message** | `src/review.ts → buildSystemPrompt()` | `createSession({ systemMessage })` | Dynamic — interpolates PR metadata + config |
| 4 | **Session-start hook context** | `src/hooks.ts → createSessionStartHook()` | `hooks.onSessionStart` returns `additionalContext` | Static string |
| 5 | **Planning prompt** | `src/review.ts → buildPlanningPrompt()` | `session.sendAndWait({ prompt })` — conditional | Dynamic — interpolates PR + file list |
| 6 | **Per-file review prompt** | `src/review.ts → buildFilePrompt()` | `session.sendAndWait({ prompt, attachments })` | Dynamic — interpolates file path + change type |
| 7 | **Sub-agent prompts** | `src/index.ts` (inline `securityAgentConfig`, `testAgentConfig`) | `createSession({ customAgents })` | Static strings in code |

### Additional contextual injections (non-prompt)

| Source | File | Mechanism | Purpose |
|--------|------|-----------|---------|
| Post-tool-use hint | `src/hooks.ts → createPostToolUseHook()` | `onPostToolUse` returns `additionalContext` | Test companion file hint after `read_file` |
| Error notification | `src/hooks.ts → createErrorOccurredHook()` | `onErrorOccurred` returns `userNotification` | Error context for skip/abort decisions |

---

## 2. Execution Order

```
┌─ Session Creation ────────────────────────────────────────────┐
│                                                               │
│  1. configureBundledInstructionDirs()                         │
│     └─ Prepends tool root to COPILOT_CUSTOM_INSTRUCTIONS_DIRS │
│        └─ SDK discovers .github/copilot-instructions.md       │
│        └─ SDK discovers .github/instructions/*.instructions.md│
│                                                               │
│  2. client.createSession({                                    │
│       systemMessage: buildSystemPrompt(pr, config),           │
│       customAgents: [securityAgentConfig, testAgentConfig],   │
│       hooks: createHooks(),                                   │
│       tools: [emitFinding],                                   │
│       excludedTools: [...],                                   │
│     })                                                        │
│     └─ onSessionStart fires → returns additionalContext       │
│                                                               │
└───────────────────────────────────────────────────────────────┘

┌─ Planning Phase (conditional: config.planning && files > 5) ──┐
│                                                               │
│  3. session.sendAndWait({ prompt: buildPlanningPrompt() })    │
│     └─ No attachments — text-only request                     │
│                                                               │
└───────────────────────────────────────────────────────────────┘

┌─ Per-File Review Loop ────────────────────────────────────────┐
│                                                               │
│  4. For each file:                                            │
│     session.sendAndWait({                                     │
│       prompt: buildFilePrompt(path, changeLabel),             │
│       attachments: [{ type: "file", path: absolutePath }],    │
│     })                                                        │
│     └─ Model may call read_file → onPostToolUse fires         │
│        └─ Returns test companion hint via additionalContext   │
│     └─ Model calls emit_finding → findings collected          │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Prompt Source Analysis

### 3.1 SDK-Discovered Instructions (Belong as Reusable Assets)

**File:** `.github/copilot-instructions.md`
- **Content:** Broad review focus (correctness, security, reliability, maintainability, testing), reporting rules (no style-only, cite symbols), tool usage (one `emit_finding` per issue).
- **Scope:** Applies to the entire session via SDK auto-discovery.
- **Interpolation:** None — fully static.
- **Classification:** ✅ **Stays as reusable asset.** This is the right place for repo-level review philosophy. The SDK handles discovery.

**File:** `.github/instructions/auth.instructions.md`
- **Content:** Auth-specific scrutiny (authz bypasses, token handling, trust boundaries).
- **Scope:** Glob-scoped to `**/*auth*.*` via YAML front matter `applyTo`.
- **Interpolation:** None — static.
- **Classification:** ✅ **Stays as reusable asset.** File-scoped instructions are an SDK feature designed for exactly this.

**File:** `.github/instructions/secrets.instructions.md`
- **Content:** Secret-handling scrutiny (hardcoded keys, logging/persistence of secrets).
- **Scope:** Glob-scoped to `**/*secret*.*` via YAML front matter `applyTo`.
- **Interpolation:** None — static.
- **Classification:** ✅ **Stays as reusable asset.**

### 3.2 System Message (Belongs in Code — Template Candidate)

**Function:** `buildSystemPrompt(pr: PRMetadata, config: Config)` in `src/review.ts:77-104`

**Template structure:**
```
"You are reviewing a pull request and must report issues with the emit_finding tool."
""
"## PR Context"
"**Title:** ${pr.title}"
"**Description:** ${pr.description}"         ← conditional
"**Work Items:** #${pr.workItemIds.join()}"   ← conditional
""
"## Review Contract"
"- Only report findings at severity `${config.severityThreshold}` or above"
"- Each finding MUST include: filePath, startLine, endLine, severity, category, title, message, confidence"
"- Use categories: correctness, security, reliability, maintainability, testing"
```

**Interpolation points:**
- `pr.title` — always present
- `pr.description` — conditional (only if truthy)
- `pr.workItemIds` — conditional (only if array length > 0)
- `config.severityThreshold` — from `.prreviewer.yml` or default `"suggestion"`

**Passed via:** `createSession({ systemMessage: { content: ..., mode: "append" } })`

**Classification:** 🔶 **Template candidate.** The static frame ("You are reviewing…", "## Review Contract") should be a named template. The dynamic PR context interpolation stays in code. The `mode: "append"` means this is appended after SDK-managed system instructions.

### 3.3 Session-Start Hook Context (Belongs in Code — Redundant)

**Function:** `createSessionStartHook()` in `src/hooks.ts:213-223`

**Content (static):** `"This is an automated code review session. Focus on actionable findings only."`

**Classification:** 🔶 **Redundant with copilot-instructions.md.** The `.github/copilot-instructions.md` already says "Prefer actionable findings that would matter to the PR author." This hook context adds marginal value and could be consolidated.

### 3.4 Planning Prompt (Belongs in Code — Template Candidate)

**Function:** `buildPlanningPrompt(pr: PRMetadata, files: readonly ChangedFile[])` in `src/review.ts:115-144`

**Template structure:**
```
"You are planning a code review for PR: \"${pr.title}\""
""
"Description: ${pr.description}"         ← conditional (filtered by .filter(Boolean))
""
"## Changed Files"
"- ${file.path} (${changeLabel})"        ← per file, dynamic
""
"## Task"
"Analyze the file list and PR description. Identify:"
"1. Which files are most likely to contain bugs or security issues"
"2. Which files should be reviewed together (shared dependencies)"
"3. Suggested review order (highest risk first)"
""
"Respond with a brief review plan. Do NOT review the files yet."
```

**Interpolation points:**
- `pr.title` — always present
- `pr.description` — conditional
- File list with change type labels (maps numeric `changeType` via `CHANGE_TYPE_LABELS`)

**Triggered when:** `config.planning === true && filesToReview.length > 5`

**Classification:** 🔶 **Template candidate.** The static frame (task definition, numbered list) should be a named template. Dynamic parts (PR metadata, file list) remain as interpolation.

### 3.5 Per-File Review Prompt (Belongs in Code — Template Candidate)

**Function:** `buildFilePrompt(filePath: string, changeType: string)` in `src/review.ts:106-113`

**Template structure:**
```
"Review the following file. Change type: ${changeType}."
"File: ${filePath}"
""
"Call `emit_finding` for each issue found. If the file is clean, respond with a brief confirmation and do not call `emit_finding`."
```

**Interpolation points:**
- `filePath` — always present
- `changeType` — resolved from `CHANGE_TYPE_LABELS` (`add`, `edit`, `delete`, `rename`, `unknown`)

**Used with:** File attachment via `sendAndWait({ prompt, attachments: [{ type: "file", path }] })`

**Classification:** 🔶 **Template candidate.** This is the simplest prompt and a clear extraction target. The file content is provided via SDK attachment (not prompt-injected), which is the correct pattern.

### 3.6 Sub-Agent Prompts (Belong in Code or Skill Assets)

**Security reviewer:** `src/index.ts:32-47`
```
"You are a security specialist. Review code for:
- Authentication/authorization bypasses
- Injection vulnerabilities (SQL, XSS, command injection)
- Sensitive data exposure (secrets, PII, tokens)
- Insecure cryptographic practices
- SSRF, path traversal, and other OWASP Top 10 issues

Use emit_finding for each issue. Set category to 'security' and severity to 'critical' or 'warning'."
```

**Test reviewer:** `src/index.ts:49-62`
```
"You are a testing specialist. Review code for:
- Missing test coverage for new/changed code
- Untested edge cases and error paths
- Flaky test patterns (timing, network, random)
- Test-implementation coupling (testing internals vs behavior)

Use emit_finding for each issue. Set category to 'testing'."
```

Both define `tools: ["emit_finding", "read_file", "list_files"]`.

**Classification:** 🔶 **Skill/workflow asset candidates.** These are fully static and domain-scoped. They could become SDK-managed skill directories if `skillDirectories` proves useful, or remain as named template modules for clarity.

### 3.7 Post-Tool-Use Hint (Belongs in Code)

**Function:** `createPostToolUseHook()` in `src/hooks.ts:141-162`

**Content (dynamic):** `"💡 Check if a test companion exists at ${baseName}.test${ext} — if so, verify test coverage for changes in this file."`

**Triggered when:** `read_file` is called on a file with a recognized source extension.

**Classification:** ✅ **Stays in code.** This is contextual runtime behavior that depends on tool arguments — not a template.

---

## 4. Prompt-Injected vs Attachment-Based File Content

### Current state (post-Phase 01)

| Path | Method | Status |
|------|--------|--------|
| `src/index.ts` main review loop | File attachment (`sendAndWait({ attachments })`) | ✅ Correct |
| `tests/e2e-orchestrator.test.ts` review loop | **Prompt-injected** (builds markdown code fence with file content) | ⚠️ Should be attachment |
| `tests/sdk-integration.test.ts` | File attachment | ✅ Correct |

The E2E test at `tests/e2e-orchestrator.test.ts:146-158` constructs prompts by reading file content and embedding it in a code fence within the prompt string. This is the **only remaining executable path** that injects file content into prompts instead of using SDK attachments.

---

## 5. Classification Summary

### Stays in reusable assets (no change needed)
- `.github/copilot-instructions.md` — repo-level review philosophy
- `.github/instructions/auth.instructions.md` — file-scoped auth focus
- `.github/instructions/secrets.instructions.md` — file-scoped secrets focus

### Template extraction candidates (refactor target)
- `buildSystemPrompt()` — static frame + dynamic PR interpolation
- `buildPlanningPrompt()` — static frame + dynamic file list interpolation
- `buildFilePrompt()` — static frame + dynamic path/change type
- Sub-agent prompts — fully static, could become named template modules

### Consolidation candidates
- `createSessionStartHook()` additional context — overlaps with `copilot-instructions.md`

### Attachment migration needed
- `tests/e2e-orchestrator.test.ts` — still prompt-injects file content

### Stays in code (no template extraction)
- `createPostToolUseHook()` hint — runtime contextual
- `createErrorOccurredHook()` notifications — runtime contextual
- `createPreToolUseHook()` denials — runtime guard, no prompt content

---

## 6. Instruction Loading Mechanism

### Current implementation (`src/instructions.ts`)

```typescript
configureBundledInstructionDirs()
  → resolves TOOL_ROOT (dirname of src/)
  → checks if TOOL_ROOT/.github exists
  → prepends TOOL_ROOT to COPILOT_CUSTOM_INSTRUCTIONS_DIRS env var
  → SDK discovers:
      .github/copilot-instructions.md        (session-level)
      .github/instructions/*.instructions.md  (file-scoped via applyTo)
```

### What the SDK provides but is NOT currently used
- `skillDirectories` session option — could replace sub-agent prompts with SDK-managed skill directories
- Explicit instruction configuration in `createSession()` — currently relies entirely on env var

### Decision point for Phase 02
Whether to keep the env-var-based instruction loading or move to explicit `createSession()` configuration depends on whether `skillDirectories` will be used for review workflows. See [[Copilot-SDK-0.2.0-Verified-Capabilities]] for the verified SDK surface.

---

## 7. Configuration Influence on Prompts

The `.prreviewer.yml` config (parsed via Zod in `src/config.ts`) influences prompt composition at these points:

| Config Field | Prompt Effect |
|-------------|---------------|
| `severityThreshold` | Interpolated into system prompt: "Only report findings at severity `X` or above" |
| `planning` | Gates whether `buildPlanningPrompt()` is called at all |
| `maxFiles` | Limits the number of per-file review prompts sent |
| `ignore` | Filters files before review prompts are generated |
| `reasoningEffort` | Passed to `createSession({ reasoningEffort })` — not in prompt text |
| `clustering` / `clusterThreshold` | Post-review — no prompt influence |
