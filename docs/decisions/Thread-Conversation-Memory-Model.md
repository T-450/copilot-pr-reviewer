---
type: analysis
title: Thread Conversation Memory Model
created: 2026-03-22
tags:
  - architecture
  - thread-conversations
  - azure-devops
  - prompts
  - phase-03
related:
  - "[[Thread-Conversations-Hub]]"
  - "[[Existing-Review-Thread-Flow-Audit]]"
  - "[[Phase-01-Same-Thread-Reply-Prototype-Validation-Report]]"
  - "[[Production-Reply-Loop-Orchestration-Order]]"
---

# Thread Conversation Memory Model

Defines the per-thread conversation memory model for Phase 03 so follow-up replies stay grounded in the original finding, the ordered comment history, and the latest available code context without introducing a new persistence layer.

## Context

The current reply flow already reuses several durable signals from Azure DevOps review threads:

- `src/ado/client.ts` normalizes ordered comments, identifies bot authorship, and derives `latestUserFollowUp`.
- `src/review.ts` rebuilds a reply prompt from the root finding summary, the latest user prompt, and the full ordered transcript.
- `src/reply-loop.ts` prevents duplicate reply attempts within a single run and always targets the newest actionable follow-up.

Phase 03 needs a tighter memory definition so later implementation work can separate thread-context assembly from prompt rendering and duplicate detection while staying deterministic and testable.

## Memory Requirements Per Thread

For reliable conversational replies, each thread needs five pieces of local memory:

| Memory slice | Why it matters | Current source |
|--------------|----------------|----------------|
| Original finding summary | Keeps replies anchored to the first issue instead of treating the latest comment as a new review | Root bot comment body plus fingerprint metadata |
| File path | Lets the assistant connect the discussion to the right file attachment and diff context | `threadContext.filePath` |
| Latest code context | Grounds answers in the current changed file or diff summary when the user asks "is this still true?" | Attached file content plus `changeContextByFilePath` |
| Comment chronology | Preserves who said what, in order, across user and bot replies | Normalized ordered comments |
| Bot-reply checkpoints | Prevents re-answering an already handled comment and helps detect stale follow-ups | Existing bot markers plus `<!-- in-reply-to:ID -->` reply metadata |

## Options Evaluated

### Option A: Transcript-only context

**Mechanism:** Rebuild reply context from the raw ordered thread transcript on every run and infer everything from comment text and timestamps.

**Pros:**
- Minimal new surface area
- Easy to reason about during prompt construction
- Reuses existing ordered comment normalization

**Cons:**
- Weak duplicate detection because "already answered" must be inferred from natural-language similarity instead of explicit checkpoints
- Harder to distinguish the original finding from later bot clarifications
- Makes stale-context protection brittle when multiple user follow-ups exist in one thread

### Option B: Persisted reply metadata inside the thread

**Mechanism:** Keep rebuilding context from the thread transcript, but treat existing bot metadata as structured memory checkpoints: root bot marker, fingerprint marker, and per-reply `in-reply-to` markers already written into Azure DevOps comments.

**Pros:**
- Keeps memory local to the thread instead of inventing state files or external storage
- Gives deterministic anchors for duplicate suppression and latest-follow-up targeting
- Preserves the original finding identity even after several clarification replies
- Matches the current repository pattern of using typed, deterministic helpers over ad hoc prompt parsing

**Cons:**
- Requires a dedicated normalization layer so prompt code does not read raw Azure DevOps shapes directly
- Still depends on thread comments being available from Azure DevOps each run

## Selected Approach

**Choose Option B: transcript rehydration backed by persisted reply metadata already embedded in the Azure DevOps thread.**

This is a hybrid in practice: the transcript remains the human-readable conversation source, while explicit bot metadata acts as lightweight persisted memory for reply checkpoints and finding identity. The implementation should not add a database, file store, or sidecar cache for Phase 03.

## Chosen Memory Model

The future dedicated assembly layer should produce a normalized thread-memory object with this shape:

| Field | Meaning | Derived from |
|-------|---------|--------------|
| `threadId` | Stable thread identifier | Azure DevOps thread id |
| `filePath` | Repo-relative file path for grounding and attachments | `threadContext.filePath` |
| `fingerprint` | Original finding identity | Root bot comment fingerprint marker |
| `findingSummary` | Cleaned root finding body without bot-only markers | Root bot comment content |
| `comments` | Ordered normalized comments with author role, timestamps, and reply boundaries | Existing normalized thread comments |
| `latestUserFollowUp` | Newest actionable unresolved user comment | Deterministic chronology scan |
| `latestBotCheckpoint` | Most recent bot-authored reply metadata | Bot comments plus `in-reply-to` markers |
| `answeredCommentIds` | User comment ids already answered by the bot | Parsed reply metadata across bot replies |
| `changeContext` | Latest available diff/file context for prompt grounding | Current `changeContextByFilePath` lookup |

## Why This Model Fits The Codebase

1. **Reuse-first:** It extends existing typed comment normalization from `src/ado/client.ts` instead of introducing parallel storage logic.
2. **Deterministic helpers:** Duplicate suppression and stale-follow-up checks can remain pure functions over normalized thread memory.
3. **Prompt isolation:** `src/prompts/templates.ts` should receive already-assembled memory inputs, not raw Azure DevOps response shapes.
4. **No new persistence burden:** Azure DevOps already stores the canonical thread transcript; the repo only needs structured extraction, not another source of truth.

## Implementation Consequences

- Add a dedicated thread-context assembly layer that converts raw thread comments into a normalized conversation model before prompt construction.
- Treat the root bot comment as the canonical source of `findingSummary` and `fingerprint`.
- Parse reply metadata from bot replies into explicit checkpoint fields so duplicate-answer suppression does not rely on prompt text matching.
- Keep file or diff grounding ephemeral per run by looking up the latest local change context rather than persisting snapshots.

## Non-Goals For This Decision

- No external state files, databases, or cache entries per thread
- No attempt to preserve full historical code snapshots for each reply turn
- No change to reconciliation fingerprints for top-level review findings

## Revisit Triggers

Revisit this decision if any of the following become true:

1. Azure DevOps stops returning enough comment metadata to recover reply checkpoints deterministically.
2. The reviewer needs cross-run memory that is not present in the thread itself, such as historical file snapshots.
3. Multiple bots or identities begin replying in the same thread and current bot-author detection becomes ambiguous.

## Decision Summary

Phase 03 should model thread memory as a normalized, per-thread conversation object rebuilt from Azure DevOps comments on each run, with existing bot reply metadata serving as persisted checkpoints. This gives the reviewer the required memory slices - original finding summary, file path, latest code context, comment chronology, and bot-reply checkpoints - without introducing a separate persistence mechanism.
