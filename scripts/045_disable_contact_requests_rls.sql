-- Temporarily disable RLS for contact_requests table
-- This is a temporary solution to fix deletion issues when re-adding contacts
-- TODO: Re-enable RLS with proper policies later that allow deletion

-- Drop existing policies first (if they exist)
DROP POLICY IF EXISTS "Users can view their own contact requests" ON contact_requests;
DROP POLICY IF EXISTS "Users can create contact requests" ON contact_requests;
DROP POLICY IF EXISTS "Users can update their own received requests" ON contact_requests;
DROP POLICY IF EXISTS "Users can delete their own contact requests" ON contact_requests;

-- Disable RLS
ALTER TABLE contact_requests DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
DO $$
DECLARE
  rls_enabled BOOLEAN;
BEGIN
  SELECT rowsecurity INTO rls_enabled
  FROM pg_tables 
  WHERE schemaname = 'public' 
  AND tablename = 'contact_requests';
  
  IF rls_enabled = false THEN
    RAISE NOTICE '✅ RLS successfully disabled for contact_requests table';
  ELSE
    RAISE WARNING '⚠️ RLS may still be enabled for contact_requests table. Please check manually.';
  END IF;
END $$;

