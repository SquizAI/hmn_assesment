# /add-assessment — Scaffold New Assessment Type

Create a new assessment type with questions, scoring dimensions, and prompts.

## Usage
`/add-assessment` — Interactive assessment builder
`/add-assessment <name>` — Start with a name

## Steps

### 1. Gather Requirements
Ask the user:
- Assessment name and description
- Target audience (who takes this assessment?)
- Key dimensions to evaluate
- Estimated completion time
- Number of phases/sections

### 2. Study Existing Patterns
Read the existing assessment structure:
- `src/lib/types.ts` — AssessmentType interface
- `src/data/question-bank.ts` — Existing question patterns
- `src/data/scoring-rubrics.ts` — Existing scoring patterns
- `assessments/` directory — Existing assessment JSON files

### 3. Generate Assessment JSON
Create a new assessment JSON following the `AssessmentType` schema:
```json
{
  "id": "generated-unique-id",
  "name": "...",
  "description": "...",
  "icon": "emoji",
  "estimatedMinutes": 30,
  "status": "draft",
  "phases": [...],
  "sections": [...],
  "questions": [...],
  "scoringDimensions": [...],
  "interviewSystemPrompt": "...",
  "analysisSystemPrompt": "...",
  "intakeFields": [...]
}
```

### 4. Question Generation
For each section, generate questions with:
- Varied input types (slider, buttons, multi_select, open_text, voice, ai_conversation)
- Appropriate scoring dimensions and weights
- Follow-up triggers for important questions
- AI follow-up prompts for deeper exploration

### 5. System Prompts
Generate two specialized prompts:
- **Interview System Prompt**: Personality, tone, follow-up strategy for the AI interviewer
- **Analysis System Prompt**: Scoring methodology, archetype detection, recommendation logic

### 6. Save & Validate
- Write the JSON to `assessments/<id>.json`
- Validate the structure matches the TypeScript types
- Run a build check to ensure no type errors

Show the user the assessment summary before saving. Let them iterate on it.
