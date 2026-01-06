-- Add RLS policy to allow users to search/view other users
-- This is needed for the contact search functionality

-- Drop existing policy if it exists (to allow re-running)
DROP POLICY IF EXISTS "Users can search other users" ON users;

-- Create SELECT policy that allows authenticated users to view other users
-- This is needed for searching contacts
CREATE POLICY "Users can search other users"
  ON users FOR SELECT
  TO authenticated
  USING (true); -- Allow all authenticated users to view all users for search purposes

-- Note: This policy allows any authenticated user to view any user's profile
-- This is necessary for the contact search feature to work
-- If you need more restrictive access, you can modify this policy






























