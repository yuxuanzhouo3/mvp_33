-- Add RLS policies for workspace_members table
-- This allows users to join workspaces and view their memberships
-- FIXED: Simplified policies to avoid infinite recursion

-- Drop existing policies if they exist (to allow re-running)
DROP POLICY IF EXISTS "Users can view workspace members" ON workspace_members;
DROP POLICY IF EXISTS "Users can join workspaces" ON workspace_members;
DROP POLICY IF EXISTS "Users can update their own membership" ON workspace_members;
DROP POLICY IF EXISTS "Users can view their own workspace memberships" ON workspace_members;

-- Drop function if exists (in case we need to recreate it)
DROP FUNCTION IF EXISTS is_workspace_member(UUID, UUID);

-- Create a security definer function to check membership without recursion
-- This function runs with the privileges of the function creator, bypassing RLS
CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
  );
$$;

-- RLS Policies for workspace_members

-- SIMPLIFIED: Allow users to view their own memberships (no recursion)
CREATE POLICY "Users can view their own workspace memberships"
  ON workspace_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Allow users to view other members in workspaces they belong to
-- Using SECURITY DEFINER function to avoid infinite recursion
CREATE POLICY "Users can view workspace members"
  ON workspace_members FOR SELECT
  TO authenticated
  USING (
    -- User can see their own membership records (already covered above, but keep for clarity)
    user_id = auth.uid()
    OR
    -- User can see other members if they are a member of the workspace
    -- Using SECURITY DEFINER function avoids recursion
    is_workspace_member(workspace_id, auth.uid())
  );

-- Allow users to add themselves to workspaces
-- Users can join any workspace (for now, can be restricted later if needed)
CREATE POLICY "Users can join workspaces"
  ON workspace_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- User can add themselves to any workspace
    auth.uid() = user_id
  );

-- Allow users to update their own membership (e.g., role, notification settings)
CREATE POLICY "Users can update their own membership"
  ON workspace_members FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Enable RLS on the table (if not already enabled)
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions (if not already granted)
GRANT ALL ON workspace_members TO authenticated;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION is_workspace_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_workspace_member(UUID, UUID) TO anon;

