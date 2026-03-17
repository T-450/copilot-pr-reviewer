---
applyTo: "**/*secret*.*"
---

# Secret Handling Review Focus

Apply stricter scrutiny to files that appear to handle secrets.

- Look for hardcoded secrets, credentials, API keys, or tokens.
- Check whether sensitive values are logged, returned, or persisted insecurely.
- Treat accidental exposure of secrets or privileged configuration as a security issue.
