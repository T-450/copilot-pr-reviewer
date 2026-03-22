---
type: report
title: Copilot SDK Upgrade Summary
created: 2026-03-22
tags:
  - copilot-sdk
  - summary
  - migration
related:
  - '[[Copilot-SDK-0.1.32-Current-Surface]]'
  - '[[Copilot-SDK-0.2.0-Verified-Capabilities]]'
  - '[[Copilot-SDK-DefineAgent-Verification]]'
---

# Copilot SDK Upgrade Summary

## Outcome

The repository is currently using a narrow, stable subset of the Copilot SDK `0.1.32` surface, and the published `0.2.0` package exposes the specific upgrade primitives needed for the next task without requiring a redesign of the review pipeline.

## Current-state summary

- The runtime already uses native file attachments in the executable review path.
- The repo still defines `emit_finding` as a manual `Tool` object instead of using `defineTool(...)`.
- The repo currently wires only post-tool, error, and session lifecycle hooks.
- Custom agents are plain `CustomAgentConfig` objects and already match the published session model.

See [[Copilot-SDK-0.1.32-Current-Surface]].

## Verified `0.2.0` migration enablers

- `defineTool(...)` remains published and is the correct verified replacement for the manual `emit_finding` tool.
- `reasoningEffort` is part of `SessionConfig`.
- `onPreToolUse` and `onUserPromptSubmitted` are part of `SessionHooks`.
- `streaming` and early `onEvent` handling are published session options.
- Attachments remain first-class, with additive support for `blob` attachments.
- Structured system-prompt customization exists through `SYSTEM_PROMPT_SECTIONS` and `mode: "customize"`, but it is optional for the behavior-preserving prototype.

See [[Copilot-SDK-0.2.0-Verified-Capabilities]].

## `defineAgent` finding

- There is no verified published `defineAgent` export in either the installed `0.1.32` package or the published `0.2.0` tarball.
- The correct published path remains `CustomAgentConfig` plus `customAgents`, with optional `agent` selection in `0.2.0`.

See [[Copilot-SDK-DefineAgent-Verification]].

## Recommended next-step constraints

- Keep `customAgents` as plain objects.
- Migrate `emit_finding` to `defineTool(...)` without changing its Zod schema or finding collection contract.
- Preserve native file attachments as the default executable review input.
- Import SDK hook types instead of maintaining local parallel definitions where practical.
- Add streaming and progress reporting using typed session events, not prompt hacks.

## Detailed notes

- [[Copilot-SDK-0.1.32-Current-Surface]]
- [[Copilot-SDK-0.2.0-Verified-Capabilities]]
- [[Copilot-SDK-DefineAgent-Verification]]
