-- Function: get_unread_counts
-- 为指定用户计算每个会话的未读消息数

CREATE OR REPLACE FUNCTION get_unread_counts(
  p_user_id UUID
)
RETURNS TABLE (
  conversation_id UUID,
  unread_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.conversation_id,
    COALESCE((
      SELECT COUNT(*)
      FROM messages m
      WHERE m.conversation_id = cm.conversation_id
        AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01'::timestamptz)
        AND m.sender_id <> p_user_id
    ), 0) AS unread_count
  FROM conversation_members cm
  WHERE cm.user_id = p_user_id
    AND cm.deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION get_unread_counts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_counts(UUID) TO anon;

COMMENT ON FUNCTION get_unread_counts IS 'Returns per-conversation unread message count for a user, based on conversation_members.last_read_at.';










































































































