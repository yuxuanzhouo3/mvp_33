-- Fix RLS policies for conversations table
-- Use SECURITY DEFINER function to avoid infinite recursion
-- This ensures users can view conversations they are members of

-- Step 1: Ensure the is_conversation_member function exists
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

-- Step 2: Drop all existing SELECT policies on conversations
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'conversations' AND cmd = 'SELECT') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON conversations', r.policyname);
    END LOOP;
END $$;

-- Step 3: Create the correct SELECT policy using SECURITY DEFINER function
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

-- Step 4: Ensure RLS is enabled
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Step 5: Grant necessary permissions
GRANT ALL ON conversations TO authenticated;

-- Step 6: Verify the setup
DO $$
BEGIN
    RAISE NOTICE '✅ Conversations RLS policy fixed successfully';
    RAISE NOTICE 'Users can now view conversations they are members of';
END $$;













































































































