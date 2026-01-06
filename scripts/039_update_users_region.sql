-- Update existing users to set region field based on database location
-- This script sets region='global' for all users in Supabase (since they're in the global database)
-- Run this in Supabase SQL Editor

-- Update all users in Supabase to have region='global' if not set
UPDATE users
SET region = 'global'
WHERE region IS NULL OR region NOT IN ('cn', 'global');

-- Verify the update
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN region = 'global' THEN 1 END) as global_users,
  COUNT(CASE WHEN region = 'cn' THEN 1 END) as cn_users,
  COUNT(CASE WHEN region IS NULL THEN 1 END) as null_region_users
FROM users;

-- Note: For CloudBase users, you need to run a similar update in CloudBase
-- Since CloudBase is NoSQL, you'll need to update each user document individually
-- All users in CloudBase should have region='cn'




































































