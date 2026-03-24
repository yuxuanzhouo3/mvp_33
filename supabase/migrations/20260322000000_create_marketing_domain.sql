-- Marketing center V1 domain tables
-- Shared schema semantics for CN/INTL. Current migration applies to the INTL Supabase stack.

CREATE TABLE IF NOT EXISTS marketing_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT 'null'::jsonb,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  campaign_type TEXT NOT NULL DEFAULT 'marketing',
  product_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  highlight TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 99,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_task_templates (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  campaign_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  task_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  reward_asset TEXT NOT NULL,
  reward_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  reward_recipient TEXT NOT NULL DEFAULT 'actor',
  threshold_value INTEGER NOT NULL DEFAULT 1,
  threshold_unit TEXT NOT NULL DEFAULT 'times',
  daily_limit INTEGER,
  lifetime_limit INTEGER,
  recurrence TEXT NOT NULL DEFAULT 'repeatable',
  decay_policy TEXT NOT NULL DEFAULT 'none',
  risk_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  products JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  sort_order INTEGER NOT NULL DEFAULT 99,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_asset_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  available_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  frozen_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  lifetime_earned NUMERIC(18, 2) NOT NULL DEFAULT 0,
  lifetime_spent NUMERIC(18, 2) NOT NULL DEFAULT 0,
  pending_expiry_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  next_expiry_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_asset_ledgers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL,
  available_after NUMERIC(18, 2) NOT NULL DEFAULT 0,
  frozen_after NUMERIC(18, 2) NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  remark TEXT NOT NULL DEFAULT '',
  operator_id TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  expires_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_user_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_slug TEXT NOT NULL,
  template_name TEXT NOT NULL,
  campaign_slug TEXT NOT NULL,
  event_type TEXT NOT NULL,
  progress_value NUMERIC(18, 2) NOT NULL DEFAULT 0,
  progress_target NUMERIC(18, 2) NOT NULL DEFAULT 1,
  completion_count INTEGER NOT NULL DEFAULT 0,
  reward_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  streak_count INTEGER NOT NULL DEFAULT 0,
  last_event_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_event_logs (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  event_type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  source TEXT,
  device_fingerprint TEXT,
  ip_hash TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL,
  threshold_amount NUMERIC(18, 2) NOT NULL DEFAULT 20,
  channel TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  review_note TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS marketing_risk_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  risk_code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  source_event_id TEXT,
  device_fingerprint TEXT,
  ip_hash TEXT,
  description TEXT NOT NULL DEFAULT '',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  review_note TEXT
);

CREATE TABLE IF NOT EXISTS marketing_risk_lists (
  id TEXT PRIMARY KEY,
  list_type TEXT NOT NULL,
  target_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  reason TEXT NOT NULL DEFAULT '',
  operator_id TEXT,
  expires_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_asset_accounts_user_asset
  ON marketing_asset_accounts(user_id, asset_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_user_tasks_user_template
  ON marketing_user_tasks(user_id, template_slug);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_risk_lists_type_target
  ON marketing_risk_lists(list_type, target_value);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status_sort
  ON marketing_campaigns(status, sort_order);

CREATE INDEX IF NOT EXISTS idx_marketing_task_templates_event_status
  ON marketing_task_templates(event_type, status);

CREATE INDEX IF NOT EXISTS idx_marketing_ledgers_user_created
  ON marketing_asset_ledgers(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_ledgers_source
  ON marketing_asset_ledgers(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_marketing_event_logs_user_occurred
  ON marketing_event_logs(user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_event_logs_product_event
  ON marketing_event_logs(product, event_type);

CREATE INDEX IF NOT EXISTS idx_marketing_event_logs_device
  ON marketing_event_logs(device_fingerprint);

CREATE INDEX IF NOT EXISTS idx_marketing_event_logs_ip
  ON marketing_event_logs(ip_hash);

CREATE INDEX IF NOT EXISTS idx_marketing_withdrawals_status_requested
  ON marketing_withdrawals(status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_risk_events_status_created
  ON marketing_risk_events(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_risk_events_source
  ON marketing_risk_events(source_event_id);

CREATE INDEX IF NOT EXISTS idx_marketing_risk_lists_status
  ON marketing_risk_lists(status, updated_at DESC);
