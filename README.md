# volvo-pr-reviewer

AI code reviewer for Azure DevOps pull requests. Runs as a pipeline task using the GitHub Copilot SDK and Bun.js. Zero hosting cost -- executes on Microsoft-hosted Ubuntu agents during PR build validation.

## Prerequisites

- [Bun](https://bun.sh) v1.3+
- A GitHub Copilot license (for the Copilot SDK token)
- An Azure DevOps PAT with **Code (Read & Write)** scope

## Local Development

### 1. Install dependencies

```bash
bun install
```

### 2. Run tests

```bash
bun test
```

### 3. Type-check

```bash
bun tsc --noEmit
```

### 4. Run locally (dry run against a real PR)

Set the required environment variables, then:

```bash
bun run src/index.ts
```

#### Required environment variables

| Variable | Description |
|----------|-------------|
| `ADO_PAT` | Azure DevOps Personal Access Token |
| `ADO_ORG` | Azure DevOps org URL (e.g. `https://dev.azure.com/myorg`) |
| `ADO_PROJECT` | Azure DevOps project name |
| `ADO_REPO_ID` | Repository ID (GUID) |
| `ADO_PR_ID` | Pull request ID to review |
| `COPILOT_GITHUB_TOKEN` | GitHub token with Copilot access |

#### Optional environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REPO_ROOT` | `process.cwd()` | Path to the checked-out source repo |
| `CONFIG_PATH` | `.prreviewer.yml` | Path to the reviewer config file |
| `MAX_FILES` | `30` | Maximum files to review per run |
| `SEVERITY_THRESHOLD` | `suggestion` | Minimum severity to report (`critical`, `warning`, `suggestion`, `nitpick`) |
| `COPILOT_MODEL` | `gpt-4.1` | Model to use for reviews |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(none)_ | OTLP endpoint for telemetry (omit for noop) |
| `OTEL_SERVICE_NAME` | `copilot-pr-reviewer` | OTel service name |

## Pipeline Setup

### 1. Create a variable group

In Azure DevOps, create a variable group named `pr-reviewer-secrets` with:

- `ADO_PAT` -- PAT with Code Read & Write on the target repos
- `COPILOT_GITHUB_TOKEN` -- GitHub token with Copilot access
- `OTEL_EXPORTER_OTLP_ENDPOINT` _(optional)_ -- OTLP collector URL
- `OTEL_EXPORTER_OTLP_HEADERS` _(optional)_ -- Auth headers for the collector

### 2. Push this repo to Azure DevOps

Push `volvo-pr-reviewer` to an Azure DevOps Git repository (e.g. `YourProject/copilot-pr-reviewer`).

### 3. Add the pipeline to consuming repos

In each repo you want reviewed, create an `azure-pipelines.yml`:

```yaml
resources:
  repositories:
    - repository: pr-reviewer
      type: git
      name: YourProject/copilot-pr-reviewer
      ref: refs/heads/main

extends:
  template: templates/pr-review.yml@pr-reviewer
  parameters:
    configPath: .prreviewer.yml    # optional
    maxFiles: 30                   # optional
    severityThreshold: suggestion  # optional
```

### 4. Configure per-repo settings (optional)

Add a `.prreviewer.yml` to the root of each consuming repo:

```yaml
ignore:
  - "*.md"
  - "**/*.generated.ts"

severityThreshold: warning
maxFiles: 20

securityOverrides:
  - path: "src/payments/**"
    risk: HIGH_RISK
```

### 5. Add Copilot instructions (optional)

The reviewer automatically picks up:

- `.github/copilot-instructions.md` -- repo-wide coding standards
- `.github/instructions/**/*.instructions.md` -- path-specific rules
- `AGENTS.md` -- agent-level guidance

See `templates/copilot-instructions-example.md` and `templates/security-instructions-example.md` for starter templates.

## Architecture

```ASCII
src/
  index.ts              Entry point -- calls runReview(), always exits 0
  core/                 Orchestration, prompt building, fingerprinting, filtering
  ado/                  Azure DevOps REST API: PR metadata, diffs, comments, reconciliation
  copilot/              Copilot SDK session, emit_finding tool, permission policy
  repo/                 Security risk tagging, test companion detection, repo map
  config/               .prreviewer.yml loading and Zod validation
  shared/               Shared types and error classes
  telemetry/            OpenTelemetry instrumentation (traces, metrics, events)
templates/
  pr-review.yml         Azure DevOps pipeline template
  copilot-instructions-example.md
  security-instructions-example.md
```

## How It Works

1. PR triggers the pipeline on a hosted Ubuntu agent
2. The orchestrator fetches the iteration diff, PR metadata, and existing bot threads in parallel
3. Files are classified by security risk (path heuristics) and test companion status
4. A single Copilot SDK session reviews all files -- the model emits findings via `emit_finding` only
5. The thread reconciler compares new findings against existing bot threads by fingerprint and `changeTrackingId`
6. New threads are created, stale threads are resolved, duplicates are skipped
7. The pipeline always exits 0 -- findings are advisory, never blocking
