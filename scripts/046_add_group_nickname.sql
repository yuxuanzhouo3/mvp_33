-- Add group_nickname field to conversation_members table
-- This allows users to set custom nicknames for themselves in different groups

ALTER TABLE conversation_members
ADD COLUMN IF NOT EXISTS group_nickname VARCHAR(255);

-- Add comment to explain the field
COMMENT ON COLUMN conversation_members.group_nickname IS 'Custom nickname set by the user for themselves in this specific group/conversation';
