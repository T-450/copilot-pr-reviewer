---
type: reference
title: Thread Conversations Implementation Summary
created: 2026-03-22
tags:
  - thread-conversations
  - summary
  - azure-devops
  - release
related:
  - "[[Thread-Conversations-Hub]]"
  - "[[Production-Reply-Loop-Orchestration-Order]]"
  - "[[Thread-Conversation-Memory-Model]]"
  - "[[Phase-01-Same-Thread-Reply-Prototype-Validation-Report]]"
  - "[[Phase-02-Production-Reply-Loop-Validation-Report]]"
  - "[[Phase-03-Context-Memory-Validation-Report]]"
  - "[[Phase-04-Release-Readiness-Validation-Report]]"
---

# Thread Conversations Implementation Summary

This note is the main entry point for the thread-conversation feature history. It links the architecture choice, the memory decision, and the validation trail across all four phases so later work can extend the feature without re-discovering the current behavior.

## Feature Outcome

The reviewer now supports same-thread conversational follow-ups on bot-owned Azure DevOps review threads. When a user adds a new actionable reply to an active bot thread, the production reply loop rebuilds the ordered transcript, grounds the answer in the current file context, suppresses duplicate responses, and posts a concise same-thread reply.

## Phase Timeline

| Phase | Focus | Key Result |
|-------|-------|------------|
| 01 | Prototype and API shape | Working same-thread reply prototype plus thread payload research |
| 02 | Production orchestration | Live reply pass integrated after reconcile and before final feedback |
| 03 | Memory model and targeting | Deterministic transcript rehydration plus reply checkpoints |
| 04 | Hardening and release readiness | Expanded regressions, CI-safe logging, and rollout validation |

## Core References

- [[Production-Reply-Loop-Orchestration-Order]] - where the conversational reply stage lives in the production run and why it stays isolated from planning and finding review.
- [[Thread-Conversation-Memory-Model]] - the selected thread-memory contract for finding identity, transcript ordering, and reply checkpoints.
- [[Phase-01-Same-Thread-Reply-Prototype-Validation-Report]] - the original non-live proof that the conversational path works end to end.
- [[Phase-02-Production-Reply-Loop-Validation-Report]] - evidence that same-thread replies integrated into the live pipeline safely.
- [[Phase-03-Context-Memory-Validation-Report]] - validation for transcript rehydration, newest-follow-up targeting, and duplicate suppression.
- [[Phase-04-Release-Readiness-Validation-Report]] - final hardening evidence, operational logging checks, and rollout readiness.

## Current Implementation Shape

- `src/ado/client.ts` normalizes bot-owned threads and exposes the reply-candidate data the orchestrator consumes.
- `src/thread-context.ts` rebuilds deterministic per-thread conversational memory from thread comments and current change context.
- `src/review.ts` renders a reply prompt that answers the newest follow-up directly instead of re-reviewing the original finding.
- `src/reply-loop.ts` scans candidate threads, skips already-answered or non-actionable follow-ups, and posts same-thread replies with CI-safe progress summaries.
- `src/index.ts` keeps the reply pass inside the existing graceful-failure pipeline so conversational work never becomes merge-blocking.

## Known Limits And Extension Hooks

### Richer Thread Coverage

Future work can add deeper attachment support, broader reply heuristics, or richer thread summaries by extending `src/thread-context.ts` and the reply prompt inputs without changing reconcile semantics or adding external persistence.

### Human-In-The-Loop Behaviors

Approval gates, escalation prompts, or operator review modes should layer on top of the current reply stage in `src/index.ts` and `src/reply-loop.ts` rather than introducing a second conversation pipeline.

### Live Diagnostics

If rollout needs per-thread debugging beyond aggregate CI logs, the safest next step is to extend targeted tests or the prototype harness instead of logging raw Azure DevOps comment bodies.

## Recommended Starting Point For Follow-On Work

1. Read [[Production-Reply-Loop-Orchestration-Order]] for execution boundaries.
2. Read [[Thread-Conversation-Memory-Model]] for the required memory slices and non-goals.
3. Check [[Phase-04-Release-Readiness-Validation-Report]] for the current validation baseline and rollout limits.

This leaves later phases with one architectural note, one decision note, and one complete validation chain as the canonical thread-conversation map.
