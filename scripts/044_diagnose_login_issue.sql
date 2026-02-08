-- Diagnose Login Issues
-- Use this script to check why a user cannot login even though they exist in both auth.users and public.users
--
-- INSTRUCTIONS:
-- 1. Replace 'YOUR-EMAIL-HERE' with the actual email address
-- 2. Run this script in Supabase SQL Editor
-- 3. Check the results to identify the issue

-- Step 1: Check if user exists in auth.users
SELECT 
  'auth.users' as table_name,
  id,
  email,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data
FROM auth.users
WHERE email = 'YOUR-EMAIL-HERE'
   OR email LIKE '%+cn@%' AND email LIKE REPLACE('YOUR-EMAIL-HERE', '@', '+cn@');

-- Step 2: Check if user exists in public.users
SELECT 
  'public.users' as table_name,
  id,
  email,
  username,
  region,
  status,
  created_at,
  updated_at
FROM public.users
WHERE email = 'YOUR-EMAIL-HERE';

-- Step 3: Check if IDs match between auth.users and public.users
-- This is CRITICAL - IDs must match!
SELECT 
  au.id as auth_id,
  au.email as auth_email,
  pu.id as public_id,
  pu.email as public_email,
  pu.region,
  CASE 
    WHEN au.id = pu.id THEN '✅ IDs MATCH'
    ELSE '❌ IDs DO NOT MATCH - THIS IS THE PROBLEM!'
  END as id_match_status,
  CASE 
    WHEN au.email_confirmed_at IS NULL THEN '❌ Email NOT confirmed'
    ELSE '✅ Email confirmed'
  END as email_confirmed_status
FROM auth.users au
FULL OUTER JOIN public.users pu ON au.id = pu.id
WHERE au.email = 'YOUR-EMAIL-HERE' 
   OR pu.email = 'YOUR-EMAIL-HERE'
   OR (au.email LIKE '%+cn@%' AND au.email LIKE REPLACE('YOUR-EMAIL-HERE', '@', '+cn@'));

-- Step 4: Check for CN users with auth_email
-- CN users might have a different email in auth.users (with +cn alias)
SELECT 
  'CN User Check' as check_type,
  pu.id,
  pu.email as public_email,
  pu.auth_email,
  au.email as auth_email,
  CASE 
    WHEN pu.auth_email IS NOT NULL AND au.email = pu.auth_email THEN '✅ auth_email matches'
    WHEN pu.auth_email IS NULL THEN '⚠️ auth_email is NULL (may need to construct)'
    ELSE '❌ auth_email does not match'
  END as auth_email_status
FROM public.users pu
LEFT JOIN auth.users au ON pu.id = au.id
WHERE pu.email = 'YOUR-EMAIL-HERE' 
  AND pu.region = 'cn';

-- Step 5: Check for duplicate users (same email in different regions)
SELECT 
  'Duplicate Check' as check_type,
  email,
  COUNT(*) as count,
  STRING_AGG(region::text, ', ') as regions,
  STRING_AGG(id::text, ', ') as user_ids
FROM public.users
WHERE email = 'YOUR-EMAIL-HERE'
GROUP BY email
HAVING COUNT(*) > 1;

-- Step 6: Summary and recommendations
-- Run all queries above and check:
-- 1. Does user exist in auth.users? (Step 1)
-- 2. Does user exist in public.users? (Step 2)
-- 3. Do the IDs match? (Step 3) - THIS IS CRITICAL!
-- 4. Is email confirmed? (Step 3)
-- 5. For CN users: Does auth_email match? (Step 4)
-- 6. Are there duplicate users? (Step 5)

-- COMMON ISSUES AND FIXES:

-- Issue 1: IDs don't match
-- Fix: Delete and recreate the user, or manually update the ID
-- UPDATE public.users SET id = (SELECT id FROM auth.users WHERE email = 'YOUR-EMAIL-HERE') WHERE email = 'YOUR-EMAIL-HERE';

-- Issue 2: Email not confirmed
-- Fix: Resend confirmation email or manually confirm
-- UPDATE auth.users SET email_confirmed_at = NOW() WHERE email = 'YOUR-EMAIL-HERE';

-- Issue 3: CN user auth_email mismatch
-- Fix: Update auth_email or use the correct email for login
-- UPDATE public.users SET auth_email = (SELECT email FROM auth.users WHERE id = public.users.id) WHERE email = 'YOUR-EMAIL-HERE';

-- Issue 4: User exists in wrong region
-- Fix: Check IP detection and ensure user is in correct database




