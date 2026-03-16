# Security Review Instructions Example

Copy this file to `.github/instructions/security.instructions.md` in your repository
to provide security-focused review guidance for high-risk files.

---

applyTo: "**/auth/**,**/security/**,**/crypto/**,**/middleware/**"

## Security Review Focus

When reviewing files in authentication, security, cryptography, or middleware paths,
apply heightened scrutiny:

### Authentication & Authorization

- Verify all endpoints check authentication before processing
- Ensure authorization checks match the required permission level
- Look for privilege escalation paths
- Check token validation is complete (signature, expiry, audience, issuer)

### Input Validation

- All user inputs must be validated before use
- Check for injection vulnerabilities (SQL, command, LDAP, XPath)
- Verify file upload restrictions (type, size, content validation)
- Ensure URL redirects are validated against an allowlist

### Cryptography

- No custom cryptography implementations
- Verify use of current algorithms (AES-256, RSA-2048+, SHA-256+)
- Check for hardcoded secrets, keys, or credentials
- Ensure secrets are loaded from environment or vault, never committed

### Data Protection

- PII must not appear in logs or error messages
- Verify sensitive data is encrypted at rest and in transit
- Check for information disclosure in error responses
- Ensure proper data sanitization before display (XSS prevention)

### Session & Cookie Security

- Verify HttpOnly and Secure flags on sensitive cookies
- Check session timeout and renewal policies
- Ensure CSRF protection on state-changing operations
