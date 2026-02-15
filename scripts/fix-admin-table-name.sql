-- 修复管理员表名问题
-- 将 admins 表重命名为 admin_users 以匹配代码中的表名
--
-- 使用方法:
-- 1. 登录 Supabase Dashboard (https://supabase.com/dashboard)
-- 2. 选择你的项目
-- 3. 进入 SQL Editor
-- 4. 复制粘贴此脚本并执行

-- 重命名 admins 表为 admin_users
ALTER TABLE admins RENAME TO admin_users;

-- 更新 admin_sessions 表的外键引用
ALTER TABLE admin_sessions DROP CONSTRAINT IF EXISTS admin_sessions_admin_id_fkey;
ALTER TABLE admin_sessions ADD CONSTRAINT admin_sessions_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE;

-- 验证表已成功重命名
SELECT 'admin_users 表创建成功' AS status, COUNT(*) AS admin_count
FROM admin_users;
