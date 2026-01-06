-- Create demo auth users for testing
-- This script creates users in auth.users and then in public.users
-- IMPORTANT: This requires admin/service role permissions

-- Note: Supabase doesn't allow direct INSERT into auth.users
-- You need to use the Supabase Admin API or create users through the application

-- Option 1: Use Supabase Dashboard to create users manually
-- 1. Go to Authentication > Users
-- 2. Click "Add user" for each demo user
-- 3. Use the emails: alice@company.com, bob@company.com, etc.
-- 4. Set temporary passwords (users can change them later)
-- 5. The trigger will automatically create public.users records

-- Option 2: Use Supabase Management API (requires service role key)
-- You can use the Supabase client library or curl to create users:
-- 
-- curl -X POST 'https://YOUR_PROJECT.supabase.co/auth/v1/admin/users' \
--   -H "apikey: YOUR_SERVICE_ROLE_KEY" \
--   -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
--   -H "Content-Type: application/json" \
--   -d '{
--     "email": "alice@company.com",
--     "password": "password123",
--     "user_metadata": {
--       "full_name": "Alice Zhang",
--       "username": "alice"
--     }
--   }'

-- Option 3: Create users through the application registration
-- Register each user through the app's registration form

-- After creating auth users, the trigger will automatically create public.users records
-- Then you can update the public.users records with additional info:

-- Update demo users with additional information (after they're created in auth)
UPDATE users SET
  username = 'alice',
  full_name = 'Alice Zhang',
  avatar_url = '/placeholder.svg?height=40&width=40',
  department = 'Engineering',
  title = 'Senior Software Engineer',
  status = 'online'
WHERE email = 'alice@company.com';

UPDATE users SET
  username = 'bob',
  full_name = 'Bob Smith',
  avatar_url = '/placeholder.svg?height=40&width=40',
  department = 'Product',
  title = 'Product Manager',
  status = 'online'
WHERE email = 'bob@company.com';

UPDATE users SET
  username = 'carol',
  full_name = 'Carol Wang',
  avatar_url = '/placeholder.svg?height=40&width=40',
  department = 'Design',
  title = 'UI/UX Designer',
  status = 'away'
WHERE email = 'carol@company.com';

UPDATE users SET
  username = 'david',
  full_name = 'David Lee',
  avatar_url = '/placeholder.svg?height=40&width=40',
  department = 'Engineering',
  title = 'Engineering Manager',
  status = 'online'
WHERE email = 'david@company.com';

UPDATE users SET
  username = 'emma',
  full_name = 'Emma Brown',
  avatar_url = '/placeholder.svg?height=40&width=40',
  department = 'Marketing',
  title = 'Marketing Director',
  status = 'busy'
WHERE email = 'emma@company.com';

