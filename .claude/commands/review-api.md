# /review-api — API Route Audit

Audit all Express API routes for consistency, completeness, and correctness.

## Steps

### 1. Extract Route Map
Read `server/index.ts` and extract every route definition:
- `app.get(...)`, `app.post(...)`, `app.put(...)`, `app.delete(...)`
- Group by: public routes, admin routes, session routes

### 2. Check Each Route For
- **Auth**: Admin routes use `requireAdmin` middleware
- **Input validation**: Body/params are validated before use
- **Error handling**: try/catch with proper HTTP status codes
- **Response shape**: Consistent JSON structure
- **Path safety**: File operations use `sanitizeId()`

### 3. Check Client-Server Contract
Compare server routes with client API functions:
- `src/lib/api.ts` — Public API functions
- `src/lib/admin-api.ts` — Admin API functions
- Verify URLs match, methods match, request/response shapes align

### 4. Admin Tools Audit
Read `server/admin-tools.ts` and verify:
- All 16 tool definitions have proper parameter schemas
- `executeTool` handles all tool names
- Error responses are consistent
- No tools bypass security checks

## Output Format

### Route Map Table
| Method | Path | Auth | Validated | Status |
|--------|------|------|-----------|--------|

### Mismatches Found
- [Client calls X but server expects Y]

### Missing Error Handling
- [Route at file:line missing try/catch]

### Recommendations
- [Improvement suggestions]
