-- Acquisition multichannel operations tables
-- Supports the persistent crawler / reply / partnership workflow used by
-- /market/acquisition/distribution on the INTL Supabase stack.

CREATE TABLE IF NOT EXISTS acquisition_rule_sets (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  scope TEXT NOT NULL DEFAULT 'global',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acquisition_organizations (
  id TEXT PRIMARY KEY,
  partner_type TEXT NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  region TEXT NOT NULL DEFAULT '',
  market TEXT NOT NULL DEFAULT 'GLOBAL',
  primary_platform TEXT,
  domain TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  follower_min INTEGER,
  follower_max INTEGER,
  estimated_audience_size INTEGER,
  demand_summary TEXT,
  lead_score NUMERIC NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL DEFAULT 'crawler',
  source_url TEXT,
  source_label TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  owner_user_id TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acquisition_contacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  channel TEXT NOT NULL,
  value TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_public_contact BOOLEAN NOT NULL DEFAULT TRUE,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  locale TEXT,
  timezone TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acquisition_leads (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  contact_id TEXT,
  pipeline TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'crawler',
  source_task_id TEXT,
  source_run_id TEXT,
  source_document_url TEXT,
  qualification_reason TEXT,
  fit_score NUMERIC NOT NULL DEFAULT 0,
  priority_score NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  next_action_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  last_replied_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acquisition_crawler_tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  provider TEXT NOT NULL DEFAULT 'file',
  target_sites JSONB NOT NULL DEFAULT '[]'::jsonb,
  selectors JSONB NOT NULL DEFAULT '[]'::jsonb,
  region TEXT NOT NULL DEFAULT '',
  locale TEXT NOT NULL DEFAULT 'en',
  keyword_query TEXT NOT NULL DEFAULT '',
  frequency_minutes INTEGER NOT NULL DEFAULT 1440,
  max_results_per_run INTEGER NOT NULL DEFAULT 100,
  dedupe_key JSONB NOT NULL DEFAULT '[]'::jsonb,
  public_contact_only BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acquisition_crawler_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  fetched_documents INTEGER NOT NULL DEFAULT 0,
  extracted_leads INTEGER NOT NULL DEFAULT 0,
  qualified_leads INTEGER NOT NULL DEFAULT 0,
  failed_documents INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS acquisition_reply_events (
  id TEXT PRIMARY KEY,
  outreach_job_id TEXT,
  lead_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  contact_id TEXT,
  channel TEXT NOT NULL,
  inbound_text TEXT NOT NULL,
  sentiment_score NUMERIC,
  disposition TEXT NOT NULL DEFAULT 'manual_review',
  ai_summary TEXT,
  suggested_next_action TEXT,
  requires_human_review BOOLEAN NOT NULL DEFAULT FALSE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS acquisition_offer_packages (
  id TEXT PRIMARY KEY,
  partner_type TEXT NOT NULL,
  name TEXT NOT NULL,
  billing_product TEXT,
  billing_cycle TEXT,
  pro_benefit_months INTEGER NOT NULL DEFAULT 0,
  coupon_discount_rate NUMERIC NOT NULL DEFAULT 0,
  coupon_price_rmb NUMERIC,
  commission_rule_id TEXT,
  contract_template_key TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acquisition_partnerships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  lead_id TEXT NOT NULL UNIQUE,
  partner_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prospecting',
  offer_package_id TEXT,
  contract_id TEXT,
  contract_signed_at TIMESTAMPTZ,
  launch_at TIMESTAMPTZ,
  manager_user_id TEXT,
  notes TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acquisition_tracking_assets (
  id TEXT PRIMARY KEY,
  partnership_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  code TEXT NOT NULL,
  url TEXT,
  coupon_id TEXT,
  marketing_invitation_code_id TEXT,
  source_campaign TEXT,
  source_medium TEXT,
  source_content TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acquisition_event_logs (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_acq_org_partner_region ON acquisition_organizations(partner_type, region);
CREATE INDEX IF NOT EXISTS idx_acq_contact_org_channel ON acquisition_contacts(organization_id, channel);
CREATE INDEX IF NOT EXISTS idx_acq_lead_org_pipeline ON acquisition_leads(organization_id, pipeline);
CREATE INDEX IF NOT EXISTS idx_acq_task_target_status ON acquisition_crawler_tasks(target_type, status);
CREATE INDEX IF NOT EXISTS idx_acq_run_task_started ON acquisition_crawler_runs(task_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_acq_reply_lead_received ON acquisition_reply_events(lead_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_acq_partnership_status ON acquisition_partnerships(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_acq_asset_partnership_type ON acquisition_tracking_assets(partnership_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_acq_event_entity ON acquisition_event_logs(entity_type, entity_id, occurred_at DESC);
