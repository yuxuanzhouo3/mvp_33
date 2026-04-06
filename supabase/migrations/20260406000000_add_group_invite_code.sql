-- Add invite_code and invite_expires_at to conversations table
-- This supports the WeChat-style group invite link feature

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS invite_code VARCHAR(12) UNIQUE,
  ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;

-- Index for fast lookup by invite code
CREATE INDEX IF NOT EXISTS idx_conversations_invite_code
  ON conversations(invite_code)
  WHERE invite_code IS NOT NULL;

-- Comment
COMMENT ON COLUMN conversations.invite_code IS '12-char random invite code for group join links, expires after 7 days';
COMMENT ON COLUMN conversations.invite_expires_at IS 'Expiry timestamp for the invite_code, 7 days from generation';
