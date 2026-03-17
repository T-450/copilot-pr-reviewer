---
applyTo: "**/*auth*.*"
---

# Authentication Review Focus

Apply stricter scrutiny to authentication-related code.

- Look for missing authorization checks and privilege escalation paths.
- Verify token, session, and credential handling for leaks or trust-boundary mistakes.
- Prefer security findings when an auth flaw could expose data or bypass access control.
