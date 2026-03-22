# HMN Cascade — UX User Flows & Navigation Map

> How everything connects, where to find it, and how data moves through the system.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Participant Journey](#participant-journey)
3. [Admin Dashboard & Navigation](#admin-dashboard--navigation)
4. [Page-by-Page Reference](#page-by-page-reference)
5. [Data Flow Map](#data-flow-map)
6. [AI Co-Pilot Integration](#ai-co-pilot-integration)
7. [Outreach Flow (Campaigns → Calls)](#outreach-flow)
8. [Cross-Page Connections](#cross-page-connections)
9. [Quick-Find Guide](#quick-find-guide)

---

## System Overview

HMN Cascade is a full assessment-to-outreach platform with two user types:

| User Type | Entry Point | Purpose |
|-----------|-------------|---------|
| **Participant** | `cascade.behmn.com/?invite={token}` | Take AI-driven assessments |
| **Admin** | `cascade.behmn.com/admin/dashboard` | Manage everything, view insights |

```
┌─────────────────────────────────────────────────────────────────┐
│                     HMN CASCADE PLATFORM                        │
│                                                                 │
│  ┌──────────────────┐         ┌──────────────────────────────┐  │
│  │  PARTICIPANT SIDE │         │         ADMIN SIDE           │  │
│  │                  │         │                              │  │
│  │  Home → Research │         │  Dashboard ─┬─ Sessions      │  │
│  │    → Interview   │────────▶│             ├─ Invitations   │  │
│  │    → Analysis    │ results │             ├─ Companies     │  │
│  │                  │         │             ├─ Assessments   │  │
│  │                  │         │             ├─ Builder       │  │
│  │                  │         │  Outreach  ─┤                │  │
│  │                  │◀────────│             ├─ Campaigns     │  │
│  │                  │ invites │             ├─ Contacts      │  │
│  │                  │         │             ├─ Calls         │  │
│  │                  │         │  Tools     ─┤                │  │
│  │                  │         │             ├─ Analytics     │  │
│  │                  │         │             ├─ Search        │  │
│  │                  │         │             ├─ Webhooks      │  │
│  │                  │         │             └─ Settings      │  │
│  │                  │         │                              │  │
│  │                  │         │  🤖 AI Co-Pilot (every page) │  │
│  └──────────────────┘         └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Participant Journey

The complete flow a participant goes through from invitation to results.

### Flow Diagram

```
  INVITATION                INTAKE                 RESEARCH
  ─────────               ─────────               ──────────
  Admin sends     →    Participant clicks   →   AI researches
  email with           invite link, fills       company via
  invite token         name/role/company        Firecrawl
       │                     │                      │
       │                     ▼                      ▼
       │              POST /api/sessions     POST /api/research
       │              status: "intake"       Confirms findings
       │                     │                      │
       ▼                     ▼                      ▼

  INTERVIEW              AI CONVERSATION         ANALYSIS
  ──────────             ────────────────        ──────────
  Multi-phase      →    Claude generates   →   Claude scores
  questions              follow-ups,            8 dimensions,
  (slider, text,         probes deeper          assigns archetype,
  voice, choice)                                finds gaps
       │                     │                      │
       │                     ▼                      ▼
       │              Deepgram transcribes    POST /api/analyze
       │              voice responses         status: "analyzed"
       │                     │                      │
       ▼                     ▼                      ▼

  RESULTS PAGE           PROFILE CREATED         ADMIN SEES
  ─────────────          ────────────────        ────────────
  Score (0-100)    →    cascade_profiles   →   Dashboard stats,
  Archetype             row created             session details,
  Dimension radar       with all scores         company insights
  Gap analysis
  PDF download
```

### Step-by-Step

| Step | Page | URL | What Happens |
|------|------|-----|--------------|
| 1 | Email | (external) | Admin sends invitation email with unique token |
| 2 | **Home** | `/?invite={token}` | Token validated, intake form shown (name, role, company, email, industry) |
| 3 | **Research** | `/research/:sessionId` | Firecrawl gathers company intelligence; participant confirms findings |
| 4 | **Interview** | `/interview/:sessionId` | Multi-phase AI interview — questions adapt based on assessment type |
| 5 | **Analysis** | `/analysis/:sessionId` | Results displayed: score, archetype, dimensions, gaps, recommendations |
| 6 | (optional) | `/adaptability-profile/:sessionId` | Separate adaptability-specific results view |
| 7 | (optional) | `/compare` | Side-by-side comparison of multiple profiles |

### Resume Flow

Participants can resume an incomplete assessment:

```
Home Page → "Continue Assessment" → Enter email
  → GET /api/sessions/lookup
  → Shows list of sessions for that email
  → Select session → Routes based on status:
      intake/in_progress → /interview/:id
      completed/analyzed → /analysis/:id
      research          → /research/:id
```

### Assessment Types Available

| Assessment | Slug | Questions | Duration |
|------------|------|-----------|----------|
| AI Readiness Assessment | `ai-readiness` | 43 | ~25 min |
| Reality Gap — Employee Edition | `employee-reality-gap` | 24 | ~35 min |
| Adaptive Intelligence Index | `adaptability-index-v1` | 33 | ~32 min |
| Post-Masterclass Survey (Cohort 2) | `post-masterclass-survey-cohort-2` | 22 | ~8 min |
| Post-Masterclass Survey (Founding) | `post-masterclass-survey` | 21 | ~8 min |
| Leadership Adaptability | `leadership-adaptability` | 14 | ~30 min |
| Client Service Excellence | `client-service-excellence` | 14 | ~30 min |
| Team Innovation & Culture | `team-innovation-culture` | 12 | ~30 min |
| Digital Marketing Maturity | `digital-marketing-maturity` | 14 | ~30 min |
| Creative AI Readiness | `creative-ai-readiness` | 14 | ~20 min |
| Adaptability for AI Transformation | `adaptability-ai-transformation` | 22 | ~40 min |

---

## Admin Dashboard & Navigation

### Sidebar Structure

The admin sidebar is organized into three sections:

```
┌──────────────────────────┐
│  🏠 Cascade Admin        │
│                          │
│  CORE                    │
│  ├─ 📊 Dashboard         │  ← KPIs, graphs, funnel
│  ├─ 💬 Sessions     (32) │  ← All interview sessions
│  ├─ ✉️  Invitations  (46) │  ← Send & track invites
│  ├─ 🏢 Companies    (15) │  ← Company profiles
│  ├─ 📋 Assessments  (12) │  ← Assessment templates
│  └─ 🔧 Builder           │  ← Create/edit assessments
│                          │
│  OUTREACH                │
│  ├─ 📢 Campaigns         │  ← Outbound call campaigns
│  ├─ 👥 Contacts          │  ← Contact database
│  └─ 📞 Calls             │  ← Call history & transcripts
│                          │
│  TOOLS                   │
│  ├─ 📈 Analytics         │  ← Deep analytics & export
│  ├─ 🔍 Search            │  ← Cross-entity search
│  ├─ 🔗 Webhooks          │  ← Event integrations
│  └─ ⚙️  Settings          │  ← Retention & config
│                          │
│  🤖 AI Assistant         │  ← Available on every page
└──────────────────────────┘
```

### Authentication

- Login at `/admin` or `/admin/dashboard` (redirects to login if not authenticated)
- Password-based auth → JWT stored in HTTP-only cookie
- Logout button in header clears cookie

---

## Page-by-Page Reference

### Dashboard (`/admin/dashboard`)

**What you see:**
- Sessions Tracked count (e.g., 32) with completion rate
- Top Theme badge (from Neo4j theme extraction)
- Growth Timeline chart (sessions over time)
- Stat cards: Total Sessions, Completion Rate, Avg Score, Graph status
- Neo4j Knowledge Graph visualization (69 nodes, 114 edges)
- Dimension Radar chart (avg across all scored sessions)
- Archetype Distribution bars
- Risk Signals panel
- Company Leaderboard (top 10 companies by activity)
- Theme Intelligence cloud
- Completion Funnel (Intake → In Progress → Completed → Analyzed)
- Industry Benchmarks

**Filters at top:** Company, Assessment, Date Range, Industry, Archetype

**Links to:** Companies (via leaderboard click), Sessions (via stat card)

---

### Sessions (`/admin/sessions`)

**What you see:**
- Status summary pills: Total (32), In Progress (24), Researched (1), Completed (5), Analyzed (0)
- Filterable table: Name, Company, Assessment, Status, Responses, Activity
- Filters: Status, Assessment Type, Company, Time Range
- Export button (CSV/JSON)

**Actions:** Click row → opens Session Drawer with full details (responses, analysis, transcript)

**Data source:** `cascade_sessions` table

---

### Invitations (`/admin/invitations`)

**What you see:**
- Status summary: Total (46), Sent (20), Opened (3), Started (23), Completed (0)
- Table: Participant, Email, Assessment, Status, Activity, Actions
- Filters: Status, Assessment Type

**Actions:**
- **New Invitation** → Create single invite (name, email, company, assessment)
- **Bulk Import** → CSV upload for batch invitations
- **Copy** → Copy invite link to clipboard
- **Resend** → Re-send invitation email
- **Delete** → Remove invitation

**Data source:** `cascade_invitations` table

---

### Companies (`/admin/companies`)

**What you see:**
- Company count (15 companies across all sessions)
- Card per company showing: Name, Industry, Research badge, Sessions count, People count, Avg Score, Completion %, Last activity

**Actions:**
- **Search** companies or industries
- **Sort** by Recent Activity, Most Sessions, Highest Score
- **New Company** button
- Click company → Company Detail page

**Data source:** Aggregated from `cascade_sessions` (grouped by company)

---

### Company Detail (`/admin/companies/:company`)

**What you see:**
- Company header with industry, total sessions, people
- Session list for that company
- Research data (Firecrawl results)
- Company-level analytics (dimension averages, score distribution)

**Links from:** Companies page (row click), Dashboard leaderboard

---

### Assessments (`/admin/assessments`)

**What you see:**
- Assessment template cards in 3-column grid
- Status tabs: All (12), Active (11), Draft (0), Archived (1)
- Each card shows: Title, Description, Question count, Duration, Slug
- Stat row: Total, Active, Draft, Archived

**Actions per card:**
- **Archive/Reactivate** → Toggle status
- **Duplicate** → Clone assessment with new ID
- **Preview** → Test as participant (`/admin/preview/:id`)
- **Edit** → Open in Builder

---

### Builder (`/admin/builder` or `/admin/builder/:id`)

**What you see:**
- Full assessment editor with drag-and-drop question ordering
- Phase/Section structure management
- Question editor: text, type, options, weights, AI prompts, triggers, tags
- Scoring dimension configuration
- Assessment metadata (name, slug, description, duration, status)

**Links from:** Assessments page (Edit button), AI Co-pilot (via "Build a new assessment" quick action)

---

### Campaigns (`/admin/campaigns`)

**What you see:**
- Campaign list with: Name, Status, Contact count, Calling progress
- Expandable "View Results" section per campaign showing avg score, archetype breakdown

**Actions:**
- Create new campaign
- Link contacts to campaign
- Initiate batch calls
- View campaign results

**Data source:** `cascade_campaigns` table

---

### Contacts (`/admin/contacts`)

**What you see:**
- Contact list: Name, Phone, Email, Company, Role, Industry, Status
- Expandable row with linked assessment history

**Actions:**
- Add single contact
- Batch import (CSV)
- Initiate call for individual contact
- Delete contact
- View linked assessments

**Data source:** `cascade_contacts` table

---

### Calls (`/admin/calls`)

**What you see:**
- Call history table: Contact, Phone, Status, Duration, Transcript preview
- Profile column with archetype badge + color-coded score

**Actions:**
- View call transcript
- Check call status
- Initiate new call

**Data source:** `cascade_calls` table

---

### Analytics (`/admin/analytics`)

**What you see:**
- 5 tabs: **Overview**, **Dimensions**, **Distribution**, **Trends**, **Gaps & Industry**
- Time range filters: 7 Days, 30 Days, 90 Days, All Time
- Overview: Total Assessments, Avg Score, Completion Rate, Avg Call Duration
- Charts: Assessments Over Time, Score Distribution, Archetype Distribution, Top Dimensions

**Actions:**
- **Export Assessments** (CSV)
- **Export Profiles** (CSV)

**Data source:** Aggregated from `cascade_sessions`, `cascade_profiles`, `cascade_calls`

---

### Search (`/admin/search`)

**What you see:**
- Search box with placeholder: "Search by name, company, email, industry..."
- Tab filters: All, Sessions, Contacts, Calls, **Profiles**

**How it works:**
- Searches across `cascade_sessions`, `cascade_contacts`, `cascade_calls`, `cascade_profiles`
- Profile search matches: participant_name, company, archetype, executive_summary
- Results shown as clickable cards

---

### Webhooks (`/admin/webhooks`)

**What you see:**
- List of configured webhooks with: URL, Campaign assignment, Event types, Toggle
- Event type badges (e.g., `call.completed`, `session.analyzed`)

**Actions:**
- **Add Webhook** → URL, events, optional campaign filter
- **Test** → Send test payload
- **Edit** → Modify webhook config
- **Delete** → Remove webhook
- **Toggle** → Enable/disable

**Data source:** `cascade_webhooks` table

---

### Settings (`/admin/settings`)

**What you see:**
- Data Retention section:
  - Retention Period dropdown (30 Days → Forever)
  - Auto-cleanup toggle (runs daily)
  - Save Settings button
  - Run Cleanup Now button

**Data source:** `cascade_settings` table

---

## Data Flow Map

### How Data Moves Through the System

```
                    ┌─────────────────┐
                    │   INVITATIONS   │
                    │  (46 records)   │
                    └────────┬────────┘
                             │ invite token
                             ▼
┌──────────┐       ┌─────────────────┐       ┌──────────────┐
│ CONTACTS │──────▶│    SESSIONS     │──────▶│   PROFILES   │
│ (3 recs) │ link  │  (32 records)   │ gen   │  (0 so far)  │
└──────────┘       └────────┬────────┘       └──────┬───────┘
     │                      │                       │
     │              ┌───────┴────────┐              │
     ▼              ▼                ▼              ▼
┌──────────┐  ┌──────────┐  ┌────────────┐  ┌───────────┐
│  CALLS   │  │RESPONSES │  │  ANALYSIS  │  │ NEO4J     │
│ (2 recs) │  │(200 recs)│  │  (Claude)  │  │ GRAPH     │
└──────────┘  └──────────┘  └────────────┘  │ (69 nodes)│
     │                            │          └───────────┘
     ▼                            ▼
┌──────────┐              ┌────────────┐
│CAMPAIGNS │              │ DASHBOARD  │
│ (1 rec)  │              │  STATS     │
└──────────┘              └────────────┘
```

### Table Relationships

| Parent Table | Child/Related Table | Relationship |
|-------------|-------------------|--------------|
| `cascade_invitations` | `cascade_sessions` | invitation.token → session created on accept |
| `cascade_sessions` | `cascade_responses` | session_id FK (200 answer records) |
| `cascade_sessions` | `cascade_conversation_history` | session_id FK (246 AI exchanges) |
| `cascade_sessions` | `cascade_profiles` | session_id UNIQUE (1:1 profile per session) |
| `cascade_sessions` | `cascade_analyses` | session_id FK (analysis results) |
| `cascade_contacts` | `cascade_calls` | contact_id FK |
| `cascade_contacts` | `cascade_sessions` | contact_id FK (optional) |
| `cascade_campaigns` | `cascade_contacts` | campaign_id FK |
| `cascade_assessment_configs` | `cascade_sessions` | assessment type reference |
| `cascade_webhooks` | `cascade_webhook_deliveries` | webhook_id FK |

---

## AI Co-Pilot Integration

### Where It Lives

The AI Assistant button appears in the **bottom-left of every admin page**. It opens a chat drawer with:

- Context-aware responses (knows which page you're on)
- File upload support (CSV, JSON, YAML, Markdown, TXT)
- Quick action buttons
- Tool execution visualization

### Quick Actions (Always Available)

| Button | What It Does |
|--------|-------------|
| "Create invitations from a list" | Opens CSV/paste interface to batch-create invitations |
| "Show me all companies" | Lists all companies with stats |
| "View recent sessions" | Shows latest sessions |
| "Build a new assessment" | Starts assessment creation wizard |

### What the Co-Pilot Can Do (24+ Tools)

**Data Queries:**
- List/search sessions, companies, invitations, contacts
- Query profiles by archetype, score range, company
- Compare multiple profiles side-by-side
- Get company insights and campaign results
- Run gap analysis across participants

**Actions:**
- Create, update, archive, duplicate assessments
- Add/edit/remove/reorder questions
- Create single or batch invitations
- Export sessions to CSV/JSON
- Delete sessions

**AI Analysis:**
- Analyze session transcripts
- Suggest next actions for a participant
- Generate company-level insights
- Run scoring calibration

### Page Context Awareness

The co-pilot header shows "Chatting from: [Page Name]" and prioritizes tools relevant to your current page:

| Current Page | Co-Pilot Focus |
|-------------|----------------|
| Dashboard | Stats, funnel, company insights |
| Sessions | Session details, transcript analysis, export |
| Invitations | Create/batch invitations, check status |
| Companies | Company detail, cross-session analysis |
| Assessments | Assessment CRUD, question management |
| Campaigns | Campaign results, contact management |
| Analytics | Profile queries, gap analysis, benchmarks |

---

## Outreach Flow

### Campaign → Contact → Call → Assessment Pipeline

```
Step 1: CREATE CAMPAIGN
  Admin → Campaigns page → "New Campaign"
  Sets: Name, calling window, timezone, max concurrent
  Status: new → scheduled → active → completed

Step 2: ADD CONTACTS
  Admin → Contacts page → "Add Contact" or "Bulk Import"
  Each contact: name, phone, email, company, role
  Can assign to campaign

Step 3: INITIATE CALLS
  Option A: Contacts page → select contacts → "Call"
  Option B: Campaign page → "Start Calling"
  Uses Vapi for outbound voice calls
  Context sent before call (participant details)

Step 4: CALL COMPLETES
  Vapi webhook fires → call transcript saved
  If assessment triggered:
    → New session created
    → Linked to contact + campaign
    → Participant completes assessment

Step 5: RESULTS FLOW BACK
  Campaign results page shows:
    → Avg score across participants
    → Archetype distribution
    → Contact-by-contact breakdown

  Dashboard sees:
    → New sessions in total count
    → Company leaderboard updated
    → Knowledge graph expanded
```

---

## Cross-Page Connections

### Navigation Shortcuts Between Pages

```
Dashboard
  ├──▶ Company Leaderboard row click → Company Detail
  ├──▶ "View all" button → Companies page
  └──▶ Stat cards link to Sessions, Analytics

Sessions
  ├──▶ Row click → Session Drawer (inline detail panel)
  ├──▶ Company name click → Companies page
  └──▶ Assessment type → Assessments page

Invitations
  ├──▶ Copy link → Clipboard (participant invite URL)
  └──▶ Assessment column → Assessments page

Companies
  └──▶ Row click → Company Detail page
        └──▶ Session rows → Session Drawer

Assessments
  ├──▶ Edit button → Builder page
  ├──▶ Preview button → Preview page (test as participant)
  └──▶ Duplicate → Creates new assessment

Builder
  └──▶ Back → Assessments page

Campaigns
  ├──▶ Contact links → Contacts page
  └──▶ Results → shows linked sessions

Contacts
  ├──▶ Call button → initiates Vapi call
  └──▶ Assessment history → linked Sessions

Analytics
  ├──▶ Export → Downloads CSV
  └──▶ "View details" → expanded analysis views

Search
  └──▶ Result click → Session/Contact/Call detail
```

### Data That Appears on Multiple Pages

| Data Point | Appears On |
|-----------|------------|
| Session count | Dashboard, Sessions, Companies, Analytics |
| Completion rate | Dashboard, Companies, Analytics |
| Company name | Dashboard, Sessions, Invitations, Companies, Contacts |
| Assessment type | Sessions, Invitations, Assessments, Campaigns |
| Archetype | Dashboard, Analytics, Calls, Search (Profiles tab) |
| Score | Dashboard, Companies, Analytics, Calls |
| Status badges | Sessions, Invitations, Contacts, Calls, Campaigns |

---

## Quick-Find Guide

### "I want to..."

| Task | Where to Go | How |
|------|-------------|-----|
| See overall system health | **Dashboard** | Check stat cards, funnel, graph status |
| Find a specific participant | **Search** | Type name, email, or company |
| View someone's assessment results | **Sessions** → click row | Opens Session Drawer with full analysis |
| Send assessment invitations | **Invitations** → "New Invitation" | Single or Bulk Import via CSV |
| Check who opened their invite | **Invitations** → filter "Opened" | Status column shows Sent/Opened/Started/Completed |
| See how a company is performing | **Companies** → click company | Company Detail shows all sessions + aggregated stats |
| Create a new assessment | **Builder** or **AI Co-Pilot** | Builder for manual, Co-Pilot for guided creation |
| Edit assessment questions | **Assessments** → "Edit" button | Opens Builder with question editor |
| Test an assessment before sending | **Assessments** → "Preview" button | Opens participant view in preview mode |
| Run an outbound call campaign | **Campaigns** → "New Campaign" | Create campaign, add contacts, initiate calls |
| Import contacts from CSV | **Contacts** → "Bulk Import" | Upload CSV with name, phone, email, company |
| View call transcripts | **Calls** → click row | Shows transcript, duration, status |
| Export assessment data | **Analytics** → "Export Assessments" | Downloads CSV with all session data |
| Set up webhook notifications | **Webhooks** → "Add Webhook" | URL + event types (call.completed, session.analyzed) |
| Configure data retention | **Settings** → Retention Period | Set 30d/60d/90d/6m/1y/Forever + auto-cleanup |
| Ask the AI for help | **AI Assistant** button (any page) | Bottom-left floating button, available everywhere |
| Compare multiple participants | `/compare` (public URL) | Side-by-side profile comparison |
| Find gaps across an organization | **AI Co-Pilot** → "Run gap analysis" | Or Analytics → Gaps & Industry tab |
| See archetype distribution | **Dashboard** or **Analytics** | Dashboard has quick view, Analytics has full breakdown |
| Check Neo4j graph health | **Dashboard** → Graph card | Shows Connected/Disconnected + node/edge counts |

### Keyboard & UI Shortcuts

| Shortcut | Location | Action |
|----------|----------|--------|
| Click company name in leaderboard | Dashboard | Jump to Company Detail |
| Click status pill (32 TOTAL, etc.) | Sessions | Filter to that status |
| Toggle theme button | Header (all pages) | Switch light/dark mode |
| "View Site" link | Header (all pages) | Opens participant-facing site |
| Collapse sidebar arrow (←) | Bottom of sidebar | Minimize sidebar to icons |

---

## API Endpoint Reference

### Public Endpoints (No Auth)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Health check |
| `GET /api/invitations/lookup?token=` | Validate invite token |
| `POST /api/sessions` | Create new session |
| `GET /api/sessions/lookup?email=` | Find sessions by email |
| `POST /api/research/:id` | Run company research |
| `POST /api/interview/start` | Begin interview |
| `POST /api/interview/respond` | Submit answer |
| `POST /api/interview/analyze` | Trigger analysis |
| `POST /api/transcribe` | Transcribe audio |

### Admin Endpoints (JWT Required)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/admin/login` | Authenticate |
| `GET /api/admin/sessions` | List sessions |
| `GET /api/admin/stats` | Dashboard stats |
| `GET /api/admin/funnel` | Completion funnel |
| `GET /api/admin/companies` | Company list |
| `GET /api/admin/invitations` | Invitation list |
| `POST /api/admin/invitations/batch` | Bulk create invites |
| `GET /api/admin/assessments` | Assessment list |
| `POST /api/admin/assessments` | Create assessment |
| `GET /api/admin/graph/network` | Neo4j visualization |
| `GET /api/admin/graph/themes` | Theme intelligence |
| `POST /api/admin/chat` | AI Co-Pilot (SSE stream) |
| `GET /api/admin/copilot/insight` | Page-context AI insight |
| `GET /api/admin/profile-stats` | Profile aggregations |
| `GET /api/admin/export` | Export all data |
| `GET /api/campaigns` | Campaign list |
| `GET /api/contacts` | Contact list |
| `GET /api/calls` | Call history |
| `GET /api/search?q=` | Global search |
| `GET /api/analytics/*` | Analytics data |

---

*Last updated: March 22, 2026*
*Generated from codebase analysis of HMN Cascade v1*
