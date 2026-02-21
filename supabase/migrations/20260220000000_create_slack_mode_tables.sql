-- ============================================================
-- Slack/Boss Mode Migration
-- 聊天核心逻辑从"强好友关系"转变为"基于 Workspace 的开放社交"
-- ============================================================

-- ============================================================
-- 1. 扩展 users 表：添加隐私设置字段
-- ============================================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS allow_non_friend_messages BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN users.allow_non_friend_messages IS '是否允许非好友直接发送消息，默认允许';

-- ============================================================
-- 2. 创建拉黑表 blocked_users
-- ============================================================

CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(blocker_id, blocked_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker_id ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_id ON blocked_users(blocked_id);

-- RLS
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能查看自己的拉黑列表
CREATE POLICY "Users can view their own blocked users"
ON blocked_users FOR SELECT
TO authenticated
USING (auth.uid() = blocker_id);

-- RLS 策略：用户只能拉黑/取消拉黑自己
CREATE POLICY "Users can manage their own blocked users"
ON blocked_users FOR ALL
TO authenticated
USING (auth.uid() = blocker_id)
WITH CHECK (auth.uid() = blocker_id);

-- ============================================================
-- 3. 创建举报表 reports
-- ============================================================

CREATE TYPE report_type AS ENUM ('spam', 'harassment', 'inappropriate', 'other');
CREATE TYPE report_status AS ENUM ('pending', 'reviewing', 'resolved', 'dismissed');

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type report_type NOT NULL,
  description TEXT,
  status report_status DEFAULT 'pending',
  admin_notes TEXT,
  handled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  handled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user_id ON reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能查看自己提交的举报
CREATE POLICY "Users can view their own reports"
ON reports FOR SELECT
TO authenticated
USING (auth.uid() = reporter_id);

-- RLS 策略：用户可以提交举报
CREATE POLICY "Users can create reports"
ON reports FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = reporter_id);

-- RLS 策略：管理员可以查看和更新所有举报（通过 service_role）
CREATE POLICY "Service role can manage all reports"
ON reports FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================
-- 4. 创建 workspace_members 表（如果不存在）
-- ============================================================

CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'guest')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, user_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);

-- RLS
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- RLS 策略：工作区成员可以查看其他成员
CREATE POLICY "Workspace members can view other members"
ON workspace_members FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = workspace_members.workspace_id
    AND wm.user_id = auth.uid()
  )
);

-- RLS 策略：service_role 可以管理所有成员
CREATE POLICY "Service role can manage workspace members"
ON workspace_members FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================
-- 5. 触发器：自动更新 updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 为 reports 表添加触发器
DROP TRIGGER IF EXISTS update_reports_updated_at ON reports;
CREATE TRIGGER update_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
