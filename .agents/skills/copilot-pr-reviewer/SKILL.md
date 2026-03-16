---
name: copilot-pr-reviewer-conventions
description: Development conventions and patterns for copilot-pr-reviewer. TypeScript project with conventional commits.
---

# Copilot Pr Reviewer Conventions

> Generated from [T-450/copilot-pr-reviewer](https://github.com/T-450/copilot-pr-reviewer) on 2026-03-16

## Overview

This skill teaches Claude the development patterns and conventions used in copilot-pr-reviewer.

## Tech Stack

- **Primary Language**: TypeScript
- **Architecture**: hybrid module organization
- **Test Location**: separate
- **Test Framework**: vitest

## When to Use This Skill

Activate this skill when:
- Making changes to this repository
- Adding new features following established patterns
- Writing tests that match project conventions
- Creating commits with proper message format

## Commit Conventions

Follow these commit message conventions based on 7 analyzed commits.

### Commit Style: Conventional Commits

### Prefixes Used

- `fix`
- `feat`
- `ci`
- `chore`

### Message Guidelines

- Average message length: ~57 characters
- Keep first line concise and descriptive
- Use imperative mood ("Add feature" not "Added feature")


*Commit message example*

```text
fix: pin copilot-sdk version and use caret ranges for OpenTelemetry
```

*Commit message example*

```text
ci: add GitHub Actions workflow with build and test steps
```

*Commit message example*

```text
feat: rebuild project from node-typescript-boilerplate with Node.js 22 + Vitest
```

*Commit message example*

```text
chore: rename project from volvo-pr-reviewer to copilot-pr-reviewer
```

*Commit message example*

```text
fix: address PR review comments
```

*Commit message example*

```text
Add CLAUDE.md with project guidance for Claude Code
```

*Commit message example*

```text
feat: Copilot SDK PR reviewer for Azure DevOps
```

## Architecture

### Project Structure: Single Package

This project uses **hybrid** module organization.

### Source Layout

```
src/
├── ado/
├── config/
├── copilot/
├── core/
├── repo/
├── telemetry/
```

### Entry Points

- `src/index.ts`

### Configuration Files

- `.github/workflows/ci.yml`
- `.prettierrc`
- `__tests__/vitest.config.ts`
- `package.json`
- `tsconfig.json`

### Guidelines

- This project uses a hybrid organization
- Follow existing patterns when adding new code

## Code Style

### Language: TypeScript

### Naming Conventions

| Element | Convention |
|---------|------------|
| Files | camelCase |
| Functions | camelCase |
| Classes | PascalCase |
| Constants | SCREAMING_SNAKE_CASE |

### Import Style: Relative Imports

### Export Style: Named Exports


*Preferred import style*

```typescript
// Use relative imports
import { Button } from '../components/Button'
import { useAuth } from './hooks/useAuth'
```

*Preferred export style*

```typescript
// Use named exports
export function calculateTotal() { ... }
export const TAX_RATE = 0.1
export interface Order { ... }
```

## Testing

### Test Framework: vitest

### File Pattern: `*.test.ts`

### Test Types

- **Unit tests**: Test individual functions and components in isolation
- **Integration tests**: Test interactions between multiple components/services

### Coverage

This project has coverage reporting configured. Aim for 80%+ coverage.


*Test file structure*

```typescript
import { describe, it, expect } from 'vitest'

describe('MyFunction', () => {
  it('should return expected result', () => {
    const result = myFunction(input)
    expect(result).toBe(expected)
  })
})
```

## Error Handling

### Error Handling Style: Try-Catch Blocks


*Standard error handling pattern*

```typescript
try {
  const result = await riskyOperation()
  return result
} catch (error) {
  console.error('Operation failed:', error)
  throw new Error('User-friendly message')
}
```

## Common Workflows

These workflows were detected from analyzing commit patterns.

### Feature Development

Standard feature implementation workflow

**Frequency**: ~21 times per month

**Steps**:
1. Add feature implementation
2. Add tests for feature
3. Update documentation

**Files typically involved**:
- `src/ado/*`
- `src/config/*`
- `src/copilot/*`
- `**/*.test.*`

**Example commit sequence**:
```
feat: Copilot SDK PR reviewer for Azure DevOps
chore: rename project from volvo-pr-reviewer to copilot-pr-reviewer
Add CLAUDE.md with project guidance for Claude Code
```

### Feature Development With Tests And Docs

Implements a new feature or major refactor, including source code, corresponding unit tests, and documentation/templates.

**Frequency**: ~2 times per month

**Steps**:
1. Add or modify multiple source files under src/ (often in several subfolders).
2. Add or update corresponding test files under __tests__/ or alongside source files (e.g., *.test.ts).
3. Update or add documentation files (e.g., README.md, CLAUDE.md, docs/user-guide.md).
4. Update or add configuration/templates (e.g., templates/*.md, templates/*.yml, tsconfig.json, package.json).

**Files typically involved**:
- `src/**/*.ts`
- `src/**/*.test.ts`
- `__tests__/**/*.test.ts`
- `README.md`
- `CLAUDE.md`
- `docs/user-guide.md`
- `templates/*.md`
- `templates/*.yml`
- `tsconfig*.json`
- `package.json`

**Example commit sequence**:
```
Add or modify multiple source files under src/ (often in several subfolders).
Add or update corresponding test files under __tests__/ or alongside source files (e.g., *.test.ts).
Update or add documentation files (e.g., README.md, CLAUDE.md, docs/user-guide.md).
Update or add configuration/templates (e.g., templates/*.md, templates/*.yml, tsconfig.json, package.json).
```

### Dependency Version Update

Updates dependency versions and version ranges in package.json for SDKs or libraries.

**Frequency**: ~2 times per month

**Steps**:
1. Edit package.json to change dependency versions or version ranges.
2. Optionally update lock files (not always present in commit).

**Files typically involved**:
- `package.json`
- `package-lock.json`

**Example commit sequence**:
```
Edit package.json to change dependency versions or version ranges.
Optionally update lock files (not always present in commit).
```

### Project Rename Or Rebranding

Renames the project and updates all references in key project files.

**Frequency**: ~2 times per month

**Steps**:
1. Edit README.md to update project name.
2. Edit package.json to update project name and metadata.

**Files typically involved**:
- `README.md`
- `package.json`

**Example commit sequence**:
```
Edit README.md to update project name.
Edit package.json to update project name and metadata.
```


## Best Practices

Based on analysis of the codebase, follow these practices:

### Do

- Use conventional commit format (feat:, fix:, etc.)
- Write tests using vitest
- Follow *.test.ts naming pattern
- Use camelCase for file names
- Prefer named exports

### Don't

- Don't write vague commit messages
- Don't skip tests for new features
- Don't deviate from established patterns without discussion

---

*This skill was auto-generated by [ECC Tools](https://ecc.tools). Review and customize as needed for your team.*
