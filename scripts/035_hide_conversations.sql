-- Add is_hidden column to conversation_members table
-- Allows users to hide conversations from their list without leaving

ALTER TABLE conversation_members
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;

ALTER TABLE conversation_members
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP WITH TIME ZONE;

-- Index for filtering hidden conversations
CREATE INDEX IF NOT EXISTS idx_conversation_members_hidden 
  ON conversation_members(user_id, is_hidden) 
  WHERE is_hidden = TRUE;































































































