# copilot-pr-reviewer

Automated PR code reviewer for Azure DevOps, powered by GitHub Copilot SDK (`@github/copilot-sdk`). Runs as an Azure DevOps pipeline task that reviews changed files in a PR iteration, posts findings as threaded comments, and auto-resolves stale comments when issues are fixed.

## Prerequisites

- [Bun](https://bun.sh/) >= 1.0.26
- A GitHub token with Copilot access
- An Azure DevOps PAT with PR comment permissions

## Setup

```bash
bun install
cp .env.example .env
# Fill in the required values in .env
```

## Commands

| Command | Description |
|---------|-------------|
| `bun run start` | Run the reviewer (requires env vars) |
| `bun run prototype` | Run the end-to-end review prototype |
| `bun run prototype:reply` | Run the same-thread reply prototype |
| `bun test` | Run all tests |
| `bun test --watch` | Watch mode |
| `bun test --coverage` | Coverage report |
| `bun run typecheck` | TypeScript strict checking (`tsc --noEmit`) |
| `bun run biome:fix` | Lint + format with Biome |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `COPILOT_GITHUB_TOKEN` | Yes | GitHub token for Copilot SDK auth |
| `ADO_PAT` | Yes | Azure DevOps personal access token |
| `ADO_ORG` | Yes | Azure DevOps organization name |
| `ADO_PROJECT` | Yes | Azure DevOps project name |
| `ADO_REPO_ID` | Yes | Repository ID |
| `ADO_PR_ID` | Yes | Pull request ID |
| `CONFIG_PATH` | No | Path to config file (default: `.prreviewer.yml`) |
| `COPILOT_MODEL` | No | Model to use (default: `gpt-4.1`) |
| `REPO_ROOT` | No | Repository root path (default: `process.cwd()`) |

## How It Works

1. Fetches PR metadata and iteration diff from Azure DevOps
2. Creates a Copilot SDK session with a custom `emit_finding` tool
3. Reviews each changed file (with optional security and test sub-agents)
4. Clusters similar findings to reduce comment noise
5. Reconciles new findings against existing bot threads
6. Posts new comments and auto-resolves stale ones

## Configuration

Create a `.prreviewer.yml` in your repo root to customize behavior (severity threshold, ignored paths, clustering, max files, etc.). See `src/config.ts` for the schema and defaults.

## License

MIT
