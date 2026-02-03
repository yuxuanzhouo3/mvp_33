-- Complete fix for registration issues
-- This script ensures all components are correctly configured

-- Step 1: Ensure the trigger function exists and is correct
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, username, full_name, avatar_url, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    'online'
  )
  ON CONFLICT (id) DO NOTHING; -- Prevent errors if user already exists
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log error but don't fail the auth user creation
    RAISE WARNING 'Failed to create user record in public.users: %', SQLERRM;
    RETURN NEW; -- Still allow auth user creation to succeed
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Ensure the trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 3: Ensure RLS is enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop existing INSERT policy if it exists (to allow re-running)
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;

-- Step 5: Create INSERT policy
CREATE POLICY "Users can insert their own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Step 6: Verify SELECT and UPDATE policies exist
DO $$
BEGIN
  -- SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'users' 
    AND schemaname = 'public'
    AND policyname = 'Users can view their own profile'
  ) THEN
    CREATE POLICY "Users can view their own profile"
      ON users FOR SELECT
      USING (auth.uid() = id);
  END IF;

  -- UPDATE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'users' 
    AND schemaname = 'public'
    AND policyname = 'Users can update their own profile'
  ) THEN
    CREATE POLICY "Users can update their own profile"
      ON users FOR UPDATE
      USING (auth.uid() = id);
  END IF;
END $$;

-- Step 7: Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON users TO authenticated;

-- Verification message
DO $$
BEGIN
  RAISE NOTICE '✓ Registration setup complete!';
  RAISE NOTICE '✓ Trigger function: handle_new_user()';
  RAISE NOTICE '✓ Trigger: on_auth_user_created on auth.users';
  RAISE NOTICE '✓ RLS: Enabled on users table';
  RAISE NOTICE '✓ Policies: SELECT, INSERT, UPDATE';
END $$;






























