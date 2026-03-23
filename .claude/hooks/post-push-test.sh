#!/usr/bin/env bash
# PostToolUse hook — detects git push and injects post-deploy testing instructions
set -euo pipefail

# Read tool input from stdin (Claude Code passes JSON via stdin for PostToolUse hooks)
INPUT=$(cat)

# Extract the command from the tool input JSON
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

# Only trigger on git push commands
if ! echo "$COMMAND" | grep -qE '^\s*git\s+push'; then
  exit 0
fi

# Inject post-push testing instructions
cat <<'HOOK_EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "<post-push-testing>\nYou just pushed code. Run the post-deploy testing procedure:\n\n## Phase 1: Wait for Deployment\n1. Check deployment status: `doctl apps list-deployments 5ae951d9-b034-4d72-82a2-3a89e0f1332d --format ID,Phase,Progress --no-header | head -1`\n2. If not ACTIVE, wait 30s and re-check (up to 5 minutes)\n3. Once ACTIVE, proceed to Phase 2\n\n## Phase 2: Firecrawl Smoke Test\n1. Create cloud browser: `firecrawl_browser_create` (ttl: 300)\n2. Navigate to https://cascade.behmn.com/admin\n3. Log in with password: hmn2026admin\n4. Test each page (Dashboard, Sessions, Contacts, Calls, Companies, Analytics, Search):\n   - Navigate to page\n   - Verify it loads (take snapshot)\n   - Check for errors\n5. Delete browser session when done\n6. Report pass/fail per page\n\n## Phase 3: Playwright E2E Tests\n1. Run: `npx playwright test --reporter=list` from the hmn-cascade project directory\n2. Report results summary (passed/failed/skipped)\n3. If failures, show error details\n\n## Phase 4: Report\nSummarize all results:\n- Deployment status\n- Firecrawl smoke test: X/7 pages passed\n- Playwright: X passed, Y failed\n- Any errors or issues found\n</post-push-testing>"
  }
}
HOOK_EOF
