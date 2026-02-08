-- Add INSERT policy for users table
-- This allows users to insert their own record during registration
-- The trigger should handle this automatically, but this policy ensures manual inserts work too

-- Step 1: Check if trigger exists and is working
-- The trigger handle_new_user() should automatically create users when auth.users is created
-- But we also need INSERT policy for manual inserts

-- Step 2: Drop existing policy if it exists (to allow re-running)
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;

-- Step 3: Create INSERT policy
-- This allows users to insert their own record (when id = auth.uid())
CREATE POLICY "Users can insert their own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Step 4: Verify the trigger exists
-- If the trigger doesn't exist, create it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    -- Trigger doesn't exist, create it
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- Step 5: Verify the function exists
-- If the function doesn't exist, create it
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING; -- Prevent errors if user already exists
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

