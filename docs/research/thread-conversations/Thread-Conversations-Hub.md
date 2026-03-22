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
  - "[[Phase-03-Context-Memory-Validation-Report]]"
  - "[[Phase-04-Hardening-Validation-Report]]"
  - "[[Thread-Conversations-Implementation-Summary]]"
  - "[[Copilot-SDK-Foundation-Implementation-Summary]]"
---

# Thread Conversations Research Hub

This hub links all research, architecture, decisions, and validation evidence for the same-thread conversational reply feature added to the Azure DevOps PR reviewer. Start at [[Thread-Conversations-Implementation-Summary]] for the concise feature overview.

## Documents

- [[Existing-Review-Thread-Flow-Audit]] - current review-thread flow, bot markers, fingerprints, and the best reply-mode branch point.
- [[ADO-Thread-Reply-API-Shape]] - minimum Azure DevOps thread payload extensions needed for conversational reply detection.
- [[Same-Thread-Reply-Prototype-Plan]] - smallest runnable prototype that proves reply generation works without changing the production pipeline.
- [[Phase-01-Same-Thread-Reply-Prototype-Validation-Report]] - validation status, commands run, working prototype evidence, and the final Phase 01 closure result.
- [[Thread-Conversation-Memory-Model]] - Phase 03 decision note defining what per-thread memory must be preserved and why thread metadata is preferred over external persistence.
- [[Production-Reply-Loop-Orchestration-Order]] - Phase 02 execution order for placing live reply handling alongside planning, reconcile, thread mutation, and feedback collection.
- [[Phase-02-Production-Reply-Loop-Validation-Report]] - production reply-loop readiness, full test evidence, prototype revalidation, and current known limits.
- [[Phase-03-Context-Memory-Validation-Report]] - Phase 03 validation evidence for transcript rehydration, reply checkpoints, latest-follow-up targeting, and current thread-memory limits.
- [[Phase-04-Hardening-Validation-Report]] - final hardening validation for regressions, operational logging, prototype re-checks, and rollout readiness.
- [[Thread-Conversations-Implementation-Summary]] - concise feature history linking architecture, memory decisions, all validation reports, and follow-on extension hooks.

## Feature Path (Phases 01–04)

1. **Phase 01 — Prototype:** Proved follow-up detection, context assembly, and reply generation in a controlled harness.
2. **Phase 02 — Production orchestration:** Integrated the reply pass into the live pipeline after reconcile/create/resolve, before feedback.
3. **Phase 03 — Context memory:** Added deterministic transcript rehydration and reply checkpoints per [[Thread-Conversation-Memory-Model]].
4. **Phase 04 — Hardening:** Cleanup audit, 17 new regression tests (346 pass), CI-safe runtime logging, and rollout validation.

## Current Non-Goals

- Cross-run persistence beyond in-thread bot metadata.
- Human-in-the-loop approval gates for replies.
- Multi-bot thread support.
- Reworking finding fingerprints or reconciliation semantics.
