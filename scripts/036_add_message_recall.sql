-- Add message recall functionality
-- Adds is_recalled field to messages table

ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS is_recalled BOOLEAN DEFAULT false;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_messages_is_recalled ON messages(is_recalled) WHERE is_recalled = true;

-- Update existing messages to have is_recalled = false
UPDATE messages SET is_recalled = false WHERE is_recalled IS NULL;

-- Add UPDATE policy for messages (required for recall functionality)
-- Users can update messages they sent in conversations they are members of
-- Drop policy if it exists first
DROP POLICY IF EXISTS "Users can update their own messages" ON messages;

CREATE POLICY "Users can update their own messages"
  ON messages FOR UPDATE
  USING (
    sender_id = auth.uid() AND
    conversation_id IN (
      SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    sender_id = auth.uid() AND
    conversation_id IN (
      SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
    )
  );

