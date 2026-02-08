-- Add user-specific conversation deletion
-- Instead of deleting the conversation globally, mark it as deleted for specific users
-- This allows other users to still see the conversation

-- Add deleted_at to conversation_members table
ALTER TABLE conversation_members 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_conversation_members_deleted_at 
ON conversation_members(deleted_at) 
WHERE deleted_at IS NULL;

-- Add comment
COMMENT ON COLUMN conversation_members.deleted_at IS 'Timestamp when this user deleted the conversation. NULL means not deleted by this user.';













































































































