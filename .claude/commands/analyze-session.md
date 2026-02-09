# /analyze-session — Deep Session Analysis

Perform a deep analysis of a specific assessment session.

## Usage
Provide a session ID as argument: `/analyze-session <session-id>`
If no ID provided, list recent sessions and ask the user to pick one.

## Steps

### 1. Load Session Data
Read the session file from `sessions/<id>.json` at the project root.
Parse and validate the JSON structure against the `InterviewSession` type.

### 2. Session Overview
Report:
- **Participant**: Name, role, company, industry, team size
- **Status**: intake → in_progress → completed → analyzed
- **Assessment Type**: Which assessment was used
- **Timeline**: Created → Last updated → Duration
- **Response Count**: How many questions answered vs total

### 3. Response Analysis
For each response:
- Question text and input type
- Answer given (with confidence indicators)
- AI follow-up questions and answers (if any)
- Time spent (durationMs)
- Edit history (if edited)

### 4. Scoring Analysis (if analyzed)
If analysis exists:
- Overall readiness score with color coding
- Dimension scores with bar chart visualization
- Leader archetype and confidence
- Gap analysis patterns
- Red flags and green lights
- Service recommendations
- Prioritized actions

### 5. Conversation History Review
Scan the conversation history for:
- Flow quality (natural transitions vs abrupt)
- AI follow-up effectiveness
- Participant engagement patterns
- Any stuck points or confusion

## Output
Provide a comprehensive report with actionable insights about the session quality and participant assessment.
