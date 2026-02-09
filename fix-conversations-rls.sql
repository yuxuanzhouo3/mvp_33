-- 修复 conversations 表的 RLS 策略
-- 问题：用户无法创建群聊，因为缺少 INSERT 策略

-- 先删除可能存在的旧策略（如果不存在会报错，可以忽略）
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
DROP POLICY IF EXISTS "Conversation creators can update" ON conversations;
DROP POLICY IF EXISTS "Conversation creators can delete" ON conversations;

-- 1. 允许已认证用户创建 conversation（群聊或私聊）
CREATE POLICY "Users can create conversations"
ON conversations
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

-- 2. 允许用户查看自己参与的 conversation
CREATE POLICY "Users can view their conversations"
ON conversations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_members.conversation_id = conversations.id
    AND conversation_members.user_id = auth.uid()
  )
);

-- 3. 允许 conversation 创建者更新 conversation
CREATE POLICY "Conversation creators can update"
ON conversations
FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- 4. 允许 conversation 创建者删除 conversation
CREATE POLICY "Conversation creators can delete"
ON conversations
FOR DELETE
TO authenticated
USING (created_by = auth.uid());
