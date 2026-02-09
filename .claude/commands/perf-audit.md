# /perf-audit — Performance Audit (chrome-devtools MCP)

Run a performance audit on the running HMN Cascade application using the chrome-devtools MCP server.

## Prerequisites
- Application must be running locally (`npm run dev` or `npm start`)
- Chrome DevTools MCP server must be available

## Steps

### 1. Setup
First, read the chrome-devtools tools reference:
```
Read ~/.claude/mcp-tools/servers/chrome-devtools/TOOLS.md
```

### 2. Navigate to Key Pages
Test these critical paths:
- **Home page**: `http://localhost:5173/` (or production URL)
- **Interview page**: `http://localhost:5173/interview`
- **Admin dashboard**: `http://localhost:5173/admin/dashboard`
- **Admin sessions**: `http://localhost:5173/admin/sessions`

For each page:
1. Use `navigate_page` to load the page
2. Use `performance_start_trace` to begin recording
3. Wait for page to fully load
4. Use `performance_stop_trace` to end recording
5. Use `performance_analyze_insight` to get analysis

### 3. Check Network
Use `list_network_requests` to identify:
- Slow API calls (> 500ms)
- Large payloads
- Unnecessary requests
- Missing caching headers

### 4. Check Console
Use `list_console_messages` to find:
- Runtime errors
- Warnings
- Deprecation notices

### 5. Bundle Analysis
Check the built JS/CSS sizes:
- Main JS bundle should be < 500KB
- CSS should be < 100KB
- Check for large dependencies that could be code-split

### 6. Report
Provide performance scorecard:
| Page | Load Time | Network Requests | Console Errors | Score |
|------|-----------|-----------------|----------------|-------|

Plus specific recommendations for improvement.
