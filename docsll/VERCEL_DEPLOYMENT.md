# Vercel 部署指南

## 前置要求

1. 已创建 Vercel 账号
2. 已连接 GitHub 仓库
3. 已配置 Supabase 项目

## 部署步骤

### 1. 在 Vercel 中导入项目

1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 "Add New..." > "Project"
3. 选择你的 GitHub 仓库 `mvp_33`
4. 点击 "Import"

### 2. 配置环境变量

在 Vercel 项目设置中添加以下环境变量：

#### Supabase 配置（必需）
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

#### 应用配置（可选）
```
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

#### OAuth 配置（如果使用 OAuth）
```
WECHAT_APP_ID=your_wechat_app_id
WECHAT_APP_SECRET=your_wechat_app_secret
WECHAT_REDIRECT_URI=https://your-app.vercel.app/api/auth/oauth/wechat/callback
```

### 3. 配置 Supabase 重定向 URL

在 Supabase Dashboard 中：

1. 进入 **Authentication** > **URL Configuration**
2. 在 **Redirect URLs** 中添加：
   ```
   https://your-app.vercel.app/api/auth/oauth/google/callback
   https://your-app.vercel.app/api/auth/oauth/wechat/callback
   ```
3. 在 **Site URL** 中设置：
   ```
   https://your-app.vercel.app
   ```

### 4. 部署设置

Vercel 会自动检测 Next.js 项目，使用以下默认设置：

- **Framework Preset**: Next.js
- **Build Command**: `next build`
- **Output Directory**: `.next`
- **Install Command**: `npm install` 或 `yarn install`

### 5. 部署

1. 点击 "Deploy" 按钮
2. 等待构建完成
3. 访问部署的 URL

## 环境变量获取

### Supabase 环境变量

1. 访问 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **Settings** > **API**
4. 复制：
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 部署后检查清单

- [ ] 环境变量已正确设置
- [ ] Supabase 重定向 URL 已配置
- [ ] 数据库表已创建（运行 SQL 脚本）
- [ ] RLS 策略已配置
- [ ] 测试登录功能
- [ ] 测试搜索用户功能
- [ ] 测试联系人请求功能

## 常见问题

### 1. 构建失败

**问题**: 构建时出现 TypeScript 错误

**解决**: 检查 `next.config.mjs` 中的 `typescript.ignoreBuildErrors` 设置

### 2. 运行时错误 "Supabase is not configured"

**问题**: 环境变量未正确设置

**解决**: 
- 检查 Vercel 项目设置中的环境变量
- 确保变量名正确（注意大小写）
- 重新部署项目

### 3. OAuth 重定向失败

**问题**: OAuth 登录后重定向到错误页面

**解决**:
- 检查 Supabase 中的重定向 URL 配置
- 确保 `NEXT_PUBLIC_APP_URL` 设置为正确的 Vercel URL
- 检查 OAuth 提供商的回调 URL 配置

### 4. 数据库连接问题

**问题**: API 返回 500 错误

**解决**:
- 检查 Supabase 项目是否正常运行
- 确认数据库表已创建
- 检查 RLS 策略是否正确配置

## 更新部署

每次推送到 `main` 分支时，Vercel 会自动重新部署。你也可以：

1. 在 Vercel Dashboard 中手动触发部署
2. 使用 Vercel CLI：
   ```bash
   vercel --prod
   ```

## 生产环境建议

1. **启用 HTTPS**: Vercel 自动提供 HTTPS
2. **设置自定义域名**: 在 Vercel 项目设置中配置
3. **监控和日志**: 使用 Vercel Analytics 和 Logs
4. **环境变量**: 确保生产环境变量与开发环境一致
5. **数据库备份**: 定期备份 Supabase 数据库

## 相关文档

- [Vercel 文档](https://vercel.com/docs)
- [Next.js 部署文档](https://nextjs.org/docs/deployment)
- [Supabase 文档](https://supabase.com/docs)

