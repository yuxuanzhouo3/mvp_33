-- =====================================================
-- 工作区成员管理功能 - Supabase 迁移脚本
-- 创建日期: 2026-02-24
-- 说明: 添加 admin 角色支持和 workspace_join_requests 表
-- =====================================================

-- 1. 修改 workspace_members 表，添加 admin 角色支持
ALTER TABLE workspace_members
DROP CONSTRAINT IF EXISTS workspace_members_role_check;

ALTER TABLE workspace_members
ADD CONSTRAINT workspace_members_role_check
CHECK (role IN ('owner', 'admin', 'member'));

-- 2. 创建 workspace_join_requests 表
CREATE TABLE IF NOT EXISTS workspace_join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, user_id) -- 每个用户在每个工作区只能有一个申请
);

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS idx_workspace_join_requests_workspace
ON workspace_join_requests(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_workspace_join_requests_user
ON workspace_join_requests(user_id, status);

-- 4. 启用 RLS
ALTER TABLE workspace_join_requests ENABLE ROW LEVEL SECURITY;

-- 5. 创建 RLS 策略

-- 查看权限: 申请人和工作区管理员可以查看申请
CREATE POLICY "Users can view their own requests and admins can view all"
ON workspace_join_requests FOR SELECT
TO authenticated
USING (
    auth.uid() = user_id
    OR EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = workspace_join_requests.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
);

-- 创建权限: 用户可以申请加入工作区
CREATE POLICY "Users can create join requests"
ON workspace_join_requests FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
);

-- 更新权限: 只有管理员可以审批申请
CREATE POLICY "Admins can review join requests"
ON workspace_join_requests FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = workspace_join_requests.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
    AND status = 'pending'
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = workspace_join_requests.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
    AND status IN ('approved', 'rejected')
);

-- 删除权限: 申请人可以撤回待审批的申请
CREATE POLICY "Users can delete their own pending requests"
ON workspace_join_requests FOR DELETE
TO authenticated
USING (
    auth.uid() = user_id
    AND status = 'pending'
);
