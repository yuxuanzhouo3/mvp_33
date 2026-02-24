-- Fix infinite recursion in workspace_members RLS policies
-- Problem: is_workspace_member function queries workspace_members table which has RLS
-- Solution: Use a simpler approach that bypasses RLS in the function

-- First, drop the problematic policies
DROP POLICY IF EXISTS "Users can view workspace members" ON workspace_members;
DROP POLICY IF EXISTS "Users can view their own workspace memberships" ON workspace_members;

-- Drop and recreate the function with BYPASS RLS
DROP FUNCTION IF EXISTS is_workspace_member(UUID, UUID);

-- Create a security definer function that bypasses RLS
-- The key is to use SECURITY DEFINER and query directly
CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET ROLE postgres  -- Run as superuser to bypass RLS
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
  );
$$;

-- Alternative approach: if SET ROLE doesn't work, we can try using a subquery
-- that directly checks the workspace_id without RLS

-- Recreate the policies
-- Policy 1: Users can always see their own memberships
CREATE POLICY "Users can view their own memberships"
  ON workspace_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy 2: Users can see all members in workspaces they belong to
-- Uses the SECURITY DEFINER function to avoid recursion
CREATE POLICY "Users can view workspace members in their workspaces"
  ON workspace_members FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()));

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION is_workspace_member(UUID, UUID) TO authenticated;
