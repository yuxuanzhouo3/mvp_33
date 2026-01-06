-- Fix RLS SELECT policy for conversation_members
-- Ensure users can see their own memberships and members of conversations they belong to
-- FIXED: Use SECURITY DEFINER functions to avoid infinite recursion

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view conversation members" ON conversation_members;

-- Ensure the is_conversation_member function exists (from previous scripts)
CREATE OR REPLACE FUNCTION is_conversation_member(p_conversation_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id
  );
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION is_conversation_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_conversation_member(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION is_conversation_member(UUID, UUID) TO service_role;

-- Create a simplified SELECT policy that avoids recursion using SECURITY DEFINER function
-- Users can see:
-- 1. Their own membership records (simple check, no recursion)
-- 2. Other members in conversations they created (using SECURITY DEFINER function)
-- 3. Other members if they are a member themselves (using SECURITY DEFINER function)
CREATE POLICY "Users can view conversation members"
  ON conversation_members FOR SELECT
  TO authenticated
  USING (
    -- User can see their own membership records (no recursion)
    user_id = auth.uid()
    OR
    -- User can see other members if they created the conversation
    -- Using SECURITY DEFINER function to avoid RLS recursion
    is_conversation_creator(conversation_id, auth.uid())
    OR
    -- User can see other members if they are a member themselves
    -- Using SECURITY DEFINER function to avoid RLS recursion
    is_conversation_member(conversation_id, auth.uid())
  );

-- Also ensure conversations SELECT policy allows viewing conversations they created
-- FIXED: Use SECURITY DEFINER function to avoid infinite recursion
DROP POLICY IF EXISTS "Users can view conversations they are members of" ON conversations;

CREATE POLICY "Users can view conversations they are members of"
  ON conversations FOR SELECT
  TO authenticated
  USING (
    -- User can view conversations they created (no recursion)
    created_by = auth.uid()
    OR
    -- User can view conversations they are members of
    -- Using SECURITY DEFINER function to avoid RLS recursion
    is_conversation_member(id, auth.uid())
  );

-- Grant necessary permissions
GRANT ALL ON conversation_members TO authenticated;
GRANT ALL ON conversations TO authenticated;

-- Ensure RLS is enabled
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

