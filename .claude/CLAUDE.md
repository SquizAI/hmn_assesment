# HMN Cascade System — Claude Code Project Configuration

## Project Overview

HMN Cascade is a full-stack AI-powered assessment platform for evaluating organizational AI readiness. It uses conversational AI interviews, multi-dimensional scoring, and agentic admin tools.

**Stack:** React 19 + TypeScript + Express 5 + Tailwind CSS 4 + Vite 7
**AI:** Anthropic Claude (claude-sonnet-4-5-20250929) for interviews & admin chat
**Voice:** Deepgram API for transcription
**Research:** Firecrawl API for web research
**Storage:** File-based JSON (sessions/ and assessments/ directories)
**Deploy:** DigitalOcean App Platform via Dockerfile (node:22-slim)
**Repo:** github.com/SquizAI/hmn_assesment

## Architecture

```
hmn-cascade/
├── server/
│   ├── index.ts            # Express 5 monolith — ALL routes (sessions, interview, admin, auth)
│   └── admin-tools.ts      # 16 admin tool definitions + executeTool dispatcher
├── src/
│   ├── pages/              # 9 route pages (Home, Research, Interview, Analysis, Admin*)
│   ├── components/
│   │   ├── admin/          # AdminLayout, SessionDrawer, AssessmentDrawer, ChatMessage, etc.
│   │   ├── interview/      # Interview flow components
│   │   ├── analysis/       # Analysis display components
│   │   └── ui/             # Shared UI (Button)
│   ├── lib/
│   │   ├── types.ts        # Shared types (Question, Session, Analysis, Assessment, etc.)
│   │   ├── api.ts          # Client API helpers + API_BASE constant
│   │   └── admin-api.ts    # Admin-specific API functions (fetchStats, fetchSessions, etc.)
│   └── data/
│       ├── question-bank.ts    # Assessment questions
│       └── scoring-rubrics.ts  # Scoring rubric definitions
├── Dockerfile              # Multi-stage build (node:22-slim)
├── package.json            # tsx for server, vite for client
└── .env                    # Environment variables (NEVER commit)
```

## Key Patterns & Conventions

### Server
- Express 5 with native `express.json()`, cookie-parser, CORS
- JWT auth via HTTP-only cookies (`requireAdmin` middleware)
- File-based storage: `sessions/<id>.json`, `assessments/<id>.json`
- `sanitizeId()` applied to ALL file path operations (path traversal prevention)
- Rate limiting on login (5 attempts / 15min / IP)
- CORS restricted in production via `CORS_ORIGIN` env var

### Client
- React Router DOM v7 with BrowserRouter, nested routes
- Tailwind CSS 4 with @tailwindcss/vite plugin
- Dark theme: `bg-[#0a0a0f]` base, `white/[opacity]` for text, glass-morphism cards
- Admin pages under `/admin/*` with AdminLayout wrapper + ErrorBoundary
- Component pattern: functional components, hooks, local interfaces (prefixed Dashboard*, Session*, etc.)

### TypeScript
- Strict mode, all types in `src/lib/types.ts`
- Server types defined locally in server files (no shared import due to separate compilation)
- Use `as unknown as Record<string, unknown>` for interface-to-record casts

### Environment Variables (Required)
- `JWT_SECRET` — JWT signing key (server exits if missing)
- `ADMIN_PASSWORD` — Admin login password (server exits if missing)
- `ANTHROPIC_API_KEY` — Claude API access
- `DEEPGRAM_API_KEY` — Voice transcription (optional, 503 if missing)
- `FIRECRAWL_API_KEY` — Web research (optional)
- `CORS_ORIGIN` — Production CORS origin
- `PORT` — Server port (default 3001)

## Subagent Architecture

When working on this project, use specialized subagents for different areas:

### Server Security Agent
- **Scope:** `server/index.ts`, `server/admin-tools.ts`
- **Focus:** Auth middleware, path traversal, input validation, rate limiting, CORS
- **Tools:** Grep for patterns like `req.params`, `req.body`, `fs.readFileSync`
- **Checks:** No hardcoded secrets, sanitizeId on all file ops, proper error responses

### Admin UI Agent
- **Scope:** `src/pages/Admin*.tsx`, `src/components/admin/*`
- **Focus:** Component patterns, state management, UX consistency, accessibility
- **Tools:** Read components, check Tailwind patterns, verify prop types
- **Pattern:** Glass cards (`bg-white/[0.03] rounded-2xl border border-white/10`), StatusBadge for status display

### Interview Flow Agent
- **Scope:** `src/pages/InterviewPage.tsx`, `src/components/interview/*`, `src/data/*`
- **Focus:** Question flow, AI conversation, voice recording, progress tracking
- **Tools:** Read question bank, verify scoring dimensions, check API calls

### Analysis Agent
- **Scope:** `src/pages/AnalysisPage.tsx`, `src/components/analysis/*`
- **Focus:** Score display, dimension charts, archetype rendering, recommendations
- **Tools:** Read scoring rubrics, verify analysis types, check visualizations

### API Agent
- **Scope:** `server/index.ts` (routes), `src/lib/admin-api.ts`, `src/lib/api.ts`
- **Focus:** Route consistency, request/response shapes, error handling, auth flow
- **Tools:** Grep for `app.get`, `app.post`, `app.put`, `app.delete` patterns

### Deployment Agent
- **Scope:** `Dockerfile`, `package.json`, `.env`, DigitalOcean config
- **Focus:** Build pipeline, environment config, container health, production readiness
- **Tools:** Docker build, doctl commands, env verification

## MCP Server Usage

### chrome-devtools (Browser Testing)
Use for: Screenshots, performance traces, DOM inspection, network monitoring
```
Read ~/.claude/mcp-tools/servers/chrome-devtools/TOOLS.md first
Key tools: take_screenshot, navigate_page, performance_start_trace, evaluate_script
```

### firecrawl (Web Research)
Use for: Competitor analysis, industry research, content scraping
```
Read ~/.claude/mcp-tools/servers/firecrawl/TOOLS.md first
Key tools: firecrawl_scrape, firecrawl_search, firecrawl_crawl
```

### supabase (Database — Future Migration)
Use for: Planning migration from file-based to Supabase
```
Key tools: execute_sql, apply_migration, list_tables
```

### netlify (Static Hosting — Alternative)
Use for: Deploying static frontend if needed
```
Read ~/.claude/mcp-tools/servers/netlify/TOOLS.md first
```

## Build & Run

```bash
# Development
npm install
npm run dev          # Vite dev server + tsx watch

# Production build
npm run build        # Vite build (outputs to dist/)
npm start            # tsx server/index.ts (serves dist/ + API)

# Docker
docker build -t hmn-cascade .
docker run -p 3001:3001 --env-file .env hmn-cascade

# Type check
npx tsc --noEmit
```

## Code Executor Configuration

When running subagents that need code execution:
- Use `tsx` for TypeScript execution (already in devDependencies)
- Use `npx tsc --noEmit` for type checking without build
- Use `npm run build` for full production build
- Docker commands available via `docker` CLI
- DigitalOcean CLI available via `doctl`
- GitHub CLI available via `gh`

## Quality Gates

Before committing:
1. `npx tsc --noEmit` — Zero TypeScript errors
2. `npm run build` — Clean Vite build
3. No hardcoded secrets in code
4. All file operations use `sanitizeId()`
5. All admin routes use `requireAdmin` middleware
