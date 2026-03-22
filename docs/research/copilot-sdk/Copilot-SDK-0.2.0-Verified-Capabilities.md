---
type: research
title: Copilot SDK 0.2.0 Verified Capabilities
created: 2026-03-22
tags:
  - copilot-sdk
  - research
  - migration
  - sdk-0.2.0
related:
  - '[[Copilot-SDK-0.1.32-Current-Surface]]'
  - '[[Copilot-SDK-DefineAgent-Verification]]'
  - '[[Copilot-SDK-Upgrade-Summary]]'
---

# Copilot SDK 0.2.0 Verified Capabilities

## Verification Method

I verified `0.2.0` in two layers:

1. npm registry metadata confirmed `0.2.0` is the published latest version.
2. The published tarball was unpacked locally under `Auto Run Docs/Working/copilot-sdk-0.2.0/package/` and inspected through `dist/*.d.ts`, `README.md`, and bundled docs.

Where README prose and type declarations differ, this note treats the published type declarations as authoritative.

## Published Package Status

- `npm view @github/copilot-sdk@0.2.0` reports:
  - `version: 0.2.0`
  - `dist-tags.latest: 0.2.0`
  - tarball: `https://registry.npmjs.org/@github/copilot-sdk/-/copilot-sdk-0.2.0.tgz`

## Verified 0.2.0 Exports Relevant To This Migration

From `dist/index.d.ts`, `0.2.0` exports:

- `CopilotClient`
- `CopilotSession`
- `defineTool`
- `approveAll`
- `SYSTEM_PROMPT_SECTIONS`
- type exports including:
  - `CustomAgentConfig`
  - `SectionOverride`
  - `SystemPromptSection`
  - `SystemMessageCustomizeConfig`
  - `SessionConfig`
  - `SessionEvent`
  - `Tool`
  - `ToolInvocation`

## Capabilities Directly Relevant To The Planned Refactor

### `defineTool(...)`

- `defineTool(...)` remains a published export in `0.2.0`.
- In `0.2.0`, tool definitions also support `skipPermission?: boolean`.
- This is the closest verified upgrade path for the repo’s manual `emit_finding` tool object.

### Hooks needed by the task list

- `SessionHooks` in `0.2.0` includes:
  - `onPreToolUse`
  - `onPostToolUse`
  - `onUserPromptSubmitted`
  - `onSessionStart`
  - `onSessionEnd`
  - `onErrorOccurred`
- The planned hook additions are therefore supported directly by published `0.2.0` types.

### Reasoning effort

- `SessionConfig.reasoningEffort?: "low" | "medium" | "high" | "xhigh"` is present in `0.2.0`.
- `CopilotSession.setModel(model, options?)` in `dist/session.d.ts` also accepts `reasoningEffort`.
- This gives a direct way to add a quick-pass default now and allow deeper review later without changing the overall session pattern.

### Attachments

- `MessageOptions.attachments` in `0.2.0` supports:
  - `file`
  - `directory`
  - `selection`
  - `blob`
- File attachments remain a first-class native path and still match the repo’s desired executable review input model.
- `blob` attachments are new relative to the currently installed `0.1.32` type surface in this repo.

### Streaming and event handling

- `SessionConfig.streaming?: boolean` is present in `0.2.0`.
- `SessionConfig.onEvent?: SessionEventHandler` is also present in `0.2.0`.
- Generated session event types include:
  - `assistant.message_delta`
  - `assistant.reasoning_delta`
  - `assistant.streaming_delta`
- This supports two viable progress-reporting strategies for the prototype:
  - attach an early `onEvent` handler during session creation
  - register post-creation `session.on(...)` listeners for streaming and tool lifecycle events

### System prompt customization

- `0.2.0` adds `SYSTEM_PROMPT_SECTIONS`, `SystemPromptSection`, `SectionOverride`, and `SystemMessageCustomizeConfig`.
- `systemMessage.mode: "customize"` is part of the published `0.2.0` type surface.
- This is migration-relevant because it creates a structured alternative to large append-only prompt strings, though it is not required for a behavior-preserving first pass.

### Agent activation

- `SessionConfig.agent?: string` exists in `0.2.0`.
- The published type comment says it activates one of the entries in `customAgents` at session start.
- This is additive to `customAgents`, not a replacement export for defining agents.

## README Versus Type Surface Notes

- The `0.2.0` README documents `assistant.message_delta` and `assistant.reasoning_delta` for streaming examples.
- The generated event types additionally include `assistant.streaming_delta`.
- Because all three appear in the published package materials, migration code should prefer typed event handling and verify actual emitted events during prototype validation.

## Migration-Relevant Non-Findings

- I found no evidence that `0.2.0` removes `customAgents`.
- I found no evidence that `0.2.0` requires abandoning `sendAndWait(...)`.
- I found no evidence that file attachments are deprecated.

## Sources

- npm metadata:
  - https://registry.npmjs.org/@github/copilot-sdk/-/copilot-sdk-0.2.0.tgz
  - https://www.npmjs.com/package/@github/copilot-sdk/v/0.2.0
- Unpacked package inspected locally:
  - `Auto Run Docs/Working/copilot-sdk-0.2.0/package/dist/index.d.ts`
  - `Auto Run Docs/Working/copilot-sdk-0.2.0/package/dist/types.d.ts`
  - `Auto Run Docs/Working/copilot-sdk-0.2.0/package/dist/session.d.ts`
  - `Auto Run Docs/Working/copilot-sdk-0.2.0/package/dist/generated/session-events.d.ts`
  - `Auto Run Docs/Working/copilot-sdk-0.2.0/package/README.md`
  - `Auto Run Docs/Working/copilot-sdk-0.2.0/package/docs/examples.md`
  - `Auto Run Docs/Working/copilot-sdk-0.2.0/package/docs/agent-author.md`
