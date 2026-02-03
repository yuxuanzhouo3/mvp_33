# OAuth 登录配置指南

本文档说明如何配置微信和谷歌 OAuth 登录功能。

## 环境变量配置

在项目根目录创建 `.env.local` 文件，添加以下环境变量：

```env
# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3001

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/oauth/google/callback

# WeChat OAuth Configuration
WECHAT_APP_ID=your_wechat_app_id_here
WECHAT_APP_SECRET=your_wechat_app_secret_here
WECHAT_REDIRECT_URI=http://localhost:3001/api/auth/oauth/wechat/callback
```

## Google OAuth 配置

### 1. 创建 Google OAuth 应用

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 Google+ API
4. 转到 "凭据" > "创建凭据" > "OAuth 客户端 ID"
5. 选择应用类型：**Web 应用**
6. 配置授权重定向 URI：
   - 开发环境：`http://localhost:3001/api/auth/oauth/google/callback`
   - 生产环境：`https://yourdomain.com/api/auth/oauth/google/callback`
7. 复制 **客户端 ID** 和 **客户端密钥**

### 2. 更新环境变量

将复制的客户端 ID 和密钥添加到 `.env.local`：

```env
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/oauth/google/callback
```

## WeChat OAuth 配置

### 1. 创建微信开放平台应用

1. 访问 [微信开放平台](https://open.weixin.qq.com/)
2. 注册并登录账号
3. 创建网站应用（注意：网站应用使用标准登录界面，不是二维码）
4. 填写应用信息：
   - 应用名称
   - 应用简介
   - 应用官网
   - 授权回调域名（例如：`localhost:3001` 或 `yourdomain.com`）
5. 提交审核（通常需要 1-3 个工作日）
6. 审核通过后，获取 **AppID** 和 **AppSecret**

**注意：** 
- 当前实现使用 `oauth2/authorize` 端点，提供标准登录界面（非二维码）
- 如果需要在微信外使用，确保配置了正确的回调域名
- 微信网页授权主要用于在微信内置浏览器中使用

### 2. 更新环境变量

将获取的 AppID 和 AppSecret 添加到 `.env.local`：

```env
WECHAT_APP_ID=your_wechat_app_id_here
WECHAT_APP_SECRET=your_wechat_app_secret_here
WECHAT_REDIRECT_URI=http://localhost:3001/api/auth/oauth/wechat/callback
CLOUDBASE_SESSION_SECRET=generate_a_long_random_string
CLOUDBASE_SESSION_TTL=604800 # (可选) 会话有效期（秒）
```

### 3. CloudBase 集成

- 微信授权用户 **全部存储在 CloudBase `users` 集合** 中，不再写入 Supabase；
- `users` 集合需要额外字段：`wechat_openid`、`wechat_unionid`、`provider`、`provider_id`；
- OAuth 回调会生成自有的 CloudBase 会话 token（`cb_session` Cookie），所有国内 API 通过该 token 校验；
- 请确保 CloudBase 环境变量（`CLOUDBASE_ENV_ID` / `CLOUDBASE_SECRET_ID` / `CLOUDBASE_SECRET_KEY`）已配置，并具有 `users` 集合读写权限。

## API 接口说明

### 邮箱注册

**POST** `/api/auth/register`

请求体：
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "User Name"
}
```

响应：
```json
{
  "success": true,
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "username": "user",
    "full_name": "User Name",
    ...
  },
  "token": "token_123"
}
```

### 邮箱登录

**POST** `/api/auth/login`

请求体：
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

响应：
```json
{
  "success": true,
  "user": { ... },
  "token": "token_123"
}
```

### Google OAuth 登录/注册

**GET** `/api/auth/oauth/google?action=login`
**GET** `/api/auth/oauth/google?action=register`

- 自动重定向到 Google 登录页面（已优化响应速度）
- 用户授权后回调到 `/api/auth/oauth/google/callback`
- 回调后重定向到前端登录页面，URL 参数包含用户信息和 token
- **优化说明：** 移除了强制同意页面，只在必要时显示，提升响应速度

### WeChat OAuth 登录/注册

**GET** `/api/auth/oauth/wechat?action=login`
**GET** `/api/auth/oauth/wechat?action=register`

- 自动重定向到微信登录页面
- 用户授权后回调到 `/api/auth/oauth/wechat/callback`
- 回调后重定向到前端登录页面，URL 参数包含用户信息和 token

## 生产环境注意事项

1. **使用 HTTPS**：OAuth 回调必须使用 HTTPS
2. **环境变量安全**：不要将 `.env.local` 提交到版本控制
3. **JWT Token**：生产环境应使用 JWT 而不是简单的字符串 token
4. **数据库集成**：需要将用户信息存储到数据库
5. **密码加密**：使用 bcrypt 等库加密密码
6. **错误处理**：完善错误处理和日志记录
7. **CSRF 保护**：实现 CSRF token 验证

## 开发测试

在开发环境中，如果未配置 OAuth，API 会返回错误。你可以：

1. 使用邮箱注册/登录功能进行测试
2. 配置测试用的 OAuth 应用
3. 使用模拟数据（当前实现）

## 下一步

1. 集成数据库（PostgreSQL/MySQL）
2. 实现 JWT token 生成和验证
3. 添加密码重置功能
4. 实现用户会话管理
5. 添加邮箱验证功能

