# Deployment & Cleanup Plan — March 22, 2026

## Current State

| Item | Status |
|------|--------|
| Code changes (29 files, 1,972 lines) | DEPLOYED (commit 76e96d1, auto-deployed via DigitalOcean) |
| cascade_profiles migration | APPLIED (via Supabase MCP) |
| Dashboard | WORKING (confirmed via Chrome DevTools) |
| Build | CLEAN (zero TypeScript errors, 577 modules) |
| Playwright tests | 15/15 PASSING against live site |
| All 11 admin pages | VERIFIED WORKING via Chrome DevTools walkthrough |

## Outstanding Work (5 Workstreams)

### WS-1: Upload Combined Assessment Config [CRITICAL]
**Agent: config-agent**

Upload `assessments/combined-readiness-adaptability.json` to Supabase `cascade_assessment_configs` table.
This enables the merged Cascade + Adaptability assessment (5 phases, 16 sections, 12 scoring dimensions).

Steps:
1. Read the combined assessment JSON file
2. Insert into `cascade_assessment_configs` via Supabase MCP
3. Verify it appears on the live Assessments page

### WS-2: Commit & Push Supporting Files [HIGH]
**Agent: git-agent**

Commit the docs, tests, and config files not yet in version control:
- `docs/ux-user-flows.md` — UX user flows documentation
- `data-flow-architecture.md` — Architecture documentation with Mermaid diagrams
- `playwright.config.ts` — E2E test configuration
- `tests/admin.spec.ts` — Admin E2E test suite (15 tests)
- `tests/diagnostic.spec.ts` — Diagnostic test
- `.gitignore` — Updated ignore patterns
- `package.json` / `package-lock.json` — Added @playwright/test dependency
- `migrations/002_cascade_profiles.sql` — The migration we already applied

Steps:
1. Stage all relevant files
2. Commit with descriptive message
3. Push to master (triggers auto-deploy, but these are just docs/tests — no code changes)

### WS-3: Fix Data Flow Gaps [HIGH]
**Agent: fixes-agent**

Address the top gaps found in the code audit:

1. **Analytics route legacy reference** — `server/routes/analytics.ts` references `cascade_analyses` which may not exist. Add graceful fallback or switch to `cascade_profiles`.
2. **Search route legacy lookup** — `server/routes/search.ts` references session analysis data. Ensure fallback exists.
3. **Profile stats empty-state** — `GET /api/admin/profile-stats` endpoint in `server/index.ts` needs to handle empty `cascade_profiles` gracefully (zero rows).
4. **Vapi call completion** — Verify the Vapi webhook handler at `POST /api/vapi/webhook` in `server/index.ts` calls `completeAssessment()` when a call-based assessment finishes.

### WS-4: Create .env.example [MEDIUM]
**Agent: git-agent (same as WS-2)**

Create a `.env.example` file with placeholder values so future developers know what env vars are needed, without exposing real secrets.

### WS-5: Final Verification [HIGH]
**Agent: test-agent**

After WS-1 through WS-4 are done:
1. Run `npm run build` to verify build still passes
2. Run Playwright tests against live site
3. Verify the combined assessment appears on the Assessments page
4. Take final screenshots of all pages via Chrome DevTools

## Execution Order

```
WS-1 (config upload)  ──┐
WS-3 (data flow fixes) ─┤──▶ WS-2 (commit & push) ──▶ WS-5 (verify)
WS-4 (.env.example)   ──┘
```

WS-1, WS-3, WS-4 can run in parallel (no dependencies).
WS-2 runs after all changes are made.
WS-5 runs last to verify everything.
