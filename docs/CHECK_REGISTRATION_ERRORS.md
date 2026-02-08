# 如何检查注册错误

## 查看服务器端日志

1. 打开运行 `pnpm dev -p 3001` 的终端窗口
2. 查找包含 "Database error saving new user" 的日志
3. 记录以下信息：
   - `code`: 错误代码（如 42501, 23505, 42703）
   - `message`: 错误消息
   - `details`: 错误详情
   - `hint`: 修复提示

## 查看 Supabase Logs

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择项目：`communication_tool`
3. 进入 **Logs** > **Postgres Logs** 或 **API Logs**
4. 查找最近的错误日志
5. 查看详细的错误信息

## 常见错误代码

- **42501**: 权限错误 - 需要运行 `scripts/008_add_users_insert_policy.sql`
- **23505**: 唯一约束违反 - 用户已存在，尝试登录
- **42703**: 列不存在 - 表结构问题
- **422**: 用户已注册 - 尝试登录而不是注册

## 如果邮箱已注册但无法登录

如果 auth 用户存在但 users 表记录不存在：

1. 在 Supabase Dashboard 中，进入 **Authentication > Users**
2. 找到该用户
3. 复制用户的 ID
4. 在 **SQL Editor** 中运行：

```sql
-- 手动创建 users 表记录
INSERT INTO users (id, email, username, full_name, status)
VALUES (
  'USER_ID_HERE',  -- 替换为实际的用户 ID
  'user@example.com',  -- 替换为实际的邮箱
  'username',  -- 替换为用户名
  'Full Name',  -- 替换为姓名
  'online'
)
ON CONFLICT (id) DO NOTHING;
```






























