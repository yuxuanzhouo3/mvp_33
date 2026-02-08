# 如何填充 contact_requests 表

## 问题
`contact_requests` 表是空的，这是正常的，因为该表通过用户操作（发送好友请求）来填充。

## 添加测试数据

### 方法 1：使用 Supabase SQL Editor（推荐）

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择项目：`communication_tool`
3. 进入 **SQL Editor**
4. 打开文件 `scripts/006_seed_contact_requests.sql`
5. 复制整个 SQL 脚本内容
6. 粘贴到 SQL Editor
7. 点击 **Run** 执行

**注意**：
- 脚本会自动创建演示用户（如果不存在），所以不需要先运行 `scripts/002_seed_demo_data.sql`
- 由于 RLS（Row Level Security）策略，在 SQL Editor 中执行会自动使用正确的权限
- 如果遇到权限问题，可以临时禁用 RLS（见脚本中的注释）

### 方法 2：通过应用界面创建

1. 登录应用
2. 进入 **Contacts** 页面
3. 点击 **Add Contact** 按钮
4. 搜索其他用户
5. 发送好友请求

这样会通过 API 创建 contact requests，并且会正确设置 RLS。

### 方法 3：临时禁用 RLS（仅用于测试）

如果需要直接插入数据，可以临时禁用 RLS：

```sql
-- 禁用 RLS
ALTER TABLE contact_requests DISABLE ROW LEVEL SECURITY;

-- 运行插入脚本
-- (运行 scripts/006_seed_contact_requests.sql 的内容)

-- 重新启用 RLS
ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;
```

## 测试数据说明

脚本会创建以下测试数据：

1. **Pending 请求**：
   - Alice → Carol: "Hi Carol, would like to connect!"
   - Bob → Emma: "Let's collaborate on the marketing campaign"

2. **Accepted 请求**：
   - David → Alice: "Great working with you!" (已接受，会自动创建双向联系人)

3. **Rejected 请求**：
   - Carol → Bob: "Would like to discuss design" (已拒绝)

## 验证

执行脚本后，在 Supabase Dashboard 的 Table Editor 中查看 `contact_requests` 表，应该能看到 4 条记录。

