# /lighthouse — Lighthouse-Style Audit (chrome-devtools MCP)

Run a comprehensive web quality audit covering performance, accessibility, best practices, and SEO.

## Prerequisites
- Application must be running locally
- Chrome DevTools MCP server must be available

## Steps

### 1. Setup
Read chrome-devtools tools: `Read ~/.claude/mcp-tools/servers/chrome-devtools/TOOLS.md`

### 2. Performance Metrics
For the home page and admin dashboard:
1. Use `navigate_page` to load the page
2. Use `performance_start_trace` + `performance_stop_trace`
3. Use `performance_analyze_insight` for metrics
4. Use `evaluate_script` to get Web Vitals:
   ```js
   JSON.stringify({
     LCP: performance.getEntriesByType('largest-contentful-paint').pop()?.startTime,
     FID: performance.getEntriesByType('first-input').pop()?.processingStart,
     CLS: performance.getEntriesByType('layout-shift').reduce((a, b) => a + b.value, 0)
   })
   ```

### 3. Accessibility Check
Use `evaluate_script` to run checks:
- Images without alt text
- Buttons without labels
- Color contrast issues
- Missing ARIA attributes
- Keyboard trap detection
- Focus order verification

### 4. Best Practices
Check via `evaluate_script`:
- HTTPS usage
- No mixed content
- Console errors/warnings
- Deprecated APIs
- Proper viewport meta tag

### 5. SEO Basics
Check via `evaluate_script` and `take_snapshot`:
- Meta title and description
- Heading hierarchy (h1, h2, h3)
- Mobile viewport
- Robots meta

### 6. Report Card
| Category | Score | Key Issues |
|----------|-------|------------|
| Performance | /100 | ... |
| Accessibility | /100 | ... |
| Best Practices | /100 | ... |
| SEO | /100 | ... |

Plus detailed findings and fix recommendations with file:line references.
