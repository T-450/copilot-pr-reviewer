---
type: reference
title: Thread Conversations Research Hub
created: 2026-03-22
tags:
  - thread-conversations
  - azure-devops
  - prototype
  - research
related:
  - "[[Existing-Review-Thread-Flow-Audit]]"
  - "[[ADO-Thread-Reply-API-Shape]]"
  - "[[Same-Thread-Reply-Prototype-Plan]]"
  - "[[Phase-01-Same-Thread-Reply-Prototype-Validation-Report]]"
  - "[[Thread-Conversation-Memory-Model]]"
  - "[[Production-Reply-Loop-Orchestration-Order]]"
  - "[[Phase-02-Production-Reply-Loop-Validation-Report]]"
  - "[[Copilot-SDK-Foundation-Implementation-Summary]]"
---

# Thread Conversations Research Hub

This hub links the Phase 01 research needed to add same-thread conversational replies to Azure DevOps PR review comments.

## Documents

- [[Existing-Review-Thread-Flow-Audit]] - current review-thread flow, bot markers, fingerprints, and the best reply-mode branch point.
- [[ADO-Thread-Reply-API-Shape]] - minimum Azure DevOps thread payload extensions needed for conversational reply detection.
- [[Same-Thread-Reply-Prototype-Plan]] - smallest runnable prototype that proves reply generation works without changing the production pipeline.
- [[Phase-01-Same-Thread-Reply-Prototype-Validation-Report]] - validation status, commands run, working prototype evidence, and the final Phase 01 closure result.
- [[Thread-Conversation-Memory-Model]] - Phase 03 decision note defining what per-thread memory must be preserved and why thread metadata is preferred over external persistence.
- [[Production-Reply-Loop-Orchestration-Order]] - Phase 02 execution order for placing live reply handling alongside planning, reconcile, thread mutation, and feedback collection.
- [[Phase-02-Production-Reply-Loop-Validation-Report]] - production reply-loop readiness, full test evidence, prototype revalidation, and current known limits.
- [[Phase-03-Context-Memory-Validation-Report]] - Phase 03 validation evidence for transcript rehydration, reply checkpoints, latest-follow-up targeting, and current thread-memory limits.

## Phase 01 Scope

The prototype only needs to prove this path:

1. Detect a qualifying user follow-up inside a bot-owned review thread.
2. Build a context-aware reply request from the existing finding plus ordered thread history.
3. Generate a same-thread reply in a controlled prototype flow.

## Non-Goals For This Phase

- Changing the production PR review pipeline by default.
- Auto-posting replies back to live Azure DevOps threads.
- Reworking finding fingerprints or reconciliation semantics.
