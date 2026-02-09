# /env-check — Environment Variable Verification

Verify all required and optional environment variables are properly configured.

## Steps

1. **Read `.env` file** at `/Users/mattysquarzoni/test questions /hmn-cascade/.env` (if it exists).

2. **Check required variables** — These MUST be set or the server will crash:
   - `JWT_SECRET` — JWT signing key (must be strong, 32+ chars recommended)
   - `ADMIN_PASSWORD` — Admin login password
   - `ANTHROPIC_API_KEY` — Starts with `sk-ant-`

3. **Check optional variables** — These enable features:
   - `DEEPGRAM_API_KEY` — Voice transcription (server returns 503 if missing)
   - `FIRECRAWL_API_KEY` — Web research capabilities
   - `CORS_ORIGIN` — Production CORS whitelist (e.g., `https://yourdomain.com`)
   - `PORT` — Server port (default: 3001)

4. **Security checks**:
   - Verify `.env` is in `.gitignore`
   - Check that no secrets appear in committed files (grep server/index.ts and server/admin-tools.ts for hardcoded keys)
   - Verify JWT_SECRET is not a weak default

5. **Report** — Output a table:
   | Variable | Status | Notes |
   |----------|--------|-------|
   | JWT_SECRET | ✓/✗ | Required |
   | ... | ... | ... |

IMPORTANT: Never display actual secret values — only confirm presence/absence and format validity.
