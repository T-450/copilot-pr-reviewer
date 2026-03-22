---
type: research
title: Copilot SDK 0.1.32 Current Surface
created: 2026-03-22
tags:
  - copilot-sdk
  - research
  - migration
  - sdk-0.1.32
related:
  - '[[Copilot-SDK-0.2.0-Verified-Capabilities]]'
  - '[[Copilot-SDK-DefineAgent-Verification]]'
  - '[[Copilot-SDK-Upgrade-Summary]]'
---

# Copilot SDK 0.1.32 Current Surface

## Scope

This note captures the `@github/copilot-sdk` `0.1.32` surface currently installed in this repository and the subset actively used by the application and tests before the `0.2.0` upgrade work begins.

## Verified Installed Package

- `node_modules/@github/copilot-sdk/package.json` reports version `0.1.32`.
- `package.json` currently declares `"@github/copilot-sdk": "^0.1.32"`.

## SDK Surface Actively Used By This Repo

### Client and session creation

- The runtime imports `CopilotClient` and `approveAll` from `@github/copilot-sdk` in [src/index.ts](../../../src/index.ts).
- The main review flow creates one session through `client.createSession(...)`.
- The session config currently uses:
  - `sessionId`
  - `model`
  - `tools`
  - `excludedTools`
  - `infiniteSessions`
  - `customAgents`
  - `hooks`
  - `systemMessage`
  - `onPermissionRequest`
  - `workingDirectory`

### Custom agents

- The repo defines two plain-object `CustomAgentConfig` instances in [src/index.ts](../../../src/index.ts):
  - `security-reviewer`
  - `test-reviewer`
- These agents are passed through `customAgents: [securityAgentConfig, testAgentConfig]`.
- No helper such as `defineAgent(...)` is used anywhere in the repository.

### Tools

- The repo defines `emit_finding` manually in [src/review.ts](../../../src/review.ts) as a plain `Tool`.
- The implementation uses:
  - `name`
  - `description`
  - `parameters`
  - `handler`
- The Zod schema is `FindingArgsSchema`, but the code does not use `defineTool(...)` yet.

### Hooks

- The repo defines its own local `SessionHooks` shape in [src/hooks.ts](../../../src/hooks.ts) instead of importing the SDK hook types.
- The runtime currently wires:
  - `onPostToolUse`
  - `onErrorOccurred`
  - `onSessionEnd`
  - `onSessionStart`
- The runtime does not currently wire:
  - `onPreToolUse`
  - `onUserPromptSubmitted`

### Attachments and review orchestration

- The executable review path in [src/index.ts](../../../src/index.ts) sends each file as a native SDK attachment:
  - `attachments: [{ type: "file", path: absolutePath }]`
- The prompt for executable review is still file-oriented and concise via `buildFilePrompt(...)`.
- The E2E test in [tests/e2e-orchestrator.test.ts](../../../tests/e2e-orchestrator.test.ts) still injects file content directly into the prompt instead of using attachments for that review loop.
- The SDK integration test in [tests/sdk-integration.test.ts](../../../tests/sdk-integration.test.ts) already exercises attachment-based review.

### Messaging pattern

- The runtime uses `session.sendAndWait(...)` for planning and per-file review.
- The repo does not currently register streaming event listeners on the session.

## Verified 0.1.32 Package Exports Relevant Here

From `node_modules/@github/copilot-sdk/dist/index.d.ts`, the installed package exports:

- `CopilotClient`
- `CopilotSession`
- `defineTool`
- `approveAll`
- type exports including `CustomAgentConfig`, `SessionConfig`, `SessionEvent`, `Tool`, `ToolInvocation`, and `ToolResultObject`

## Current Gaps Between Repo Usage And Installed Surface

- The repo still hand-builds the `emit_finding` tool even though the installed package already exports `defineTool`.
- The repo uses custom local hook type aliases rather than importing SDK hook types.
- The repo uses only file attachments in executable runtime flows, but not consistently in the E2E orchestration fixture.
- The repo does not yet consume supported session options that matter to the planned migration:
  - `reasoningEffort`
  - `streaming`
  - `onPreToolUse`
  - `onUserPromptSubmitted`

## Sources

- Local package manifest: `node_modules/@github/copilot-sdk/package.json`
- Local package types: `node_modules/@github/copilot-sdk/dist/index.d.ts`
- Local package types: `node_modules/@github/copilot-sdk/dist/types.d.ts`
- Repository code:
  - [src/index.ts](../../../src/index.ts)
  - [src/review.ts](../../../src/review.ts)
  - [src/hooks.ts](../../../src/hooks.ts)
  - [tests/sdk-integration.test.ts](../../../tests/sdk-integration.test.ts)
  - [tests/e2e-orchestrator.test.ts](../../../tests/e2e-orchestrator.test.ts)
