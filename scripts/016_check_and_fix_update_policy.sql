-- Check and fix the UPDATE policy for users table
-- This script will show the current policy definition and fix it if needed

-- First, show the current policy details
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE tablename = 'users' AND policyname = 'Users can update their own profile';

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can update their own profile" ON users;

-- Recreate the policy with both USING and WITH CHECK
CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Verify the policy was created correctly
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE tablename = 'users' AND policyname = 'Users can update their own profile';

-- Test: Try to see if we can read the policy definition from pg_policy
SELECT 
  pol.polname as policy_name,
  pol.polcmd as command,
  pg_get_expr(pol.polqual, pol.polrelid) as using_expression,
  pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_expression
FROM pg_policy pol
JOIN pg_class pc ON pol.polrelid = pc.oid
WHERE pc.relname = 'users' AND pol.polname = 'Users can update their own profile';





























