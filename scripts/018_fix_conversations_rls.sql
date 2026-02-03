-- Fix RLS policies for conversations table
-- Add missing INSERT and UPDATE policies

-- Drop existing policies if they exist (to allow re-running)
DROP POLICY IF EXISTS "Users can view conversations they are members of" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update conversations they created" ON conversations;

-- RLS Policies for conversations
CREATE POLICY "Users can view conversations they are members of"
  ON conversations FOR SELECT
  USING (
    -- User can view conversations they created
    created_by = auth.uid()
    OR
    -- User can view conversations they are members of
    id IN (
      SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
    )
  );

-- Allow users to create conversations (they will be added as members)
CREATE POLICY "Users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Allow users to update conversations they created
CREATE POLICY "Users can update conversations they created"
  ON conversations FOR UPDATE
  USING (auth.uid() = created_by);

-- Also need to add policies for conversation_members table
DROP POLICY IF EXISTS "Users can view conversation members" ON conversation_members;
DROP POLICY IF EXISTS "Users can add themselves to conversations" ON conversation_members;
DROP POLICY IF EXISTS "Users can update their own membership" ON conversation_members;

-- Create a security definer function to check membership without recursion
-- This function runs with the privileges of the function creator, bypassing RLS
CREATE OR REPLACE FUNCTION is_conversation_member(p_conversation_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id
  );
$$;

-- Now use the function in the policy to avoid recursion
CREATE POLICY "Users can view conversation members"
  ON conversation_members FOR SELECT
  USING (
    -- User can see their own membership records
    user_id = auth.uid()
    OR
    -- User can see other members if they are a member of the conversation
    -- Using the security definer function avoids recursion
    is_conversation_member(conversation_id, auth.uid())
  );

-- Allow users to add themselves or be added to conversations
-- For direct messages, both users need to be added
-- Users can add themselves, OR they can add others to conversations they created
CREATE POLICY "Users can add themselves to conversations"
  ON conversation_members FOR INSERT
  WITH CHECK (
    -- User can add themselves
    auth.uid() = user_id
    OR
    -- User can add others to conversations they created
    conversation_id IN (
      SELECT id FROM conversations WHERE created_by = auth.uid()
    )
  );

-- Allow users to update their own membership (e.g., last_read_at, notification_setting)
CREATE POLICY "Users can update their own membership"
  ON conversation_members FOR UPDATE
  USING (auth.uid() = user_id);

