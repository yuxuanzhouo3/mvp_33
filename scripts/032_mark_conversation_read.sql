-- Function: mark_conversation_read
-- 将指定会话对指定用户标记为已读（使用数据库服务器时间）

CREATE OR REPLACE FUNCTION mark_conversation_read(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_member BOOLEAN;
BEGIN
  -- 确认用户是这个会话的成员
  SELECT EXISTS (
    SELECT 1
    FROM conversation_members
    WHERE conversation_id = p_conversation_id
      AND user_id = p_user_id
      AND deleted_at IS NULL
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'User % is not a member of conversation %', p_user_id, p_conversation_id;
  END IF;

  -- 使用数据库当前时间更新 last_read_at，避免客户端和服务器时间不一致
  UPDATE conversation_members
  SET last_read_at = NOW()
  WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_conversation_read(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_conversation_read(UUID, UUID) TO anon;

COMMENT ON FUNCTION mark_conversation_read IS 'Marks a conversation as read for a user by setting last_read_at to NOW() on the server.';









































































































