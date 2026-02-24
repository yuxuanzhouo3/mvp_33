-- 修复 workspace_members RLS 无限递归问题
-- 问题原因：有多个 SELECT 策略，其中一个使用子查询导致无限递归

-- 1. 删除导致无限递归的策略
DROP POLICY IF EXISTS "Workspace members can view other members" ON workspace_members;

-- 2. 删除重复的策略（保留使用 is_workspace_member 函数的）
DROP POLICY IF EXISTS "Users can view workspace members" ON workspace_members;

-- 3. 确保 is_workspace_member 函数是 SECURITY DEFINER（绕过 RLS）
CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
  );
$$;

-- 4. 重新创建正确的策略
-- 策略1：用户可以查看自己的成员资格
-- 这个策略不会有递归问题
CREATE POLICY "Users can view own memberships"
  ON workspace_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 策略2：用户可以查看同一工作区的其他成员
-- 使用 SECURITY DEFINER 函数避免递归
CREATE POLICY "Users can view workspace members in same workspace"
  ON workspace_members FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()));

-- 5. 授予函数执行权限
GRANT EXECUTE ON FUNCTION is_workspace_member(UUID, UUID) TO authenticated;
