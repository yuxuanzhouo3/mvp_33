# 认证问题排查指南

## 问题：新注册用户出现 "Unauthorized" 错误

### 症状
- 注册成功后，尝试搜索用户时出现 "Unauthorized" 错误
- 即使刷新页面后仍然无法使用搜索功能

### 可能的原因

1. **Supabase 会话 Cookie 未正确设置**
   - 注册/登录 API 创建了会话，但 cookie 没有传递到浏览器
   - Cookie 的路径或域名设置不正确

2. **邮箱确认未禁用**
   - Supabase 默认需要邮箱确认
   - 新注册用户需要确认邮箱后才能使用

3. **中间件未正确刷新会话**
   - 中间件可能没有正确刷新会话 cookie

### 排查步骤

#### 1. 检查 Supabase 邮箱确认设置

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择项目：`communication_tool`
3. 进入 **Authentication** > **Settings**
4. 找到 **Email Auth** 部分
5. **取消勾选** "Enable email confirmations"
6. 保存设置

#### 2. 检查浏览器 Cookie

1. 打开浏览器开发者工具（F12）
2. 进入 **Application** > **Cookies** > `http://localhost:3001`
3. 查找以 `sb-` 开头的 cookie（Supabase 会话 cookie）
4. 如果不存在，说明 cookie 没有正确设置

#### 3. 检查服务器日志

查看终端中的错误信息：
- 注册时是否有错误
- 搜索 API 调用时的错误信息
- 是否有 "No current user" 或 "Auth error" 的日志

#### 4. 测试步骤

1. **清除所有 Cookie 和 LocalStorage**
   - 开发者工具 > Application > Clear storage
   - 清除所有数据

2. **重新注册**
   - 使用新邮箱注册
   - 观察是否有错误

3. **检查注册后的状态**
   - 注册成功后，检查 Cookie 是否设置
   - 检查 LocalStorage 中是否有用户信息

4. **测试搜索功能**
   - 尝试搜索用户
   - 查看控制台和网络请求的错误信息

### 临时解决方案

如果问题持续存在，可以尝试以下方法：

#### 方法 1：手动登录一次

注册后，使用相同的邮箱和密码手动登录一次，这样可以确保会话正确建立。

#### 方法 2：使用客户端 Supabase 客户端

修改搜索功能，使用客户端 Supabase 客户端而不是服务器端 API：

```typescript
// 在组件中使用客户端 Supabase
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const { data: { user } } = await supabase.auth.getUser()
```

#### 方法 3：检查环境变量

确保 `.env.local` 文件中有正确的 Supabase 配置：

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

### 常见错误信息

- **"Unauthorized"**: 用户未认证，会话 cookie 未设置或已过期
- **"No user found"**: Supabase 无法从 cookie 中获取用户信息
- **"Session expired"**: 会话已过期，需要重新登录

### 联系支持

如果问题仍然存在，请提供：
1. 浏览器控制台的完整错误信息
2. 服务器终端的错误日志
3. Cookie 和 LocalStorage 的截图
4. 网络请求的详细信息（Network 标签）

