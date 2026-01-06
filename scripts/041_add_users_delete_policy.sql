-- Add DELETE policy for users table
-- This allows users to be deleted from auth.users, which will cascade to public.users
--
-- IMPORTANT: Run scripts/042_fix_user_deletion.sql for a complete solution
-- This file only adds the basic DELETE policies

-- Allow service role to delete any user (for admin operations in Supabase Dashboard)
DROP POLICY IF EXISTS "Service role can delete any user" ON users;
CREATE POLICY "Service role can delete any user"
  ON users FOR DELETE
  USING (auth.jwt()->>'role' = 'service_role');

-- Allow authenticated users to delete their own record (for self-deletion)
DROP POLICY IF EXISTS "Users can delete their own profile" ON users;
CREATE POLICY "Users can delete their own profile"
  ON users FOR DELETE
  USING (auth.uid() = id);

-- Note: If deletion still fails, see scripts/042_fix_user_deletion.sql for:
-- - Helper function to safely delete users and all related data
-- - Manual deletion steps
-- - Troubleshooting queries

