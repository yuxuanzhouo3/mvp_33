# Supabase 集成指南

本文档说明如何配置 Supabase 用于 Google OAuth 登录。

## 1. 创建 Supabase 项目

1. 访问 [Supabase](https://supabase.com/)
2. 注册并登录账号
3. 创建新项目
4. 等待项目初始化完成（通常需要 1-2 分钟）

## 2. 配置 Google OAuth Provider

1. 在 Supabase Dashboard 中，进入 **Authentication** > **Providers**
2. 找到 **Google** 并启用它
3. 配置 Google OAuth：
   - 在 [Google Cloud Console](https://console.cloud.google.com/) 创建 OAuth 2.0 客户端 ID
   - 授权重定向 URI：`https://your-project.supabase.co/auth/v1/callback`
   - 将 Google Client ID 和 Client Secret 填入 Supabase Google Provider 配置
4. 保存配置

## 3. 获取 Supabase 凭据

1. 在 Supabase Dashboard 中，进入 **Settings** > **API**
2. 复制以下信息：
   - **Project URL** (NEXT_PUBLIC_SUPABASE_URL)
   - **anon/public key** (NEXT_PUBLIC_SUPABASE_ANON_KEY)

## 4. 配置环境变量

在项目根目录的 `.env.local` 文件中添加：

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

## 5. 数据库设置（可选）

如果需要存储用户信息到 Supabase 数据库：

1. 在 Supabase Dashboard 中，进入 **SQL Editor**
2. 运行项目中的 `scripts/001_create_schema.sql` 创建表结构
3. 运行 `scripts/002_seed_demo_data.sql` 添加示例数据（可选）

## 优势

使用 Supabase 进行 Google OAuth 的优势：

1. **简化配置**：无需手动处理 OAuth 流程
2. **自动会话管理**：Supabase 自动处理 token 刷新
3. **安全性**：使用 HTTP-only cookies 存储会话
4. **数据库集成**：可直接使用 Supabase 数据库存储用户信息
5. **实时功能**：可轻松添加实时功能（如实时消息）

## API 路由说明

### Google OAuth 登录

**GET** `/api/auth/oauth/google?action=login`

- 使用 Supabase 的 `signInWithOAuth` 方法
- 自动重定向到 Google 登录页面
- 回调到 `/api/auth/oauth/google/callback`

**GET** `/api/auth/oauth/google/callback`

- 使用 Supabase 的 `exchangeCodeForSession` 方法
- 自动处理会话创建
- 返回用户信息和访问 token

## 注意事项

1. **中间件**：项目已配置 `middleware.ts` 来自动刷新 Supabase 会话
2. **Cookie 设置**：Supabase SSR 库会自动处理 cookie 的设置和读取
3. **生产环境**：确保在生产环境中使用 HTTPS
4. **重定向 URI**：确保在 Supabase 和 Google Cloud Console 中配置正确的重定向 URI

