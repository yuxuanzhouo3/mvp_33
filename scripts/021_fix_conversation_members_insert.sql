-- Fix RLS policy for conversation_members INSERT
-- The issue is that when inserting multiple members, the policy check for "conversations created by user"
-- might fail due to RLS recursion. We need to use a SECURITY DEFINER function.

-- Drop ALL existing INSERT policies to avoid conflicts
DROP POLICY IF EXISTS "Users can add themselves to conversations" ON conversation_members;
DROP POLICY IF EXISTS "Users can add members to conversations" ON conversation_members;
DROP POLICY IF EXISTS "Allow conversation creator to add members" ON conversation_members;

-- Create a SECURITY DEFINER function to check if user created the conversation
-- This bypasses RLS and avoids recursion issues
CREATE OR REPLACE FUNCTION is_conversation_creator(p_conversation_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations
    WHERE id = p_conversation_id
    AND created_by = p_user_id
  );
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION is_conversation_creator(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_conversation_creator(UUID, UUID) TO anon;

-- Create improved INSERT policy using the SECURITY DEFINER function
-- This policy allows:
-- 1. Users to add themselves to any conversation
-- 2. Users to add others to conversations they created
CREATE POLICY "Users can add themselves to conversations"
  ON conversation_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- User can add themselves
    auth.uid() = user_id
    OR
    -- User can add others to conversations they created
    -- Using SECURITY DEFINER function to avoid RLS recursion
    is_conversation_creator(conversation_id, auth.uid())
  );

-- Ensure RLS is enabled
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT ALL ON conversation_members TO authenticated;

-- Add comment
COMMENT ON FUNCTION is_conversation_creator IS 'Checks if a user created a conversation. Uses SECURITY DEFINER to bypass RLS and avoid recursion.';

-- Verify the function exists and works
-- This is a test query that should return true if the function works
-- (You can uncomment and run this manually to test)
-- SELECT is_conversation_creator('00000000-0000-0000-0000-000000000000'::UUID, '00000000-0000-0000-0000-000000000000'::UUID);


