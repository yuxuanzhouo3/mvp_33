-- Function to find existing direct conversation between two users
-- This function performs all logic in the database, reducing network round trips
-- Usage: SELECT * FROM find_direct_conversation('user1_id', 'user2_id');

CREATE OR REPLACE FUNCTION find_direct_conversation(
  p_user1_id UUID,
  p_user2_id UUID
)
RETURNS TABLE (
  id UUID,
  workspace_id UUID,
  type VARCHAR,
  created_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  name VARCHAR,
  description TEXT,
  is_private BOOLEAN,
  created_by UUID,
  deleted_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  -- Find conversation where both users are members and has exactly 2 members
  -- This is done in a single query with subqueries for efficiency
  SELECT c.id INTO v_conversation_id
  FROM conversations c
  WHERE c.type = 'direct'
    AND c.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 
      FROM conversation_members cm1
      WHERE cm1.conversation_id = c.id 
        AND cm1.user_id = p_user1_id
        AND cm1.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1 
      FROM conversation_members cm2
      WHERE cm2.conversation_id = c.id 
        AND cm2.user_id = p_user2_id
        AND cm2.deleted_at IS NULL
    )
    -- 普通私聊：两个人；自聊：只有自己一个人
    AND (
      SELECT COUNT(*) 
      FROM conversation_members cm3
      WHERE cm3.conversation_id = c.id
    ) = CASE 
          WHEN p_user1_id = p_user2_id THEN 1 
          ELSE 2 
        END
  LIMIT 1;

  -- If found, return the conversation details
  IF v_conversation_id IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      c.id,
      c.workspace_id,
      c.type,
      c.created_at,
      c.last_message_at,
      c.name,
      c.description,
      c.is_private,
      c.created_by,
      c.deleted_at
    FROM conversations c
    WHERE c.id = v_conversation_id;
  END IF;

  -- If not found, return empty result
  RETURN;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION find_direct_conversation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION find_direct_conversation(UUID, UUID) TO anon;

-- Add comment
COMMENT ON FUNCTION find_direct_conversation IS 'Finds existing direct conversation between two users. Returns conversation details if found, empty result otherwise.';










