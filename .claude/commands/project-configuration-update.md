---
name: project-configuration-update
description: Workflow command scaffold for project-configuration-update in copilot-pr-reviewer.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /project-configuration-update

Use this workflow when working on **project-configuration-update** in `copilot-pr-reviewer`.

## Goal

Updates project-level configuration, metadata, or documentation files (e.g., renaming project, updating workflow templates, or adding guidance).

## Common Files

- `README.md`
- `package.json`
- `CLAUDE.md`
- `templates/*.yml`
- `.gitignore`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Edit or add files like README.md, package.json, CLAUDE.md, or templates/*.yml
- Optionally update .gitignore or other project root config files

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.