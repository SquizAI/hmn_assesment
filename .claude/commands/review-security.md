# /review-security — Security Audit

Perform a comprehensive security audit of the HMN Cascade server code.

## Audit Scope

### 1. Authentication & Authorization
- Read `server/index.ts` and verify:
  - `requireAdmin` middleware is applied to ALL `/api/admin/*` routes
  - JWT tokens use proper expiration (check `expiresIn`)
  - HTTP-only, secure cookie flags are set
  - Login rate limiting is working (check `loginAttempts` Map)
  - No auth bypass paths exist

### 2. Input Validation & Path Traversal
- Verify `sanitizeId()` is called in:
  - `sessionPath()` in server/index.ts
  - `sessionPath()` in server/admin-tools.ts
  - `assessmentPath()` in server/admin-tools.ts
  - Any other `req.params.id` or `req.body.id` usage
- Check for unsanitized user input in file operations
- Search for `fs.readFileSync`, `fs.writeFileSync`, `fs.unlinkSync` without sanitization

### 3. API Security
- CORS configuration review (should be restricted in production)
- Content-Type validation on POST/PUT endpoints
- Response data leakage (no stack traces, internal paths in errors)
- Rate limiting coverage

### 4. Secret Management
- Grep for hardcoded strings that look like secrets, API keys, passwords
- Verify all secrets come from `process.env`
- Check that `.env` is gitignored
- Verify server exits on missing critical env vars

### 5. Injection Risks
- Check admin chat tool execution (`executeTool` in admin-tools.ts) for injection
- Verify Anthropic API calls don't pass unsanitized user input as system prompts
- Check for any `eval()`, `Function()`, or dynamic code execution

## Output Format

Provide findings as:

### Critical (Must Fix)
- [Finding with file:line reference and fix suggestion]

### Warning (Should Fix)
- [Finding with context]

### Good Practices Found
- [Positive security patterns already in place]

Use subagents to scan server/index.ts and server/admin-tools.ts in parallel.
