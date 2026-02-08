# Supabase 完整配置指南（本地 3001 运行）

## 📋 配置清单

### 1. 环境变量配置（`.env.local`）

在项目根目录创建或更新 `.env.local` 文件：

```env
# 应用 URL（本地开发）
NEXT_PUBLIC_APP_URL=http://localhost:3001

# Supabase 配置（必需）
NEXT_PUBLIC_SUPABASE_URL=https://kradpewmiizgughuxveg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyYWRwZXdtaWl6Z3VnaHV4dmVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzOTc4MzQsImV4cCI6MjA3ODk3MzgzNH0.wh0fhkmYX-E7OBxFWMbgx4AvyW6xC7sRiTmm-mKyPzM

# 微信 OAuth 配置（可选）
WECHAT_APP_ID=your_wechat_app_id
WECHAT_APP_SECRET=your_wechat_app_secret
WECHAT_REDIRECT_URI=http://localhost:3001/api/auth/oauth/wechat/callback
```

### 2. Supabase Dashboard 配置

#### 步骤 1: 创建数据库表

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择项目：`communication_tool` (kradpewmiizgughuxveg)
3. 进入 **SQL Editor**
4. 复制 `scripts/003_supabase_setup.sql` 的全部内容
5. 粘贴到 SQL Editor 并点击 **Run** 执行

**重要**：这会创建所有必需的表、触发器、索引和 RLS 策略。

#### 步骤 2: 配置 Google OAuth（可选但推荐）

1. 在 Supabase Dashboard 中，进入 **Authentication** > **Providers**
2. 找到 **Google** 并点击启用
3. 配置 Google OAuth：
   - 在 [Google Cloud Console](https://console.cloud.google.com/) 创建 OAuth 2.0 客户端 ID
   - **授权重定向 URI**（重要！）：
     ```
     https://kradpewmiizgughuxveg.supabase.co/auth/v1/callback
     ```
   - 将 Google **Client ID** 和 **Client Secret** 填入 Supabase Google Provider 配置
4. 保存配置

**注意**：Supabase 会自动处理 OAuth 回调，所以重定向 URI 必须是 Supabase 的回调地址，而不是你的应用地址。

#### 步骤 3: 配置 Site URL（重要！）

1. 在 Supabase Dashboard 中，进入 **Authentication** > **URL Configuration**
2. 设置 **Site URL**：
   ```
   http://localhost:3001
   ```
3. 添加 **Redirect URLs**：
   ```
   http://localhost:3001/**
   http://localhost:3001/api/auth/oauth/google/callback
   http://localhost:3001/login
   ```

这确保 OAuth 回调能正确重定向到你的本地应用。

#### 步骤 4: 检查 RLS 策略

1. 在 Supabase Dashboard 中，进入 **Authentication** > **Policies**
2. 确认以下表的 RLS 已启用：
   - `users`
   - `workspaces`
   - `workspace_members`
   - `conversations`
   - `conversation_members`
   - `messages`

如果运行 SQL 脚本，RLS 策略应该已经自动创建。

### 3. 本地运行测试

#### 启动开发服务器

```bash
# 确保在项目根目录
cd /Users/mac-guest1/Downloads/Git/mvp_projects/mvp_33

# 启动开发服务器（端口 3001）
pnpm dev -p 3001
```

#### 测试步骤

1. **测试注册功能**
   - 访问 `http://localhost:3001/login`
   - 点击 "Create one" 注册新用户
   - 填写邮箱、密码、姓名
   - 应该成功创建用户并登录

2. **测试登录功能**
   - 使用刚才注册的账号登录
   - 应该能成功登录

3. **测试 Google OAuth**（如果已配置）
   - 点击 "Google" 登录按钮
   - 应该重定向到 Google 登录页面
   - 登录后应该重定向回应用

4. **检查数据库**
   - 在 Supabase Dashboard 中，进入 **Table Editor**
   - 查看 `users` 表，应该能看到新注册的用户

### 4. 常见问题排查

#### 问题 1: "Supabase is not configured" 错误

**原因**：环境变量未正确设置

**解决**：
1. 确认 `.env.local` 文件存在且包含正确的 Supabase 凭据
2. 重启开发服务器（环境变量更改需要重启）
3. 确认变量名正确：`NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`

#### 问题 2: OAuth 回调失败

**原因**：Redirect URL 配置不正确

**解决**：
1. 在 Supabase Dashboard 中检查 **Authentication** > **URL Configuration**
2. 确认 Site URL 设置为 `http://localhost:3001`
3. 确认 Redirect URLs 包含 `http://localhost:3001/**`
4. 对于 Google OAuth，确认 Google Cloud Console 中的重定向 URI 是 Supabase 的回调地址

#### 问题 3: 数据库表不存在

**原因**：SQL 脚本未运行

**解决**：
1. 在 Supabase Dashboard 的 SQL Editor 中运行 `scripts/003_supabase_setup.sql`
2. 检查 Table Editor 确认表已创建

#### 问题 4: RLS 策略阻止操作

**原因**：RLS 策略过于严格

**解决**：
1. 检查 Supabase Dashboard 中的 Policies
2. 确认 RLS 策略允许当前操作
3. 如果需要，可以临时禁用 RLS 进行测试（不推荐用于生产环境）

### 5. 生产环境配置

当部署到生产环境时，需要更新：

1. **环境变量**：
   ```env
   NEXT_PUBLIC_APP_URL=https://yourdomain.com
   ```

2. **Supabase Site URL**：
   - 在 Supabase Dashboard 中设置为生产域名

3. **Google OAuth Redirect URI**：
   - 在 Google Cloud Console 中添加生产环境的回调地址
   - Supabase 回调地址保持不变：`https://kradpewmiizgughuxveg.supabase.co/auth/v1/callback`

4. **Supabase Redirect URLs**：
   - 添加生产环境的 URL：`https://yourdomain.com/**`

## 📝 配置检查清单

- [ ] `.env.local` 文件已创建并包含所有必需的环境变量
- [ ] Supabase 数据库表已创建（运行 SQL 脚本）
- [ ] Supabase Site URL 设置为 `http://localhost:3001`
- [ ] Supabase Redirect URLs 包含 `http://localhost:3001/**`
- [ ] Google OAuth 已配置（如果使用）
- [ ] RLS 策略已启用并配置
- [ ] 开发服务器可以正常启动
- [ ] 注册功能可以正常工作
- [ ] 登录功能可以正常工作
- [ ] OAuth 登录可以正常工作（如果配置）

## 🔗 相关链接

- [Supabase Dashboard](https://supabase.com/dashboard)
- [Supabase 文档](https://supabase.com/docs)
- [Google Cloud Console](https://console.cloud.google.com/)

