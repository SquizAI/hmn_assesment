-- ============================================================
-- HMN Cascade — Cascade Profiles table
-- Unified post-assessment profile for all assessment types
-- ============================================================

-- Create cascade_profiles table
CREATE TABLE IF NOT EXISTS cascade_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  contact_id UUID,
  invitation_id UUID,
  campaign_id UUID,
  assessment_type TEXT NOT NULL DEFAULT 'cascade',
  overall_score NUMERIC,
  archetype TEXT,
  archetype_confidence NUMERIC,
  dimension_scores JSONB,
  gaps JSONB,
  red_flags JSONB,
  green_lights JSONB,
  contradictions JSONB,
  service_recommendations JSONB,
  deep_dive_triggers JSONB,
  prioritized_actions JSONB,
  executive_summary TEXT,
  adaptability_scores JSONB,
  adaptability_profile JSONB,
  participant_name TEXT,
  participant_email TEXT,
  participant_company TEXT,
  participant_role TEXT,
  participant_industry TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_session ON cascade_profiles(session_id);
CREATE INDEX IF NOT EXISTS idx_profiles_contact ON cascade_profiles(contact_id);
CREATE INDEX IF NOT EXISTS idx_profiles_company ON cascade_profiles(participant_company);
CREATE INDEX IF NOT EXISTS idx_profiles_archetype ON cascade_profiles(archetype);
CREATE INDEX IF NOT EXISTS idx_profiles_assessment_type ON cascade_profiles(assessment_type);
CREATE INDEX IF NOT EXISTS idx_profiles_overall_score ON cascade_profiles(overall_score);

-- Add UNIQUE constraint on session_id for upsert support
ALTER TABLE cascade_profiles ADD CONSTRAINT uq_profiles_session_id UNIQUE (session_id);

-- Add contact_id to cascade_sessions if not exists
ALTER TABLE cascade_sessions ADD COLUMN IF NOT EXISTS contact_id UUID;

-- Enable RLS (service role has full access)
ALTER TABLE cascade_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON cascade_profiles FOR ALL USING (true) WITH CHECK (true);
