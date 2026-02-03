-- Fix users UPDATE policy to ensure it works correctly
-- The policy should allow users to update their own profile, including status

-- Drop existing UPDATE policy if it exists
DROP POLICY IF EXISTS "Users can update their own profile" ON users;

-- Create UPDATE policy with proper conditions
-- This allows users to update their own record, including status field
CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Verify the policy was created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'users' AND policyname = 'Users can update their own profile';





























