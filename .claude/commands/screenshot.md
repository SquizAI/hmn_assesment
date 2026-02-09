# /screenshot — Take App Screenshots (chrome-devtools MCP)

Capture screenshots of the running HMN Cascade application for review.

## Prerequisites
- Application must be running locally
- Chrome DevTools MCP server must be available

## Usage
`/screenshot` — Capture all key pages
`/screenshot <page>` — Capture a specific page (home, interview, admin, dashboard, sessions, assessments, chat)

## Steps

### 1. Setup
Read chrome-devtools tools: `Read ~/.claude/mcp-tools/servers/chrome-devtools/TOOLS.md`

### 2. Page Map
| Page | URL |
|------|-----|
| home | http://localhost:5173/ |
| interview | http://localhost:5173/interview |
| admin-login | http://localhost:5173/admin |
| dashboard | http://localhost:5173/admin/dashboard |
| sessions | http://localhost:5173/admin/sessions |
| assessments | http://localhost:5173/admin/assessments |
| chat | http://localhost:5173/admin/chat |

### 3. For Each Page
1. Use `navigate_page` to load the URL
2. Use `wait_for` to ensure content is loaded
3. Use `take_screenshot` to capture the viewport
4. Optionally use `resize_page` first for mobile (375x812) or tablet (768x1024) views

### 4. Admin Pages
For admin pages that require auth:
1. First navigate to login page
2. Use `fill_form` to enter credentials
3. Use `click` to submit
4. Then navigate to admin pages

### 5. Output
Present screenshots inline and note any visual issues:
- Layout breakage
- Missing content
- Styling inconsistencies
- Mobile responsiveness problems
