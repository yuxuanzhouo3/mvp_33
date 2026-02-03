-- Conversation pinning support (per user)
-- Adds is_pinned/pinned_at metadata on conversation_members to track which
-- conversations a user has pinned in their sidebar. This keeps the data
-- colocated with other per-user settings like notification preferences.

ALTER TABLE conversation_members
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;

ALTER TABLE conversation_members
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP WITH TIME ZONE;

-- Helpful when ordering pinned conversations for a specific user.
CREATE INDEX IF NOT EXISTS idx_conversation_members_pinned
  ON conversation_members (user_id, pinned_at DESC)
  WHERE is_pinned = TRUE;



































































































