-- Fix user deletion issues
-- This script addresses the "Database error deleting user" issue

-- Step 1: Add DELETE policies for users table (if not already added)
-- This allows users to be deleted when removing from Supabase Auth

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Service role can delete any user" ON users;
DROP POLICY IF EXISTS "Users can delete their own profile" ON users;

-- Allow service role to delete any user (for admin operations in Supabase Dashboard)
CREATE POLICY "Service role can delete any user"
  ON users FOR DELETE
  USING (auth.jwt()->>'role' = 'service_role');

-- Allow authenticated users to delete their own record (for self-deletion)
CREATE POLICY "Users can delete their own profile"
  ON users FOR DELETE
  USING (auth.uid() = id);

-- Step 2: Verify foreign key constraints
-- The users table has: id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
-- This means deleting from auth.users should automatically delete from public.users
-- However, RLS might be blocking the CASCADE delete

-- Step 3: If deletion still fails, you may need to:
-- 1. Temporarily disable RLS for deletion (NOT RECOMMENDED for production)
-- 2. Or manually delete related records first, then delete the user

-- Helper function to safely delete a user and all related data
-- This function uses SECURITY DEFINER to bypass RLS policies
-- Usage: SELECT safe_delete_user('user-id-here');
CREATE OR REPLACE FUNCTION safe_delete_user(user_id_to_delete UUID)
RETURNS void AS $$
BEGIN
  -- Delete in order to respect foreign key constraints:
  -- Note: This function runs with SECURITY DEFINER, so it bypasses RLS
  
  -- 1. Delete hidden messages
  DELETE FROM hidden_messages WHERE user_id = user_id_to_delete;
  
  -- 2. Note: Message reactions are stored in messages.reactions JSONB field
  -- They will be automatically handled when messages are deleted or updated
  
  -- 3. Soft delete conversation memberships (set deleted_at)
  UPDATE conversation_members 
  SET deleted_at = NOW() 
  WHERE user_id = user_id_to_delete AND deleted_at IS NULL;
  
  -- 4. Delete contacts (bidirectional)
  DELETE FROM contacts WHERE user_id = user_id_to_delete OR contact_user_id = user_id_to_delete;
  
  -- 5. Delete contact requests
  DELETE FROM contact_requests WHERE requester_id = user_id_to_delete OR recipient_id = user_id_to_delete;
  
  -- 6. Delete workspace memberships
  DELETE FROM workspace_members WHERE user_id = user_id_to_delete;
  
  -- 7. Delete workspaces owned by this user (CASCADE will handle related data)
  DELETE FROM workspaces WHERE owner_id = user_id_to_delete;
  
  -- 8. Delete user profile (bypasses RLS due to SECURITY DEFINER)
  DELETE FROM users WHERE id = user_id_to_delete;
  
  -- 9. Finally, delete from auth.users (this must be done via Supabase Admin API or Dashboard)
  -- Note: You cannot delete from auth.users directly via SQL in most Supabase setups
  -- Use Supabase Dashboard > Authentication > Users > Delete User
  
  RAISE NOTICE 'User % and related data deleted successfully from public.users', user_id_to_delete;
  RAISE NOTICE 'IMPORTANT: You must also delete the user from auth.users via Supabase Dashboard';
EXCEPTION
  WHEN others THEN
    RAISE EXCEPTION 'Error deleting user %: %', user_id_to_delete, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: If you still get errors, check for any remaining foreign key constraints
-- Run this query to see all tables that reference users:
/*
SELECT 
    tc.table_name, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE constraint_type = 'FOREIGN KEY' 
  AND ccu.table_name = 'users'
ORDER BY tc.table_name;
*/

-- Step 5: To delete a user (run in Supabase SQL Editor):
/*
-- IMPORTANT: Supabase Dashboard deletion may fail due to RLS.
-- Use this SQL function instead, then delete from Dashboard.

-- Option A: Use the helper function (RECOMMENDED - bypasses RLS)
SELECT safe_delete_user('user-id-here');
-- Then go to Supabase Dashboard > Authentication > Users and delete the user there

-- Option B: If helper function doesn't work, manually delete (with SECURITY DEFINER)
-- This requires creating a temporary function or using service_role
BEGIN;
  -- Temporarily disable RLS for this transaction (requires superuser)
  ALTER TABLE users DISABLE ROW LEVEL SECURITY;
  
  -- Delete related data first
  DELETE FROM hidden_messages WHERE user_id = 'user-id-here';
  UPDATE conversation_members SET deleted_at = NOW() WHERE user_id = 'user-id-here';
  DELETE FROM contacts WHERE user_id = 'user-id-here' OR contact_user_id = 'user-id-here';
  DELETE FROM contact_requests WHERE requester_id = 'user-id-here' OR recipient_id = 'user-id-here';
  DELETE FROM workspace_members WHERE user_id = 'user-id-here';
  DELETE FROM workspaces WHERE owner_id = 'user-id-here';
  DELETE FROM users WHERE id = 'user-id-here';
  
  -- Re-enable RLS
  ALTER TABLE users ENABLE ROW LEVEL SECURITY;
COMMIT;
-- Then delete from auth.users via Dashboard
*/

-- Step 6: Quick fix - If you just need to delete from public.users table:
-- Run this in SQL Editor (bypasses RLS using the helper function):
-- SELECT safe_delete_user('user-id-here');

