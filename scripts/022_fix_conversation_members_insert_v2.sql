-- Fix RLS policy for conversation_members INSERT (Version 2)
-- This version ensures all old policies are removed and the new one is correctly applied

-- Step 1: Drop ALL existing policies on conversation_members to avoid conflicts
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'conversation_members') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON conversation_members', r.policyname);
    END LOOP;
END $$;

-- Step 2: Ensure the SECURITY DEFINER function exists and is correct
CREATE OR REPLACE FUNCTION is_conversation_creator(p_conversation_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations
    WHERE id = p_conversation_id
    AND created_by = p_user_id
  );
$$;

-- Step 3: Grant execute permission on the function
GRANT EXECUTE ON FUNCTION is_conversation_creator(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_conversation_creator(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION is_conversation_creator(UUID, UUID) TO service_role;

-- Step 4: Create the INSERT policy with explicit TO authenticated
CREATE POLICY "Users can add themselves to conversations"
  ON conversation_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- User can add themselves to any conversation
    auth.uid() = user_id
    OR
    -- User can add others to conversations they created
    -- Using SECURITY DEFINER function to avoid RLS recursion
    is_conversation_creator(conversation_id, auth.uid()) = true
  );

-- Step 5: Ensure RLS is enabled
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;

-- Step 6: Grant necessary table permissions
GRANT ALL ON conversation_members TO authenticated;
GRANT ALL ON conversations TO authenticated;

-- Step 7: Verify the setup
DO $$
BEGIN
    RAISE NOTICE 'Policy created successfully';
    RAISE NOTICE 'Function is_conversation_creator exists: %', 
        (SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'is_conversation_creator'));
END $$;














