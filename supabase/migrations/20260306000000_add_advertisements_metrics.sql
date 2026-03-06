-- Advertisement compatibility and metrics migration
-- CN/INTL 数据隔离由部署环境控制，本迁移仅作用于当前 Supabase 环境

ALTER TABLE advertisements
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS redirect_url TEXT,
  ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS impression_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count BIGINT NOT NULL DEFAULT 0;

UPDATE advertisements
SET
  type = COALESCE(NULLIF(type, ''), 'image'),
  file_url = COALESCE(NULLIF(file_url, ''), image_url),
  link_url = COALESCE(NULLIF(link_url, ''), redirect_url),
  updated_at = COALESCE(updated_at, created_at, NOW()),
  impression_count = COALESCE(impression_count, 0),
  click_count = COALESCE(click_count, 0)
WHERE
  type IS DISTINCT FROM COALESCE(NULLIF(type, ''), 'image')
  OR
  file_url IS DISTINCT FROM COALESCE(NULLIF(file_url, ''), image_url)
  OR link_url IS DISTINCT FROM COALESCE(NULLIF(link_url, ''), redirect_url)
  OR updated_at IS NULL
  OR impression_count IS NULL
  OR click_count IS NULL;

CREATE INDEX IF NOT EXISTS idx_advertisements_status ON advertisements(status);
CREATE INDEX IF NOT EXISTS idx_advertisements_position ON advertisements(position);
CREATE INDEX IF NOT EXISTS idx_advertisements_priority ON advertisements(priority DESC);
CREATE INDEX IF NOT EXISTS idx_advertisements_status_position_priority
  ON advertisements(status, position, priority DESC);
CREATE INDEX IF NOT EXISTS idx_advertisements_active_window
  ON advertisements(start_date, end_date);
