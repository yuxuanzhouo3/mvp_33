-- Test script to check if status update works
-- Run this in Supabase SQL Editor to diagnose the issue

-- First, check current user status
SELECT id, email, status, updated_at 
FROM users 
ORDER BY updated_at DESC 
LIMIT 5;

-- Check if there are any triggers on users table
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users';

-- Check RLS policies on users table
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
WHERE tablename = 'users';

-- Try to manually update a user's status (replace USER_ID with actual user ID)
-- This will help us see if the update works at all
-- SELECT id, email FROM users LIMIT 1; -- Get a user ID first
-- UPDATE users SET status = 'online', updated_at = NOW() WHERE id = 'USER_ID_HERE';





























