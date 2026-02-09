# /build-check — Full Build Verification

Run a complete build verification pipeline for the HMN Cascade project.

## Steps

1. **TypeScript Check** — Run `npx tsc --noEmit` in the project root at `/Users/mattysquarzoni/test questions /hmn-cascade/` and report any type errors with file locations and descriptions.

2. **Vite Build** — Run `npm run build` in the project root and capture:
   - Build success/failure
   - Output bundle sizes (JS and CSS)
   - Any warnings

3. **Environment Check** — Verify `.env` file exists and contains required variables:
   - JWT_SECRET
   - ADMIN_PASSWORD
   - ANTHROPIC_API_KEY

4. **Report** — Summarize results in a clear table:
   | Check | Status | Details |
   |-------|--------|---------|
   | TypeScript | ✓/✗ | Error count |
   | Vite Build | ✓/✗ | Bundle size |
   | Env Vars | ✓/✗ | Missing vars |

If any check fails, provide specific fix suggestions with file paths and line numbers.
