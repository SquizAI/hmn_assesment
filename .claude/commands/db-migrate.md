# /db-migrate — Data Format Migration

Handle data format migrations when the schema changes between versions.

## Usage
`/db-migrate check` — Check for data format mismatches
`/db-migrate run` — Apply pending migrations
`/db-migrate <version>` — Migrate to a specific version

## Steps

### 1. Version Detection
Read the current TypeScript types from `src/lib/types.ts`.
Read sample session and assessment JSON files.
Compare the JSON structure against the TypeScript interfaces.

### 2. Detect Mismatches
For each session file in `sessions/`:
- Parse the JSON
- Check every field against the `InterviewSession` interface
- Flag missing fields, extra fields, type mismatches

For each assessment file in `assessments/`:
- Parse the JSON
- Check against the `AssessmentType` interface
- Flag structural issues

### 3. Generate Migration
If mismatches found, generate a migration script:

```typescript
// migration-<date>.ts
import fs from "fs";
import path from "path";

const SESSIONS_DIR = path.join(process.cwd(), "sessions");

// Read all sessions
const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".json"));

for (const file of files) {
  const filePath = path.join(SESSIONS_DIR, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  // Apply migrations
  if (!data.assessmentTypeId) {
    data.assessmentTypeId = "default";
  }
  // ... more field migrations

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
```

### 4. Backup First
Before running any migration:
```bash
cp -r sessions/ sessions-backup-$(date +%Y%m%d)/
cp -r assessments/ assessments-backup-$(date +%Y%m%d)/
```

### 5. Validate
After migration:
- Re-run the mismatch check — should be clean
- Run `npx tsc --noEmit` — should pass
- Test the app loads correctly

### 6. Report
| File | Issues Found | Migrated | Status |
|------|-------------|----------|--------|
