-- Diagnostic script to check registration setup
-- Run this to verify all components are correctly configured

-- 1. Check if users table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public') THEN
    RAISE NOTICE '✓ users table exists';
  ELSE
    RAISE NOTICE '✗ users table does NOT exist - Run scripts/003_supabase_setup.sql';
  END IF;
END $$;

-- 2. Check if trigger function exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user' AND pronamespace = 'public'::regnamespace) THEN
    RAISE NOTICE '✓ handle_new_user function exists';
  ELSE
    RAISE NOTICE '✗ handle_new_user function does NOT exist - Run scripts/003_supabase_setup.sql';
  END IF;
END $$;

-- 3. Check if trigger exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE t.tgname = 'on_auth_user_created' 
    AND c.relname = 'users'
    AND c.relnamespace = 'auth'::regnamespace
  ) THEN
    RAISE NOTICE '✓ on_auth_user_created trigger exists on auth.users';
  ELSE
    RAISE NOTICE '✗ on_auth_user_created trigger does NOT exist - Run scripts/003_supabase_setup.sql';
  END IF;
END $$;

-- 4. Check if INSERT policy exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'users' 
    AND schemaname = 'public'
    AND policyname = 'Users can insert their own profile'
  ) THEN
    RAISE NOTICE '✓ INSERT policy exists';
  ELSE
    RAISE NOTICE '✗ INSERT policy does NOT exist - Run scripts/008_add_users_insert_policy.sql';
  END IF;
END $$;

-- 5. Check RLS status
DO $$
DECLARE
  rls_enabled boolean;
BEGIN
  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class 
  WHERE relname = 'users' 
  AND relnamespace = 'public'::regnamespace
  LIMIT 1;
  
  IF rls_enabled THEN
    RAISE NOTICE '✓ RLS is enabled on users table';
  ELSE
    RAISE NOTICE '✗ RLS is NOT enabled on users table';
  END IF;
END $$;

-- 6. Show all policies on users table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as command
FROM pg_policies 
WHERE tablename = 'users' AND schemaname = 'public'
ORDER BY policyname;

-- 7. Show trigger function definition (if exists)
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'handle_new_user' 
AND n.nspname = 'public'
LIMIT 1;

