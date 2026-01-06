-- Quick User Deletion Script
-- Use this when Supabase Dashboard deletion fails with "Database error deleting user"
--
-- INSTRUCTIONS:
-- 1. Replace 'YOUR-USER-ID-HERE' with the actual user ID you want to delete
-- 2. Run this script in Supabase SQL Editor
-- 3. Then delete the user from Supabase Dashboard > Authentication > Users

-- Step 1: Delete user from public.users using the helper function (bypasses RLS)
SELECT safe_delete_user('YOUR-USER-ID-HERE');

-- Step 2: Verify the user is deleted
SELECT id, email, username FROM users WHERE id = 'YOUR-USER-ID-HERE';
-- Should return no rows

-- Step 3: Go to Supabase Dashboard > Authentication > Users
-- Find the user and click Delete (this should work now since public.users record is gone)

-- ALTERNATIVE: If the helper function doesn't exist, run scripts/042_fix_user_deletion.sql first
-- Or use this direct deletion (requires service_role or superuser):

/*
-- Direct deletion (bypasses RLS)
DO $$
DECLARE
  user_id_to_delete UUID := 'YOUR-USER-ID-HERE';
BEGIN
  -- Delete related data
  DELETE FROM hidden_messages WHERE user_id = user_id_to_delete;
  UPDATE conversation_members SET deleted_at = NOW() WHERE user_id = user_id_to_delete;
  DELETE FROM contacts WHERE user_id = user_id_to_delete OR contact_user_id = user_id_to_delete;
  DELETE FROM contact_requests WHERE requester_id = user_id_to_delete OR recipient_id = user_id_to_delete;
  DELETE FROM workspace_members WHERE user_id = user_id_to_delete;
  DELETE FROM workspaces WHERE owner_id = user_id_to_delete;
  
  -- Delete user (this will work because we're in a DO block with proper permissions)
  DELETE FROM users WHERE id = user_id_to_delete;
  
  RAISE NOTICE 'User % deleted successfully', user_id_to_delete;
END $$;
*/




