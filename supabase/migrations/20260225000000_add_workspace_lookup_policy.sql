-- ============================================================
-- 添加通过邀请码公开查找工作区的 RLS 策略
-- ============================================================

-- 创建允许通过邀请码公开查找工作区的策略
-- 这样用户可以在加入工作区之前通过邀请码预览工作区信息
CREATE POLICY "Anyone can lookup workspaces by invite_code"
ON workspaces
FOR SELECT
TO authenticated, anon
USING (invite_code IS NOT NULL);

-- 添加注释
COMMENT ON POLICY "Anyone can lookup workspaces by invite_code" ON workspaces
IS '允许所有用户（包括未登录用户）通过邀请码查找工作区，用于加入工作区前的预览功能';
