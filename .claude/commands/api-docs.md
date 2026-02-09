# /api-docs — Generate API Documentation

Auto-generate API documentation from the Express server routes.

## Steps

### 1. Parse Routes
Read `server/index.ts` and extract all route definitions:
- HTTP method (GET, POST, PUT, DELETE)
- Path pattern
- Authentication requirement (requireAdmin middleware)
- Request body shape (from destructuring or validation)
- Response shape (from res.json calls)

### 2. Parse Admin Tools
Read `server/admin-tools.ts` and extract:
- Tool definitions (name, description, parameters)
- The `executeTool` dispatcher mapping

### 3. Generate Documentation

Output structured API documentation in this format:

## Public Endpoints

### POST /api/sessions
**Auth:** None
**Body:** `{ participant: { name, role, company, industry, teamSize, email? }, assessmentTypeId? }`
**Response:** `{ session: InterviewSession }`

### GET /api/sessions/:id
**Auth:** None
**Body:** None
**Response:** `InterviewSession`

... (continue for all routes)

## Admin Endpoints

### POST /api/admin/login
**Auth:** None (rate limited: 5/15min)
**Body:** `{ password: string }`
**Response:** `{ ok: true }` + sets JWT cookie

... (continue for all admin routes)

## Admin Chat Tools

### list_assessments
**Description:** ...
**Parameters:** None
**Returns:** ...

... (continue for all 16 tools)

### 4. Output Options
Ask the user:
- Display inline (default)
- Write to `API.md` in project root
- Write as JSON OpenAPI spec
