# /supabase-plan — Plan Supabase Migration

Plan the migration from file-based JSON storage to Supabase (PostgreSQL).

## Context
HMN Cascade currently stores all data as JSON files:
- `sessions/<id>.json` — Interview session data
- `assessments/<id>.json` — Assessment type definitions

This has scaling limitations. This command plans the migration to Supabase.

## Steps

### 1. Analyze Current Data Model
Read and map:
- `src/lib/types.ts` — All TypeScript interfaces
- `server/index.ts` — How sessions are read/written
- `server/admin-tools.ts` — How assessments and sessions are CRUD'd
- `sessions/` and `assessments/` — Sample data files

### 2. Design Database Schema
Propose PostgreSQL tables:
```sql
-- Core tables
CREATE TABLE assessments (...);
CREATE TABLE sessions (...);
CREATE TABLE responses (...);
CREATE TABLE analysis_results (...);

-- Supporting tables
CREATE TABLE participants (...);
CREATE TABLE dimension_scores (...);
CREATE TABLE service_recommendations (...);
```

Consider:
- Normalization vs JSON columns (for flexible fields)
- Indexes for common queries (status, created_at, assessment_type)
- Row-level security policies for Supabase auth

### 3. Migration Strategy
Propose:
- **Phase 1**: Add Supabase client alongside file storage (dual-write)
- **Phase 2**: Migrate existing data from JSON files to Supabase
- **Phase 3**: Switch reads to Supabase
- **Phase 4**: Remove file-based storage

### 4. Code Changes Required
Map every file operation in the server to its Supabase equivalent:
- `fs.readFileSync` → `supabase.from('table').select()`
- `fs.writeFileSync` → `supabase.from('table').insert/update()`
- `fs.unlinkSync` → `supabase.from('table').delete()`

### 5. Supabase MCP Integration
Use Supabase MCP tools to:
- `list_organizations` — Check available orgs
- `list_projects` — Check existing projects
- `create_project` — Create if needed
- `execute_sql` — Test schema
- `apply_migration` — Apply schema changes

### 6. Output
Deliver:
- Full SQL schema file
- Migration script (JSON → SQL)
- Code change checklist with file:line references
- Estimated effort and risk assessment
