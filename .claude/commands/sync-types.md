# /sync-types — Detect Type Drift Between Server & Client

Check for type mismatches between the server (Express) and client (React) code.

## Problem
The server and client share conceptual types but don't share imports (separate compilation). This command detects when they drift apart.

## Steps

### 1. Extract Server Types
Read `server/index.ts` and `server/admin-tools.ts`, identify:
- All `interface` and `type` declarations
- Request body shapes (from `req.body` usage)
- Response shapes (from `res.json()` calls)
- Tool parameter schemas in admin-tools.ts

### 2. Extract Client Types
Read `src/lib/types.ts` — the canonical type definitions
Read `src/lib/api.ts` and `src/lib/admin-api.ts` — API call shapes

### 3. Compare
For each API endpoint, verify:
- Client sends what server expects (request body shape)
- Server returns what client expects (response shape)
- Field names match exactly (no typos like `assessmentTypeId` vs `assessment_type_id`)
- Optional vs required fields align

### 4. Check Local Types
Pages define local interfaces (e.g., `DashboardStats`, `DashboardSession`).
Verify these match the actual API response shapes from the server.

Files to check:
- `src/pages/AdminDashboardPage.tsx` — DashboardStats, DashboardFunnelStage, etc.
- `src/pages/AdminSessionsPage.tsx` — Session interface
- `src/pages/AdminAssessmentsPage.tsx` — local assessment types

### 5. Report
| Endpoint | Server Shape | Client Shape | Status |
|----------|-------------|--------------|--------|
| GET /api/admin/stats | {...} | DashboardStats | ✓/✗ |

Flag any mismatches with specific field differences.
