# /session-export — Export & Analyze Session Data

Export session data in various formats for analysis.

## Usage
`/session-export` — Export all sessions
`/session-export <format>` — Export in specific format (json, csv, summary)
`/session-export analyzed` — Export only analyzed sessions

## Steps

### 1. Load Sessions
Read all JSON files from the `sessions/` directory at the project root.
Parse each file as an `InterviewSession` type.

### 2. Filter Options
Ask user what to include:
- All sessions
- Only completed sessions
- Only analyzed sessions
- Date range filter
- Assessment type filter

### 3. Export Formats

#### JSON Export
Full session data as a JSON array. Write to `exports/sessions-<date>.json`.

#### CSV Export
Flatten key fields into CSV:
- Session ID, Participant Name, Company, Industry, Role
- Assessment Type, Status, Created Date
- Response Count, Overall Score (if analyzed)
- Archetype (if analyzed)

#### Summary Report
Generate a markdown summary:
- Total sessions by status
- Completion rates
- Average scores by dimension
- Top archetypes
- Common gaps and red flags
- Assessment type breakdown

### 4. Analysis Add-ons
Optionally generate:
- **Trend analysis**: Score trends over time
- **Comparison**: Cross-session dimension comparisons
- **Cohort analysis**: Group by company/industry/team size

### 5. Output
Write export to `exports/` directory (create if needed).
Display summary statistics inline.
