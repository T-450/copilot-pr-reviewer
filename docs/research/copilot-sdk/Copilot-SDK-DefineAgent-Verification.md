---
type: research
title: Copilot SDK DefineAgent Verification
created: 2026-03-22
tags:
  - copilot-sdk
  - research
  - migration
  - agents
related:
  - '[[Copilot-SDK-0.1.32-Current-Surface]]'
  - '[[Copilot-SDK-0.2.0-Verified-Capabilities]]'
  - '[[Copilot-SDK-Upgrade-Summary]]'
---

# Copilot SDK DefineAgent Verification

## Question

Does the published `@github/copilot-sdk` package expose a `defineAgent` helper that should replace this repo’s plain `CustomAgentConfig` objects?

## Answer

No. I found no published `defineAgent` export in either:

- the currently installed `0.1.32` package
- the published `0.2.0` tarball

## Evidence

### Installed 0.1.32

- `node_modules/@github/copilot-sdk/dist/index.d.ts` exports:
  - `CopilotClient`
  - `CopilotSession`
  - `defineTool`
  - `approveAll`
- `defineAgent` is absent from the public index export list.

### Published 0.2.0

- `Auto Run Docs/Working/copilot-sdk-0.2.0/package/dist/index.d.ts` exports:
  - `CopilotClient`
  - `CopilotSession`
  - `defineTool`
  - `approveAll`
  - `SYSTEM_PROMPT_SECTIONS`
- `defineAgent` is absent from the public index export list there as well.

### Grep verification

- A recursive search across the unpacked `0.2.0` package found no published `defineAgent` symbol.

## Verified Nearest Replacement Options

### Option 1: keep using `CustomAgentConfig`

This is the direct published path already used by the repo.

- Define plain `CustomAgentConfig` objects
- pass them through `customAgents` in `createSession(...)`

This is the safest behavior-preserving path for the upgrade prototype.

### Option 2: use `agent` with `customAgents`

`0.2.0` adds `SessionConfig.agent?: string`.

Verified meaning from the published type comment:

- `agent` selects one of the configured `customAgents` by `name` at session start
- it does not define the agent itself

This is useful only if the upgraded prototype needs an initial active agent selection.

### Option 3: extension authoring via `joinSession(...)`

The `0.2.0` package ships `@github/copilot-sdk/extension` docs centered on `joinSession({ tools, hooks })`.

That is a different authoring mode for Copilot CLI extensions, not a replacement for:

- `CustomAgentConfig`
- session-local `customAgents`
- the repo’s current review pipeline structure

## Migration Decision Implication

For this repository, the verified low-risk path is:

- keep plain `CustomAgentConfig` objects
- upgrade surrounding session/tool/hook wiring first
- avoid inventing a non-existent `defineAgent(...)` abstraction

## Sources

- Local installed package:
  - `node_modules/@github/copilot-sdk/dist/index.d.ts`
  - `node_modules/@github/copilot-sdk/dist/types.d.ts`
- Unpacked `0.2.0` package:
  - `Auto Run Docs/Working/copilot-sdk-0.2.0/package/dist/index.d.ts`
  - `Auto Run Docs/Working/copilot-sdk-0.2.0/package/dist/types.d.ts`
  - `Auto Run Docs/Working/copilot-sdk-0.2.0/package/docs/agent-author.md`
