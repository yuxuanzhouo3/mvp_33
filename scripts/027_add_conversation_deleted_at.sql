-- Add deleted_at field to conversations table for soft delete
-- This allows conversations to be restored when user reopens them

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster queries filtering deleted conversations
CREATE INDEX IF NOT EXISTS idx_conversations_deleted_at 
ON conversations(deleted_at) 
WHERE deleted_at IS NULL;

-- Add comment
COMMENT ON COLUMN conversations.deleted_at IS 'Timestamp when conversation was deleted (soft delete). NULL means not deleted.';








