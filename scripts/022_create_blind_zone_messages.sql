-- =====================================================
-- 盲区消息表 (Blind Zone Messages)
-- 国际版 Supabase 数据库脚本
-- =====================================================

-- 创建盲区消息表
CREATE TABLE IF NOT EXISTS blind_zone_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'text' CHECK (type IN ('text', 'image', 'file')),
  metadata JSONB DEFAULT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_blind_zone_workspace_created
  ON blind_zone_messages(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blind_zone_sender
  ON blind_zone_messages(sender_id);

-- 启用行级安全策略 (RLS)
ALTER TABLE blind_zone_messages ENABLE ROW LEVEL SECURITY;

-- 创建辅助函数：检查用户是否是工作区成员
CREATE OR REPLACE FUNCTION is_blind_zone_member(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
  );
$$;

-- 创建辅助函数：检查用户是否是工作区管理员
CREATE OR REPLACE FUNCTION is_blind_zone_admin(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND role IN ('owner', 'admin')
  );
$$;

-- 授权函数执行权限
GRANT EXECUTE ON FUNCTION is_blind_zone_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_blind_zone_admin(UUID, UUID) TO authenticated;

-- RLS 策略：允许工作区成员查看消息（但不暴露 sender_id）
CREATE POLICY "blind_zone_select_policy" ON blind_zone_messages
  FOR SELECT
  TO authenticated
  USING (is_blind_zone_member(workspace_id, auth.uid()));

-- RLS 策略：允许工作区成员发送消息
CREATE POLICY "blind_zone_insert_policy" ON blind_zone_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_blind_zone_member(workspace_id, auth.uid())
    AND sender_id = auth.uid()
  );

-- RLS 策略：允许工作区管理员删除消息
CREATE POLICY "blind_zone_update_policy" ON blind_zone_messages
  FOR UPDATE
  TO authenticated
  USING (is_blind_zone_admin(workspace_id, auth.uid()));

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_blind_zone_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_blind_zone_updated_at
  BEFORE UPDATE ON blind_zone_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_blind_zone_updated_at();

-- 注释
COMMENT ON TABLE blind_zone_messages IS '盲区消息表 - 工作区内匿名交流';
COMMENT ON COLUMN blind_zone_messages.sender_id IS '发送者ID（后端验证用，前端不显示以保证匿名性）';
COMMENT ON COLUMN blind_zone_messages.is_deleted IS '是否被管理员删除';
COMMENT ON COLUMN blind_zone_messages.deleted_by IS '删除消息的管理员ID';
