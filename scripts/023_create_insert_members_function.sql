-- Create a SECURITY DEFINER function to insert conversation members
-- This bypasses RLS and allows inserting members when creating a conversation

-- Drop existing function if it exists (to allow changing return type)
DROP FUNCTION IF EXISTS insert_conversation_members(UUID, JSONB);

-- Create the function with corrected return type
CREATE FUNCTION insert_conversation_members(
  p_conversation_id UUID,
  p_members JSONB
)
RETURNS TABLE (
  inserted_user_id UUID,
  inserted_role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_record JSONB;
  v_user_id UUID;
  v_role TEXT;
BEGIN
  -- Loop through members and insert them
  FOR member_record IN SELECT * FROM jsonb_array_elements(p_members)
  LOOP
    v_user_id := (member_record->>'user_id')::UUID;
    v_role := COALESCE(member_record->>'role', 'member');
    
    -- Insert the member (bypasses RLS because function is SECURITY DEFINER)
    INSERT INTO conversation_members (conversation_id, user_id, role)
    VALUES (p_conversation_id, v_user_id, v_role)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    
    -- Return the inserted member
    RETURN QUERY SELECT v_user_id, v_role;
  END LOOP;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION insert_conversation_members(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_conversation_members(UUID, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION insert_conversation_members(UUID, JSONB) TO service_role;

-- Add comment
COMMENT ON FUNCTION insert_conversation_members IS 'Inserts conversation members bypassing RLS. Used when creating new conversations.';

