---
type: analysis
title: Copilot SDK 0.2.0 Migration Decisions
created: 2026-03-22
tags:
  - copilot-sdk
  - migration
  - decision
  - sdk-0.2.0
related:
  - '[[Copilot-SDK-0.1.32-Current-Surface]]'
  - '[[Copilot-SDK-0.2.0-Verified-Capabilities]]'
  - '[[Copilot-SDK-DefineAgent-Verification]]'
  - '[[Copilot-SDK-Upgrade-Summary]]'
---

# Copilot SDK 0.2.0 Migration Decisions

## Upgrade Outcome

`@github/copilot-sdk` was updated from `^0.1.32` to `^0.2.0` (resolved to `0.2.0`).

- `bun install` resolved and installed successfully.
- `tsc --noEmit` passes with zero errors.
- All 83 tests pass (7 skipped, 0 failures) without any source changes.

The upgrade is fully backward-compatible for the surface this repo currently uses.

## Surface Diff Summary

### New value exports in 0.2.0

| Export | Purpose |
|---|---|
| `SYSTEM_PROMPT_SECTIONS` | Metadata for each system prompt section ID, enables `customize` mode |

### New type exports in 0.2.0

| Type | Purpose |
|---|---|
| `ReasoningEffort` | `"low" \| "medium" \| "high" \| "xhigh"` union for `SessionConfig.reasoningEffort` |
| `SectionOverride` | Per-section override config for `customize` mode |
| `SectionOverrideAction` | `"replace" \| "remove" \| "append" \| "prepend" \| SectionTransformFn` |
| `SectionTransformFn` | Callback for dynamic section transforms |
| `SystemMessageCustomizeConfig` | Third `systemMessage.mode` option alongside `append` and `replace` |
| `SystemPromptSection` | Known section identifier union |
| `TelemetryConfig` | OTel configuration for the CLI process |
| `TraceContext` / `TraceContextProvider` | W3C distributed trace propagation |
| `BaseHookInput` | Shared base for all hook input types |
| All hook I/O interfaces | `PreToolUseHookInput`, `PostToolUseHookOutput`, etc. — previously only available as local types |

### New `SessionConfig` fields

| Field | Type | Migration relevance |
|---|---|---|
| `reasoningEffort` | `ReasoningEffort` | Enables quick-pass default for review; planned for next task |
| `agent` | `string` | Activates a custom agent at session start; additive, not required |
| `onEvent` | `SessionEventHandler` | Early event handler before session.create RPC; planned for streaming |
| `streaming` | `boolean` | Enable streaming mode; planned for next task |
| `clientName` | `string` | User-Agent identification; optional |
| `configDir` | `string` | Override config directory; not needed |
| `provider` | `ProviderConfig` | BYOK provider config; not needed |
| `onUserInputRequest` | `UserInputHandler` | Enables `ask_user` tool; not needed for automated reviewer |
| `skillDirectories` / `disabledSkills` | `string[]` | Skill loading; not needed |

### Changes to existing types

| Type | Change | Impact |
|---|---|---|
| `Tool` | Added `overridesBuiltInTool?: boolean`, `skipPermission?: boolean` | Additive; existing tool definitions remain valid |
| `SessionHooks` | Now a proper exported SDK interface with typed handlers | Repo's local `SessionHooks` type can be replaced with SDK import |
| `CopilotSession` | Added `setModel()`, `log()`, `abort()`, `getMessages()`, `destroy()` deprecated | `disconnect()` still correct; additive |
| `ToolInvocation` | Added `traceparent?`, `tracestate?` | Additive; existing handler signatures remain valid |

## Migration Constraints

### Must preserve

1. **`emit_finding` tool contract** — The Zod schema, fingerprint computation, and `Finding` collection behavior must not change.
2. **`sendAndWait` orchestration** — Planning + per-file review via `sendAndWait` remains the correct synchronous review flow.
3. **Native file attachments** — `attachments: [{ type: "file", path }]` remains the executable review input path.
4. **`customAgents` as plain objects** — `security-reviewer` and `test-reviewer` agents continue as `CustomAgentConfig` objects.
5. **Graceful failure semantics** — All errors still exit 0 to avoid blocking PR merges.
6. **Existing hooks** — `onPostToolUse`, `onErrorOccurred`, `onSessionStart`, `onSessionEnd` must keep their current behavior.

### Non-goals for this upgrade step

1. **System prompt restructuring** — The `customize` mode is available but not needed for the behavior-preserving prototype. Current `append` mode works.
2. **BYOK / provider config** — Not relevant to this project's Copilot token auth.
3. **`ask_user` integration** — The reviewer is fully automated; no user input handler needed.
4. **Telemetry / tracing** — Valuable future addition but out of scope for the baseline upgrade.
5. **Skill loading** — Not applicable to this pipeline runner.

## Compatibility Decisions

### Decision: Keep local hook types for now

The SDK now exports `SessionHooks` and all hook I/O interfaces. The repo's `hooks.ts` currently defines its own parallel types. These are structurally compatible with the SDK types (confirmed by passing typecheck), but the next refactor task should replace them with SDK imports to reduce drift.

**Rationale**: Changing imports is a refactor concern, not a version upgrade concern. Keeping the local types for this step ensures zero application code changes during the version bump.

### Decision: Pin `^0.2.0` with caret

The `package.json` now declares `"^0.2.0"` which allows patch and minor updates within the `0.2.x` range. This matches the project's existing caret convention for all dependencies.

### Decision: No application code changes in this step

The upgrade is purely a dependency version change. All type-level additions are additive and do not require code modifications. Application code changes (migrating to `defineTool`, importing SDK hook types, adding `reasoningEffort`, streaming, new hooks) are deferred to subsequent tasks per the phase plan.

## Verified By

- `bun install` — resolved `@github/copilot-sdk@0.2.0`
- `tsc --noEmit` — zero errors
- `bun test` — 83 pass, 7 skip, 0 fail

## Sources

- Installed package: `node_modules/@github/copilot-sdk/dist/index.d.ts` (0.2.0)
- Installed package: `node_modules/@github/copilot-sdk/dist/types.d.ts` (0.2.0)
- Installed package: `node_modules/@github/copilot-sdk/dist/session.d.ts` (0.2.0)
- Prior research: [[Copilot-SDK-0.1.32-Current-Surface]], [[Copilot-SDK-0.2.0-Verified-Capabilities]]
