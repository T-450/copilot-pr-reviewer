# User Guide

This guide is for **teams adopting the PR reviewer** in their Azure DevOps repositories. It covers onboarding, configuration, understanding review comments, and troubleshooting.

## Quick Start

### Step 1: Add the pipeline

Create `azure-pipelines.yml` in your repository root:

```yaml
resources:
  repositories:
    - repository: pr-reviewer
      type: git
      name: YourProject/copilot-pr-reviewer
      ref: refs/heads/main

extends:
  template: templates/pr-review.yml@pr-reviewer
```

That's it. The next pull request in your repo will trigger an AI code review.

### Step 2: Create a pull request

Push a branch and open a PR as usual. The reviewer runs automatically during build validation. After it finishes, you'll see inline comments on the PR's **Files** tab -- the same place human review comments appear.

### Step 3: Respond to findings

Findings are advisory. They never block your PR from merging. You can:

- **Resolve** a comment if you've addressed it or disagree with it
- **Reply** to start a discussion (the bot won't respond -- it's a one-shot review)
- **Ignore** low-severity findings if they don't apply

## Understanding Review Comments

Each comment follows this format:

```
### 🟡 Missing null check

The `user` parameter could be undefined when the session expires,
but it's accessed without a guard on line 47.

**Suggestion:** Add an early return: `if (!user) return;`

_Severity: warning | Category: reliability | Confidence: high_
```

### Severity levels

| Icon | Severity | Meaning |
|------|----------|---------|
| 🔴 | `critical` | Security vulnerabilities, data loss risks, production crashes |
| 🟡 | `warning` | Bugs, logic errors, significant reliability issues |
| 🔵 | `suggestion` | Code quality, maintainability, best practices |
| ⚪ | `nitpick` | Style, naming, minor improvements |

### Categories

| Category | What it covers |
|----------|---------------|
| `correctness` | Logic errors, off-by-one, wrong return values |
| `security` | Injection, auth bypass, data exposure |
| `reliability` | Null derefs, unhandled errors, race conditions |
| `maintainability` | Complexity, duplication, unclear naming |
| `testing` | Missing tests, weak assertions, coverage gaps |

### Confidence

Each finding has a confidence level (`high`, `medium`, `low`). Lower-confidence findings are more likely to be false positives -- use your judgment.

## Configuration

Add a `.prreviewer.yml` file to your repository root. All fields are optional -- missing fields use defaults.

### Full config reference

```yaml
# Files to skip (glob patterns)
ignore:
  - "*.md"
  - "**/*.generated.ts"
  - "**/*.designer.cs"
  - "*.lock"
  - "package-lock.json"

# Minimum severity to report
# Options: critical, warning, suggestion, nitpick
# Default: suggestion
severityThreshold: suggestion

# Maximum files to review per PR iteration
# Default: 30
maxFiles: 30

# Override automatic risk classification for specific paths
securityOverrides:
  - path: "src/payments/**"
    risk: HIGH_RISK
  - path: "internal/admin/**"
    risk: HIGH_RISK
  - path: "scripts/**"
    risk: NORMAL
```

### Ignore patterns

Use glob syntax to skip files that generate noise:

| Pattern | Effect |
|---------|--------|
| `"*.md"` | Skip all Markdown files |
| `"**/*.generated.ts"` | Skip generated TypeScript |
| `"**/*.designer.cs"` | Skip .NET designer files |
| `"**/migrations/**"` | Skip database migration files |
| `"dist/**"` | Skip build output |

### Severity threshold

Controls the minimum severity that gets posted as a comment:

| Threshold | What gets posted |
|-----------|-----------------|
| `critical` | Only critical findings |
| `warning` | Critical + warning |
| `suggestion` | Critical + warning + suggestion (default) |
| `nitpick` | Everything |

Set `severityThreshold: warning` if you want fewer, higher-signal comments.

### Security overrides

The reviewer automatically classifies files by risk level using path heuristics. You can override these classifications for paths that don't follow standard conventions.

**Automatic classification rules:**

| Risk Level | Paths matched |
|------------|--------------|
| `HIGH_RISK` | `auth/`, `security/`, `crypto/`, `middleware/`, `Startup.cs`, `Program.cs`, `*Middleware.cs` |
| `DATA_RISK` | `model/`, `schema/`, `migration/`, `database/`, `entity/`, `*DbContext*` |
| `MEDIUM_RISK` | `api/`, `routes/`, `controller/`, `*Controller.cs`, `*Hub.cs` |
| `NORMAL` | Everything else |

Higher-risk files get reviewed first when the file count exceeds `maxFiles`, and receive extra scrutiny in the review prompt.

### Pipeline-level overrides

You can also override settings per-repo at the pipeline level:

```yaml
extends:
  template: templates/pr-review.yml@pr-reviewer
  parameters:
    configPath: config/review.yml   # custom config location
    maxFiles: 50                    # override maxFiles
    severityThreshold: warning      # override threshold
```

Pipeline parameters take precedence over `.prreviewer.yml` for `maxFiles` and `severityThreshold`.

## Customizing Review Behavior

The reviewer uses the GitHub Copilot SDK, which automatically loads instruction files from your repo. This is the most powerful way to tailor reviews to your team's standards.

### Repo-wide instructions

Create `.github/copilot-instructions.md` with your coding standards:

```markdown
## Code Style
- Use TypeScript strict mode
- Prefer `const` over `let`; never use `var`
- Semicolons required

## Architecture
- API controllers should be thin -- delegate to service layer
- Database access only through repository pattern

## Security
- Never log sensitive data (tokens, passwords, PII)
- Use parameterized queries -- never concatenate SQL
```

See `templates/copilot-instructions-example.md` for a full starter template.

### Path-specific instructions

For focused rules on specific file types, create files under `.github/instructions/`:

```markdown
<!-- .github/instructions/security.instructions.md -->
---
applyTo: "**/auth/**,**/security/**,**/crypto/**"
---

When reviewing security-critical files:
- Verify all endpoints check authentication
- Check for hardcoded secrets or credentials
- Ensure inputs are validated before use
```

See `templates/security-instructions-example.md` for a full starter template.

### Agent-level guidance

Add an `AGENTS.md` file to your repo root (or to specific directories) for agent-level context:

```markdown
# AGENTS.md

This is a .NET 8 Web API using Clean Architecture.
The domain layer is in src/Domain/ and must have zero infrastructure dependencies.
All database access goes through src/Infrastructure/Repositories/.
```

## Incremental Reviews

The reviewer only examines changes from the **latest PR iteration** -- not the entire PR. This means:

- **First push:** Reviews all changed files
- **Subsequent pushes:** Reviews only files changed since the last push
- **Thread management:** New findings create new threads. If a previous finding no longer applies (the code was fixed), the thread is automatically resolved. Duplicate findings are skipped.

This keeps PR comment threads clean and avoids re-posting the same finding after every push.

## What Gets Skipped

The reviewer automatically skips:

- **Deleted files** -- nothing to review
- **Renamed/moved files** -- no content change
- **Binary files** -- images, fonts, archives, executables (`.png`, `.woff`, `.dll`, `.pdf`, etc.)
- **Files matching ignore patterns** -- from `.prreviewer.yml`
- **Files beyond maxFiles** -- lower-risk files are dropped first

## Troubleshooting

### No comments appear on my PR

1. **Check the pipeline ran.** Look for the "AI Code Review" job in your build results.
2. **Check the pipeline succeeded.** The job has `continueOnError: true`, so it won't fail your build, but you can see warnings in the job log.
3. **Clean PR.** If the reviewer found no issues, it stays silent -- no "looks good" comment.
4. **Severity threshold.** If set to `critical` or `warning`, lower-severity findings won't appear.
5. **All files ignored.** Check if your ignore patterns are too broad.

### Pipeline warning: "Authentication failed"

The `ADO_PAT` token may be expired or lack the required `Code (Read & Write)` scope. Regenerate it in Azure DevOps and update the `pr-reviewer-secrets` variable group.

### Pipeline warning: "Failed to parse config"

Your `.prreviewer.yml` has a YAML syntax error. Validate it with a YAML linter. The reviewer will fall back to default settings and continue.

### Pipeline warning: "Invalid config"

A field in `.prreviewer.yml` has an invalid value (e.g., `severityThreshold: blocker` instead of a valid level). The reviewer will log the specific validation error and fall back to defaults.

### Too many findings / too noisy

- Raise the severity threshold: `severityThreshold: warning`
- Add ignore patterns for generated or low-value files
- Reduce `maxFiles` to focus on the most important changes
- Add `.github/copilot-instructions.md` with specific guidance about what to focus on

### Comments appear on wrong lines

The reviewer can only reference line numbers that appear in the diff. If a finding seems misplaced, it may be because the AI inferred an issue from context but anchored it to the nearest visible line.

## Frequently Asked Questions

**Can the reviewer block my PR from merging?**
No. The pipeline always exits 0. Findings are advisory only.

**Does it review the entire codebase?**
No. It only reviews files changed in the current PR iteration (since the last push).

**Can I use this with GitHub instead of Azure DevOps?**
No. This tool is purpose-built for Azure DevOps REST API and pipeline infrastructure.

**What model does it use?**
By default, `gpt-4.1` via the GitHub Copilot SDK. This can be changed with the `COPILOT_MODEL` environment variable.

**How much does it cost?**
Zero hosting cost. It runs on Microsoft-hosted pipeline agents and uses your existing GitHub Copilot license.

**Can I see what the reviewer sends to the model?**
Enable OpenTelemetry by setting `OTEL_EXPORTER_OTLP_ENDPOINT` in the variable group. Review traces will include file paths, risk levels, and timing data (but not diff content).
