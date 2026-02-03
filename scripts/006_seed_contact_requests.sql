-- Seed contact requests for testing
-- This script adds some sample contact requests between demo users

-- IMPORTANT PREREQUISITE:
-- Before running this script, you MUST create the demo users in Supabase Auth first!
-- The users table has a foreign key constraint to auth.users
-- 
-- Steps:
-- 1. Create users through the application registration OR
-- 2. Use Supabase Dashboard: Authentication > Users > Add user
--    Create users with emails: alice@company.com, bob@company.com, carol@company.com, david@company.com, emma@company.com
-- 3. After auth users are created, the trigger will auto-create public.users records
-- 4. Then run scripts/007_create_demo_auth_users.sql to update user details
-- 5. Finally, run this script to create contact requests

-- IMPORTANT: Due to RLS policies, you need to run this as a service role or temporarily disable RLS
-- Option 1: Run in Supabase SQL Editor with service role (recommended)
-- Option 2: Temporarily disable RLS, insert data, then re-enable RLS

-- Get user IDs from existing users (they must exist in auth.users first)
-- We'll use a subquery to get the actual user IDs

-- Option: Temporarily disable RLS (uncomment if needed)
-- ALTER TABLE contact_requests DISABLE ROW LEVEL SECURITY;

-- Insert sample contact requests using actual user IDs from the database
-- This uses subqueries to get user IDs by email
INSERT INTO contact_requests (id, requester_id, recipient_id, message, status, created_at)
SELECT 
  gen_random_uuid(),
  (SELECT id FROM users WHERE email = 'alice@company.com'),
  (SELECT id FROM users WHERE email = 'carol@company.com'),
  'Hi Carol, would like to connect!',
  'pending',
  NOW() - INTERVAL '2 hours'
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'alice@company.com')
  AND EXISTS (SELECT 1 FROM users WHERE email = 'carol@company.com')
  AND NOT EXISTS (
    SELECT 1 FROM contact_requests 
    WHERE requester_id = (SELECT id FROM users WHERE email = 'alice@company.com')
      AND recipient_id = (SELECT id FROM users WHERE email = 'carol@company.com')
  );

INSERT INTO contact_requests (id, requester_id, recipient_id, message, status, created_at)
SELECT 
  gen_random_uuid(),
  (SELECT id FROM users WHERE email = 'bob@company.com'),
  (SELECT id FROM users WHERE email = 'emma@company.com'),
  'Let''s collaborate on the marketing campaign',
  'pending',
  NOW() - INTERVAL '1 hour'
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'bob@company.com')
  AND EXISTS (SELECT 1 FROM users WHERE email = 'emma@company.com')
  AND NOT EXISTS (
    SELECT 1 FROM contact_requests 
    WHERE requester_id = (SELECT id FROM users WHERE email = 'bob@company.com')
      AND recipient_id = (SELECT id FROM users WHERE email = 'emma@company.com')
  );

INSERT INTO contact_requests (id, requester_id, recipient_id, message, status, created_at)
SELECT 
  gen_random_uuid(),
  (SELECT id FROM users WHERE email = 'david@company.com'),
  (SELECT id FROM users WHERE email = 'alice@company.com'),
  'Great working with you!',
  'accepted',
  NOW() - INTERVAL '1 day'
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'david@company.com')
  AND EXISTS (SELECT 1 FROM users WHERE email = 'alice@company.com')
  AND NOT EXISTS (
    SELECT 1 FROM contact_requests 
    WHERE requester_id = (SELECT id FROM users WHERE email = 'david@company.com')
      AND recipient_id = (SELECT id FROM users WHERE email = 'alice@company.com')
  );

INSERT INTO contact_requests (id, requester_id, recipient_id, message, status, created_at)
SELECT 
  gen_random_uuid(),
  (SELECT id FROM users WHERE email = 'carol@company.com'),
  (SELECT id FROM users WHERE email = 'bob@company.com'),
  'Would like to discuss design',
  'rejected',
  NOW() - INTERVAL '3 days'
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'carol@company.com')
  AND EXISTS (SELECT 1 FROM users WHERE email = 'bob@company.com')
  AND NOT EXISTS (
    SELECT 1 FROM contact_requests 
    WHERE requester_id = (SELECT id FROM users WHERE email = 'carol@company.com')
      AND recipient_id = (SELECT id FROM users WHERE email = 'bob@company.com')
  );

-- For accepted requests, ensure contacts exist (bidirectional)
INSERT INTO contacts (user_id, contact_user_id, is_favorite)
SELECT 
  (SELECT id FROM users WHERE email = 'david@company.com'),
  (SELECT id FROM users WHERE email = 'alice@company.com'),
  false
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'david@company.com')
  AND EXISTS (SELECT 1 FROM users WHERE email = 'alice@company.com')
  AND NOT EXISTS (
    SELECT 1 FROM contacts 
    WHERE user_id = (SELECT id FROM users WHERE email = 'david@company.com')
      AND contact_user_id = (SELECT id FROM users WHERE email = 'alice@company.com')
  );

INSERT INTO contacts (user_id, contact_user_id, is_favorite)
SELECT 
  (SELECT id FROM users WHERE email = 'alice@company.com'),
  (SELECT id FROM users WHERE email = 'david@company.com'),
  false
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'alice@company.com')
  AND EXISTS (SELECT 1 FROM users WHERE email = 'david@company.com')
  AND NOT EXISTS (
    SELECT 1 FROM contacts 
    WHERE user_id = (SELECT id FROM users WHERE email = 'alice@company.com')
      AND contact_user_id = (SELECT id FROM users WHERE email = 'david@company.com')
  );

-- Option: Re-enable RLS if you disabled it (uncomment if needed)
-- ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;

