# Supabase 实现指南

## 已完成的集成

### 1. 环境变量配置 ✅

已创建 `.env.local` 文件，包含：
- `NEXT_PUBLIC_SUPABASE_URL`: https://kradpewmiizgughuxveg.supabase.co
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: [已配置]

### 2. 数据库服务 (`lib/supabase/database.ts`) ✅

创建了完整的数据库服务，包括：
- 用户操作：`getUserById`, `getUserByEmail`, `createUser`, `updateUser`
- 工作区操作：`getWorkspaceById`, `getUserWorkspaces`
- 对话操作：`getUserConversations`
- 消息操作：`getMessages`, `createMessage`

### 3. API 路由更新 ✅

#### 注册 API (`app/api/auth/register/route.ts`)
- 使用 Supabase Auth 创建用户
- 自动同步到 `users` 表
- 返回用户信息和访问 token

#### 登录 API (`app/api/auth/login/route.ts`)
- 使用 Supabase Auth 验证密码
- 自动创建或更新用户记录
- 返回用户信息和访问 token

#### Google OAuth (`app/api/auth/oauth/google/`)
- 使用 Supabase OAuth 流程
- 自动处理用户创建和会话管理

### 4. 数据库设置脚本 ✅

创建了 `scripts/003_supabase_setup.sql`，包含：
- 完整的数据库表结构
- 自动触发器（同步 auth.users 到 users 表）
- Row Level Security (RLS) 策略
- 索引优化

## 下一步：设置数据库

**详细配置指南请查看：[SUPABASE_CONFIG.md](./SUPABASE_CONFIG.md)**

### 1. 在 Supabase Dashboard 中运行 SQL

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择项目：`communication_tool` (kradpewmiizgughuxveg)
3. 进入 **SQL Editor**
4. 运行 `scripts/003_supabase_setup.sql` 创建表结构

### 2. 配置 Site URL 和 Redirect URLs（重要！）

1. 在 Supabase Dashboard 中，进入 **Authentication** > **URL Configuration**
2. 设置 **Site URL**：`http://localhost:3001`
3. 添加 **Redirect URLs**：
   - `http://localhost:3001/**`
   - `http://localhost:3001/api/auth/oauth/google/callback`
   - `http://localhost:3001/login`

### 3. 配置 Google OAuth（可选）

1. 在 Supabase Dashboard 中，进入 **Authentication** > **Providers**
2. 启用 **Google** Provider
3. 配置 Google OAuth 凭据
4. **重要**：在 Google Cloud Console 中，设置重定向 URI 为：
   ```
   https://kradpewmiizgughuxveg.supabase.co/auth/v1/callback
   ```
   这是 Supabase 的回调地址，不是你的应用地址！

### 3. 测试注册和登录

1. 启动开发服务器：`pnpm dev -p 3001`
2. 访问 `http://localhost:3001/login`
3. 测试注册新用户
4. 测试登录功能

## 数据库结构

### 主要表

1. **users** - 用户信息（与 auth.users 同步）
2. **workspaces** - 工作区
3. **workspace_members** - 工作区成员
4. **conversations** - 对话（频道、群组、私信）
5. **conversation_members** - 对话成员
6. **messages** - 消息
7. **contacts** - 联系人
8. **departments** - 部门
9. **user_profiles** - 用户扩展信息

### 自动触发器

- `handle_new_user()` - 当 auth.users 创建新用户时，自动在 users 表创建记录
- `update_updated_at_column()` - 自动更新 updated_at 字段

### Row Level Security (RLS)

已启用 RLS 并配置了基本策略：
- 用户只能查看和更新自己的资料
- 用户只能查看他们所属的工作区
- 用户只能查看他们参与的对话和消息

## 功能特性

1. **自动用户同步**：Supabase Auth 用户自动同步到 users 表
2. **安全认证**：使用 Supabase Auth 处理密码哈希和验证
3. **会话管理**：自动处理 token 刷新和会话管理
4. **实时支持**：Supabase 支持实时订阅（可扩展）

## 注意事项

1. **首次运行**：需要先在 Supabase Dashboard 运行 SQL 脚本创建表
2. **RLS 策略**：可能需要根据实际需求调整 RLS 策略
3. **外键关系**：确保所有外键关系正确配置
4. **索引**：已创建必要的索引以优化查询性能

## 故障排除

如果遇到问题：

1. 检查 `.env.local` 文件中的 Supabase 凭据
2. 确认数据库表已创建（在 Supabase Dashboard 的 Table Editor 中查看）
3. 检查 Supabase Dashboard 的 Logs 查看错误信息
4. 确认 RLS 策略允许当前操作

