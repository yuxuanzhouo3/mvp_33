CREATE TABLE IF NOT EXISTS market_distribution_accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  account_key TEXT NOT NULL,
  display_name TEXT,
  open_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  scope TEXT,
  avatar_url TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(platform, account_key)
);

CREATE INDEX IF NOT EXISTS idx_market_distribution_accounts_platform
  ON market_distribution_accounts(platform, account_key);
