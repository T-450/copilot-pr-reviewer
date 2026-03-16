# copilot-pr-reviewer

AI-powered code reviewer for Azure DevOps pull requests. Runs as a pipeline task using the GitHub Copilot SDK. Fetches incremental PR diffs, feeds them through a single Copilot session with a strict `emit_finding` tool, and posts findings as inline PR threads. The pipeline always exits 0 (non-blocking).

## Quick Setup

### 1. Create a Variable Group

In Azure DevOps, create a variable group named `pr-reviewer-secrets` with:

| Variable | Description |
|----------|-------------|
| `ADO_PAT` | Personal Access Token with Code Read & Write scope |
| `COPILOT_GITHUB_TOKEN` | GitHub token with Copilot access |

### 2. Add to Your Pipeline

In your consuming repository's PR build validation pipeline:

```yaml
resources:
  repositories:
    - repository: pr-reviewer
      type: git
      name: YourProject/copilot-pr-reviewer

extends:
  template: templates/pr-review.yml@pr-reviewer
  parameters:
    severityThreshold: suggestion
    maxFiles: 30
```

### 3. Optional Configuration

Create `.prreviewer.yml` in your repo root:

```yaml
ignore:
  - "**/*.generated.ts"
  - "**/*.min.js"
severityThreshold: warning
maxFiles: 20
securityOverrides:
  - path: "src/payments/**"
    risk: HIGH_RISK
```

## Development

```bash
npm install
npm test                    # Run unit tests
npm run typecheck           # Type-check (no emit)
npm run lint                # ESLint
npx tsx src/index.ts        # Run (requires env vars)
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADO_PAT` | Yes | — | Azure DevOps PAT |
| `ADO_ORG` | Yes | — | Org URL |
| `ADO_PROJECT` | Yes | — | Project name |
| `ADO_REPO_ID` | Yes | — | Repository GUID |
| `ADO_PR_ID` | Yes | — | Pull request ID |
| `REPO_ROOT` | Yes | — | Source repo checkout path |
| `COPILOT_GITHUB_TOKEN` | Yes | — | GitHub Copilot token |
| `CONFIG_PATH` | No | `.prreviewer.yml` | Config file path |
| `MAX_FILES` | No | `30` | Max files to review |
| `SEVERITY_THRESHOLD` | No | `suggestion` | Min severity to report |
| `COPILOT_MODEL` | No | `gpt-4.1` | LLM model |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | — | Enables telemetry |
