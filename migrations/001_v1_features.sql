-- ============================================================
-- HMN Cascade — V1 Feature Port: New tables
-- Run this against your Supabase project
-- ============================================================

-- Campaigns table
CREATE TABLE IF NOT EXISTS cascade_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  assessment_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  schedule JSONB,
  stats JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts table (CRM)
CREATE TABLE IF NOT EXISTS cascade_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  company TEXT,
  role TEXT,
  tags JSONB DEFAULT '[]',
  campaign_id UUID REFERENCES cascade_campaigns(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calls table (call history)
CREATE TABLE IF NOT EXISTS cascade_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES cascade_contacts(id) ON DELETE SET NULL,
  session_id UUID,
  campaign_id UUID REFERENCES cascade_campaigns(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  duration_seconds INTEGER,
  recording_url TEXT,
  transcript TEXT,
  transcript_messages JSONB,
  analysis_status TEXT DEFAULT 'pending',
  vapi_call_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhooks table
CREATE TABLE IF NOT EXISTS cascade_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  campaign_id UUID REFERENCES cascade_campaigns(id) ON DELETE SET NULL,
  events JSONB NOT NULL DEFAULT '[]',
  secret TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings table (key-value)
CREATE TABLE IF NOT EXISTS cascade_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Resume tokens table
CREATE TABLE IF NOT EXISTS cascade_resume_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  session_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cascade_contacts_campaign ON cascade_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cascade_contacts_status ON cascade_contacts(status);
CREATE INDEX IF NOT EXISTS idx_cascade_calls_contact ON cascade_calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_cascade_calls_campaign ON cascade_calls(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cascade_calls_status ON cascade_calls(status);
CREATE INDEX IF NOT EXISTS idx_cascade_resume_tokens_token ON cascade_resume_tokens(token);
CREATE INDEX IF NOT EXISTS idx_cascade_resume_tokens_session ON cascade_resume_tokens(session_id);

-- Enable RLS (but allow service role full access)
ALTER TABLE cascade_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cascade_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cascade_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE cascade_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cascade_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cascade_resume_tokens ENABLE ROW LEVEL SECURITY;

-- Service role policies (server uses service role key)
CREATE POLICY "Service role full access" ON cascade_campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON cascade_contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON cascade_calls FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON cascade_webhooks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON cascade_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON cascade_resume_tokens FOR ALL USING (true) WITH CHECK (true);
