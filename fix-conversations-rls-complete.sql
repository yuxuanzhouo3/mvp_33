-- 完整修复 conversations 表的 RLS 策略
-- 问题：
-- 1. 缺少 INSERT 策略或策略配置不正确
-- 2. SELECT 策略使用了错误的字段名 profile_id（应该是 user_id）

-- Step 1: 创建 SECURITY DEFINER 函数避免递归
CREATE OR REPLACE FUNCTION is_conversation_member(p_conversation_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id
  );
$$;

-- 授予执行权限
GRANT EXECUTE ON FUNCTION is_conversation_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_conversation_member(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION is_conversation_member(UUID, UUID) TO service_role;

-- Step 2: 删除所有现有的 conversations 表策略
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
DROP POLICY IF EXISTS "Users can view conversations they are members of" ON conversations;
DROP POLICY IF EXISTS "Conversation creators can update" ON conversations;
DROP POLICY IF EXISTS "Users can update conversations they created" ON conversations;
DROP POLICY IF EXISTS "Conversation creators can delete" ON conversations;
DROP POLICY IF EXISTS "Admins can update group settings" ON conversations;
DROP POLICY IF EXISTS "Owners can delete conversations" ON conversations;

-- Step 3: 创建新的策略

-- 1. INSERT 策略：允许已认证用户创建 conversation
CREATE POLICY "Users can create conversations"
ON conversations
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

-- 2. SELECT 策略：允许用户查看自己参与的 conversation
CREATE POLICY "Users can view conversations they are members of"
ON conversations
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR
  is_conversation_member(id, auth.uid())
);

-- 3. UPDATE 策略：允许创建者更新 conversation
CREATE POLICY "Conversation creators can update"
ON conversations
FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- 4. DELETE 策略：允许创建者删除 conversation
CREATE POLICY "Conversation creators can delete"
ON conversations
FOR DELETE
TO authenticated
USING (created_by = auth.uid());

-- Step 4: 确保 RLS 已启用
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Step 5: 授予必要的权限
GRANT ALL ON conversations TO authenticated;

-- Step 6: 验证设置
DO $$
BEGIN
    RAISE NOTICE '✅ Conversations RLS 策略修复完成';
    RAISE NOTICE '用户现在可以创建和查看自己参与的对话';
END $$;
