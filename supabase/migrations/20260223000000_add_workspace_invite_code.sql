-- ============================================================
-- 添加工作区邀请码功能
-- ============================================================

-- 给 workspaces 表添加 invite_code 字段
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS invite_code VARCHAR(50);

-- 创建唯一索引（允许 NULL 值）
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_invite_code
ON workspaces(invite_code)
WHERE invite_code IS NOT NULL;

-- 为现有工作区生成邀请码（基于工作区名称生成唯一邀请码）
UPDATE workspaces
SET invite_code = UPPER(
  SUBSTRING(name FROM 1 FOR 4) ||
  REPLACE(TO_CHAR(created_at, 'YYMMDD'), ' ', '') ||
  SUBSTRING(domain FROM LENGTH(domain)-3 FOR 4)
)
WHERE invite_code IS NULL;

-- 添加注释
COMMENT ON COLUMN workspaces.invite_code IS '工作区邀请码，用户可以通过邀请码加入工作区';
