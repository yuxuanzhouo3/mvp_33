-- Admin analysis tables for Supabase
-- Covers:
-- 1. user feedback with pros / cons / screenshots / version metadata
-- 2. behavior events for click / hover / scroll / dwell / register / login / logout
-- 3. feedback clusters for periodic topic aggregation

CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'web',
  status TEXT NOT NULL DEFAULT 'pending',
  images TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admin_notes TEXT,
  analysis_result JSONB
);

ALTER TABLE user_feedback
  ADD COLUMN IF NOT EXISTS screenshot_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS version TEXT,
  ADD COLUMN IF NOT EXISTS feature_key TEXT,
  ADD COLUMN IF NOT EXISTS pros TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cons TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS product_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  release_date TIMESTAMPTZ,
  feedback_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_behavior_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  session_id TEXT,
  event_type TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  page_path TEXT,
  source TEXT,
  duration_ms INTEGER,
  scroll_depth NUMERIC(6,2),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_key TEXT NOT NULL,
  topic TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  frequency INTEGER NOT NULL DEFAULT 0,
  sentiment TEXT NOT NULL,
  suggestion TEXT NOT NULL,
  version TEXT,
  feedback_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON user_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON user_feedback(status);
CREATE INDEX IF NOT EXISTS idx_user_feedback_source ON user_feedback(source);
CREATE INDEX IF NOT EXISTS idx_user_feedback_version ON user_feedback(version);
CREATE INDEX IF NOT EXISTS idx_user_feedback_feature_key ON user_feedback(feature_key);

CREATE INDEX IF NOT EXISTS idx_product_iterations_status ON product_iterations(status);
CREATE INDEX IF NOT EXISTS idx_product_iterations_version ON product_iterations(version);

CREATE INDEX IF NOT EXISTS idx_user_behavior_events_occurred_at ON user_behavior_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_behavior_events_feature_key ON user_behavior_events(feature_key);
CREATE INDEX IF NOT EXISTS idx_user_behavior_events_event_type ON user_behavior_events(event_type);
CREATE INDEX IF NOT EXISTS idx_user_behavior_events_user_id ON user_behavior_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_events_source ON user_behavior_events(source);

CREATE INDEX IF NOT EXISTS idx_feedback_clusters_snapshot_key ON feedback_clusters(snapshot_key);
CREATE INDEX IF NOT EXISTS idx_feedback_clusters_created_at ON feedback_clusters(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_clusters_topic ON feedback_clusters(topic);

ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_iterations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_behavior_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_clusters ENABLE ROW LEVEL SECURITY;
