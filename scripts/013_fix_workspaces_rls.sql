-- Fix workspaces RLS policy to allow workspace creation
-- The issue is that when creating a workspace, the session might not be fully established

-- Drop existing INSERT policy if it exists
DROP POLICY IF EXISTS "Users can create workspaces" ON workspaces;

-- Create a more permissive INSERT policy
-- This allows authenticated users to create workspaces where they are the owner
CREATE POLICY "Users can create workspaces"
  ON workspaces FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

-- Also ensure the SELECT policy allows viewing own workspaces
DROP POLICY IF EXISTS "Users can view workspaces they are members of" ON workspaces;

CREATE POLICY "Users can view workspaces they are members of"
  ON workspaces FOR SELECT
  TO authenticated
  USING (
    auth.uid() = owner_id OR
    id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Ensure UPDATE policy exists
DROP POLICY IF EXISTS "Users can update their own workspaces" ON workspaces;

CREATE POLICY "Users can update their own workspaces"
  ON workspaces FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Grant necessary permissions
GRANT ALL ON workspaces TO authenticated;
GRANT ALL ON workspace_members TO authenticated;






























