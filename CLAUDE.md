# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered code reviewer for Azure DevOps pull requests. Runs as a pipeline task using the GitHub Copilot SDK and Bun.js runtime. Findings are posted as PR comment threads. The pipeline always exits 0 (non-blocking/advisory).

## Commands

```bash
bun install              # Install dependencies
bun run src/index.ts     # Run the reviewer (requires env vars)
bun test                 # Run all tests
bun test src/ado/client.test.ts  # Run a single test file
bun run lint             # Lint
bun run lint:fix         # Lint with auto-fix
bun tsc --noEmit         # Type-check only (no build step)
```

## Architecture

**Entry point:** `src/index.ts` calls `runReview()` from the core orchestrator.

**Main flow** (`src/core/review-orchestrator.ts`):
1. Init telemetry → load config → create ADO client
2. Parallel fetch: PR diff (iteration changes), PR metadata, existing bot threads
3. Populate full diffs via git, enrich files with security risk tags and test companion status
4. Filter files (ignore patterns, binary exclusion, risk-priority sort, maxFiles cap)
5. Generate repo map → send files to Copilot SDK session for LLM review
6. Filter findings by severity threshold
7. Reconcile against existing threads (fingerprint-based dedup) → create/resolve threads

**Module layout:**
- `src/ado/` — Azure DevOps REST API: HTTP client with retry/rate-limit handling, PR metadata, iteration diffs, comment posting, thread reconciliation
- `src/copilot/` — Copilot SDK session management, `emit_finding` tool schema (Zod), permission policy (LLM restricted to read-only + emit_finding)
- `src/core/` — Orchestration, prompt construction, file filtering, severity filtering, finding fingerprinting
- `src/config/` — Loads `.prreviewer.yml` with Zod validation and defaults
- `src/repo/` — Security risk classification (HIGH/DATA/MEDIUM/NORMAL), test companion detection, directory tree generation
- `src/shared/` — Shared types (`Finding`, `ChangedFile`, `PrMetadata`, `Severity`, `RiskLevel`) and error classes (`AuthError`, `RateLimitError`)
- `src/telemetry/` — OpenTelemetry instrumentation (traces, metrics, events); noop if no OTLP endpoint

**Key patterns:**
- Dependency injection via `ReviewDeps` interface — all components accept a deps object for testability
- Finding deduplication via SHA256 fingerprint of (path, line range, title, category)
- Every module has a corresponding `.test.ts` file using `bun:test`

## Code Style

- ES modules, strict TypeScript, no build step (Bun runs TS directly)
- Semicolons required, `const` preferred, no `var`, no `any`, no default exports
- Use `import type { ... }` for type-only imports
- Array types use `string[]` notation, not `Array<string>`
- 2-space indentation, LF line endings

## Environment Variables

**Required:** `ADO_PAT`, `ADO_ORG`, `ADO_PROJECT`, `ADO_REPO_ID`, `ADO_PR_ID`, `COPILOT_GITHUB_TOKEN`

**Optional:** `REPO_ROOT`, `CONFIG_PATH`, `MAX_FILES`, `SEVERITY_THRESHOLD`, `COPILOT_MODEL` (default: gpt-4.1), `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`
