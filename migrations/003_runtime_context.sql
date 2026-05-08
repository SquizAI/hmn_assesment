-- ============================================================
-- 003_runtime_context.sql
-- Runtime metadata layer for assessment analysis pipeline.
-- Stores private, admin-only context (e.g., principal forecasts,
-- per-respondent calibration) that is fetched at analysis time
-- and prepended as a private system message to the LLM call.
-- This is intentionally separate from cascade_assessment_configs
-- so sensitive content never lives inside the assessment JSON.
-- ============================================================

CREATE TABLE IF NOT EXISTS cascade_assessment_runtime_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('global', 'invitation', 'session', 'participant_email')),
  scope_key text NOT NULL,
  context_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, scope, scope_key, context_type)
);

CREATE INDEX IF NOT EXISTS cascade_runtime_context_lookup_idx
  ON cascade_assessment_runtime_context (assessment_id, scope, scope_key);

-- RLS: service_role bypasses; anon/auth roles get no access by default.
-- Admin-only access is enforced at the application layer via requireAdmin middleware.
ALTER TABLE cascade_assessment_runtime_context ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE cascade_assessment_runtime_context IS
  'Private runtime context fetched by the analysis pipeline. Never echoed to respondents. Scope keys: global=>default, invitation=>invitation_id, session=>session_id, participant_email=>email.';
