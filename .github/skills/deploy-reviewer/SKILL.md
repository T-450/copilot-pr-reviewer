---
name: deploy-copilot-pr-reviewer
description: Step-by-step guide to deploy the Copilot PR Reviewer to Azure DevOps repositories, including self-hosted agent setup, pipeline configuration, and org-wide rollout
version: 1.0.0
source: local-git-analysis
analyzed_commits: 5
---

# Deploy Copilot PR Reviewer to Azure DevOps

This skill covers deploying the reviewer to a single repo, then scaling org-wide.

## Prerequisites

| Requirement | Purpose | How to Get |
|-------------|---------|------------|
| GitHub Copilot license | Powers the AI review | GitHub org settings → Copilot |
| Fine-grained PAT (GitHub) | `COPILOT_GITHUB_TOKEN` with "Copilot" scope | github.com/settings/tokens |
| ADO PAT | API access for PR threads | dev.azure.com/{org}/_usersSettings/tokens |
| Bun runtime | Runs the reviewer | `curl -fsSL https://bun.sh/install \| bash` |
| Self-hosted agent OR hosted pool | Executes the pipeline | See Step 2 below |

### ADO PAT Scopes Required

- **Code** → Read & Write
- **Pull Request Threads** → Read & Write
- **Work Items** → Read (optional, for linking)
- **Build** → Read & Execute (for pipeline)

---

## Step 1: Prepare the Reviewer Package

The reviewer lives in its own repo (e.g., `copilot-pr-reviewer`). Target repos don't need any code changes — only a pipeline YAML.

```bash
# Clone the reviewer repo to the agent machine
git clone https://your-org@dev.azure.com/your-org/copilot-pr-reviewer/_git/copilot-pr-reviewer
cd copilot-pr-reviewer
bun install
```

Verify it works locally:

```bash
export COPILOT_GITHUB_TOKEN="ghp_..."
export ADO_PAT="..."
export ADO_ORG="your-org"
export ADO_PROJECT="your-project"
export ADO_REPO_ID="<guid>"
export ADO_PR_ID="<number>"
export REPO_ROOT="/path/to/checked-out/pr-branch"

bun run src/index.ts
```

Expected output:
```
Reviewing 4 files (iteration 1)
Planning review strategy...
  Reviewing src/auth.ts (edit)...
Found 5 findings, 5 meet threshold
Review complete: 5 new comments, 0 resolved
```

---

## Step 2: Set Up Self-Hosted Agent

### Option A: Dedicated Agent Machine (Recommended for Orgs)

```bash
# Download agent (Linux x64)
mkdir ~/ado-agent && cd ~/ado-agent
wget "https://download.agent.dev.azure.com/agent/4.248.0/vsts-agent-linux-x64-4.248.0.tar.gz" \
  -O agent.tar.gz
tar xzf agent.tar.gz

# Configure
./config.sh --unattended \
  --url "https://dev.azure.com/YOUR_ORG" \
  --auth pat \
  --token "YOUR_ADO_PAT" \
  --pool "Default" \
  --agent "copilot-reviewer" \
  --acceptTeeEula

# Set environment for the agent
cat > .env << 'EOF'
COPILOT_GITHUB_TOKEN=ghp_your_token_here
PATH=/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin
EOF

# Run as systemd service (persistent)
sudo ./svc.sh install
sudo ./svc.sh start
```

### Option B: Developer Machine (Quick Testing)

```bash
cd ~/ado-agent
./run.sh  # Foreground — Ctrl+C to stop
```

### Verify Agent is Online

```bash
curl -su ":$ADO_PAT" \
  "https://dev.azure.com/YOUR_ORG/_apis/distributedtask/pools/1/agents?api-version=7.1" \
  | python3 -c "import json,sys; [print(f'{a[\"name\"]}: {a[\"status\"]}') for a in json.load(sys.stdin)['value']]"
```

Expected: `copilot-reviewer: online`

---

## Step 3: Add Pipeline to a Single Repository

### 3a. Push the Pipeline YAML

Add `azure-pipelines.yml` to the target repo's **default branch** (usually `main`):

```yaml
# azure-pipelines.yml
trigger: none

pr:
  branches:
    include:
      - main
      - develop
      - release/*

pool:
  name: Default  # Self-hosted pool with copilot-reviewer agent

steps:
  - checkout: self
    fetchDepth: 0

  - script: |
      cd /path/to/copilot-pr-reviewer  # Where the reviewer is cloned
      bun install --frozen-lockfile
      bun run src/index.ts
    displayName: 'Run Copilot PR Review'
    env:
      COPILOT_GITHUB_TOKEN: $(COPILOT_GITHUB_TOKEN)
      ADO_PAT: $(ADO_PAT)
      ADO_ORG: YOUR_ORG
      ADO_PROJECT: $(System.TeamProject)
      ADO_REPO_ID: $(Build.Repository.ID)
      ADO_PR_ID: $(System.PullRequest.PullRequestId)
      REPO_ROOT: $(Build.SourcesDirectory)
      COPILOT_MODEL: gpt-4.1
    continueOnError: true  # Never block the pipeline
```

### 3b. Create the Pipeline in ADO

```bash
ADO_PAT="your-pat"
PROJECT="your-project"
REPO_ID="repo-guid"

# Create pipeline definition
curl -su ":${ADO_PAT}" \
  -X POST \
  -H "Content-Type: application/json" \
  "https://dev.azure.com/YOUR_ORG/${PROJECT}/_apis/pipelines?api-version=7.1" \
  -d '{
    "name": "copilot-pr-reviewer",
    "configuration": {
      "type": "yaml",
      "path": "/azure-pipelines.yml",
      "repository": {
        "id": "'${REPO_ID}'",
        "type": "azureReposGit"
      }
    }
  }'
```

### 3c. Set Pipeline Secret Variables

```bash
# Get build definition ID
DEF_ID=$(curl -sL -u ":${ADO_PAT}" \
  "https://dev.azure.com/YOUR_ORG/${PROJECT}/_apis/build/definitions?name=copilot-pr-reviewer&api-version=7.1" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['value'][0]['id'])")

# Fetch, add variables, update
curl -sL -u ":${ADO_PAT}" \
  "https://dev.azure.com/YOUR_ORG/${PROJECT}/_apis/build/definitions/${DEF_ID}?api-version=7.1" \
  | python3 -c "
import json,sys
d = json.load(sys.stdin)
d['variables'] = {
    'COPILOT_GITHUB_TOKEN': {'value': 'ghp_...', 'isSecret': True},
    'ADO_PAT': {'value': 'your-ado-pat', 'isSecret': True}
}
json.dump(d, sys.stdout)
" | curl -sL -u ":${ADO_PAT}" \
  -X PUT \
  -H "Content-Type: application/json" \
  "https://dev.azure.com/YOUR_ORG/${PROJECT}/_apis/build/definitions/${DEF_ID}?api-version=7.1" \
  -d @-
```

### 3d. Authorize Pipeline to Agent Pool

```bash
curl -sL -u ":${ADO_PAT}" \
  -X PATCH \
  -H "Content-Type: application/json" \
  "https://dev.azure.com/YOUR_ORG/${PROJECT}/_apis/pipelines/pipelinePermissions/queue/1?api-version=7.1-preview.1" \
  -d '{"pipelines": [{"id": 1, "authorized": true}]}'
```

### 3e. Verify

Create or push to a PR targeting `main`. The pipeline should trigger and post inline review comments.

---

## Step 4: Customize Per-Repository

Add `.prreviewer.yml` to any repo's root to customize behavior:

```yaml
# .prreviewer.yml — per-repo configuration
severityThreshold: warning        # Only post warning+ (skip suggestions/nitpicks)
maxFiles: 20                      # Cap review to 20 files per iteration
planning: true                    # Enable planning phase for 4+ file PRs
clustering: true                  # Group similar findings
clusterThreshold: 3               # Min findings to cluster

ignore:
  - "**/*.generated.ts"           # Skip generated code
  - "vendor/**"                   # Skip vendored deps
  - "**/*.test.ts"                # Don't review test files
  - "docs/**"

securityOverrides:
  - path: "src/auth/**"
    risk: HIGH_RISK               # Extra scrutiny for auth code
  - path: "src/payment/**"
    risk: HIGH_RISK
```

If no `.prreviewer.yml` exists, defaults apply (threshold: suggestion, maxFiles: 30).

---

## Step 5: Roll Out Org-Wide

### Automation Script

Create a script that adds the pipeline to every repo in a project:

```bash
#!/bin/bash
# rollout.sh — Add copilot-pr-reviewer to all repos in a project
set -euo pipefail

ORG="your-org"
PROJECT="your-project"
PAT="your-pat"
REVIEWER_PATH="/path/to/copilot-pr-reviewer"

PIPELINE_YAML='trigger: none
pr:
  branches:
    include: [main, develop]
pool:
  name: Default
steps:
  - checkout: self
    fetchDepth: 0
  - script: |
      cd '"${REVIEWER_PATH}"'
      bun install --frozen-lockfile
      bun run src/index.ts
    displayName: Run Copilot PR Review
    env:
      COPILOT_GITHUB_TOKEN: $(COPILOT_GITHUB_TOKEN)
      ADO_PAT: $(ADO_PAT)
      ADO_ORG: '"${ORG}"'
      ADO_PROJECT: $(System.TeamProject)
      ADO_REPO_ID: $(Build.Repository.ID)
      ADO_PR_ID: $(System.PullRequest.PullRequestId)
      REPO_ROOT: $(Build.SourcesDirectory)
      COPILOT_MODEL: gpt-4.1
    continueOnError: true'

# List all repos in the project
REPOS=$(curl -sL -u ":${PAT}" \
  "https://dev.azure.com/${ORG}/${PROJECT}/_apis/git/repositories?api-version=7.1" \
  | python3 -c "import json,sys; [print(f'{r[\"id\"]}|{r[\"name\"]}|{r[\"defaultBranch\"]}') for r in json.load(sys.stdin)['value'] if not r.get('isDisabled')]")

echo "$REPOS" | while IFS='|' read -r REPO_ID REPO_NAME DEFAULT_BRANCH; do
  echo "=== Setting up: ${REPO_NAME} ==="
  BRANCH_NAME="${DEFAULT_BRANCH#refs/heads/}"

  # Get branch HEAD
  HEAD=$(curl -sL -u ":${PAT}" \
    "https://dev.azure.com/${ORG}/${PROJECT}/_apis/git/repositories/${REPO_ID}/refs?filter=heads/${BRANCH_NAME}&api-version=7.1" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['value'][0]['objectId'])")

  # Push azure-pipelines.yml (skip if exists)
  curl -sL -u ":${PAT}" \
    -X POST \
    -H "Content-Type: application/json" \
    "https://dev.azure.com/${ORG}/${PROJECT}/_apis/git/repositories/${REPO_ID}/pushes?api-version=7.1" \
    -d "{
      \"refUpdates\": [{\"name\": \"${DEFAULT_BRANCH}\", \"oldObjectId\": \"${HEAD}\"}],
      \"commits\": [{
        \"comment\": \"ci: add copilot-pr-reviewer pipeline\",
        \"changes\": [{
          \"changeType\": \"add\",
          \"item\": {\"path\": \"/azure-pipelines.yml\"},
          \"newContent\": {\"content\": $(echo "$PIPELINE_YAML" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'), \"contentType\": \"rawtext\"}
        }]
      }]
    }" > /dev/null 2>&1 && echo "  Pipeline YAML pushed" || echo "  Skipped (may already exist)"

  # Create pipeline definition
  curl -sL -u ":${PAT}" \
    -X POST \
    -H "Content-Type: application/json" \
    "https://dev.azure.com/${ORG}/${PROJECT}/_apis/pipelines?api-version=7.1" \
    -d "{
      \"name\": \"copilot-pr-reviewer\",
      \"configuration\": {
        \"type\": \"yaml\",
        \"path\": \"/azure-pipelines.yml\",
        \"repository\": {\"id\": \"${REPO_ID}\", \"type\": \"azureReposGit\"}
      }
    }" > /dev/null 2>&1 && echo "  Pipeline created" || echo "  Pipeline may already exist"

  echo "  Done: ${REPO_NAME}"
done

echo "Rollout complete. Set COPILOT_GITHUB_TOKEN and ADO_PAT secrets in each pipeline."
```

### Variable Groups (Org-Wide Secrets)

Instead of setting secrets per-pipeline, use a variable group:

1. Go to **Pipelines → Library → + Variable Group**
2. Name: `copilot-reviewer-secrets`
3. Add `COPILOT_GITHUB_TOKEN` (secret) and `ADO_PAT` (secret)
4. Reference in YAML:

```yaml
variables:
  - group: copilot-reviewer-secrets
```

This way you update tokens in one place.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "No changed files" | ADO returns `changeType` as string not number | Already fixed in v1.0 — update reviewer |
| 401 on ADO API | PAT expired or wrong scope | Regenerate with Code + PR Threads scope |
| "COPILOT_GITHUB_TOKEN not set" | Secret not configured in pipeline | Add to pipeline variables or variable group |
| Agent shows "Offline" | Agent process stopped | `cd ~/ado-agent && ./run.sh` or restart service |
| Pipeline not triggering on PR | YAML only on main, not feature branch | Push YAML to feature branch or use centralized template |
| "Listening for Jobs" but no pickup | Pipeline not authorized for agent pool | Authorize via API or ADO UI (Pipeline settings → Agent pool) |
| Review finds 0 issues | File attachments path wrong | Ensure `REPO_ROOT` points to checked-out source |

---

## Architecture Summary

```
┌──────────────────┐     PR event      ┌──────────────────┐
│  Azure DevOps    │ ──────────────────►│  Azure Pipeline  │
│  Pull Request    │                    │  (self-hosted)   │
└──────────────────┘                    └────────┬─────────┘
                                                 │
                                    ┌────────────▼───────────┐
                                    │  copilot-pr-reviewer   │
                                    │  (bun run src/index.ts)│
                                    └────────────┬───────────┘
                                                 │
                              ┌──────────────────┼──────────────────┐
                              │                  │                  │
                    ┌─────────▼──────┐ ┌────────▼────────┐ ┌──────▼───────┐
                    │ ADO REST API   │ │ Copilot SDK     │ │ Config       │
                    │ - PR metadata  │ │ - gpt-4.1       │ │ .prreviewer  │
                    │ - Iteration    │ │ - emit_finding   │ │ .yml         │
                    │   diff         │ │ - sendAndWait   │ └──────────────┘
                    │ - Thread CRUD  │ │ - hooks         │
                    └────────────────┘ └─────────────────┘
```
