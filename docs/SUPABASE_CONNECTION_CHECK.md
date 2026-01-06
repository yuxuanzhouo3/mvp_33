# Supabase 连接检查指南

## 🔍 问题诊断

如果老板说"注册的 Supabase 好像还没有接通"，可能的原因有：

### 1. Supabase 项目未创建
- **症状**: 无法访问 Supabase Dashboard，或项目不存在
- **解决**: 
  1. 访问 [Supabase Dashboard](https://supabase.com/dashboard)
  2. 检查是否有项目 `communication_tool` (kradpewmiizgughuxveg)
  3. 如果没有，需要创建新项目

### 2. 环境变量未配置
- **症状**: 应用启动时报错 "Supabase is not configured"
- **检查**: 
  ```bash
  # 在项目根目录检查
  cat .env.local | grep SUPABASE
  ```
- **解决**: 如果不存在，创建 `.env.local` 文件并添加：
  ```env
  NEXT_PUBLIC_SUPABASE_URL=https://kradpewmiizgughuxveg.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=你的_ANON_KEY
  ```

### 3. 数据库表未创建
- **症状**: 应用可以启动，但注册/登录失败，或数据库查询报错
- **检查**: 运行连接测试脚本
  ```bash
  npx tsx scripts/test-supabase-connection.ts
  ```
- **解决**: 在 Supabase Dashboard 的 SQL Editor 中运行：
  - `scripts/003_supabase_setup.sql` - 创建所有基础表
  - `scripts/019_find_direct_conversation_function.sql` - 创建查找对话函数
  - `scripts/020_add_workspace_members_policies.sql` - 添加工作区成员策略
  - `scripts/023_create_insert_members_function.sql` - 创建插入成员函数
  - `scripts/024_fix_conversation_members_select.sql` - 修复对话成员查询策略

### 4. RLS 策略未配置
- **症状**: 可以查询数据，但无法插入或更新
- **检查**: 在 Supabase Dashboard 中检查表的 Policies
- **解决**: 运行上述 SQL 脚本，它们包含了所有必要的 RLS 策略

### 5. 网络连接问题
- **症状**: 连接超时或无法访问 Supabase
- **检查**: 
  ```bash
  curl https://kradpewmiizgughuxveg.supabase.co
  ```
- **解决**: 检查网络连接，或联系 Supabase 支持

## 🧪 快速诊断步骤

### 步骤 1: 检查环境变量
```bash
cd mvp_33-main
# Windows PowerShell
Get-Content .env.local | Select-String "SUPABASE"
```

应该看到：
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 步骤 2: 运行连接测试
```bash
cd mvp_33-main
npx tsx scripts/test-supabase-connection.ts
```

这会检查：
- ✅ 环境变量是否设置
- ✅ Supabase 客户端是否可以创建
- ✅ 数据库连接是否正常
- ✅ 关键表是否存在

### 步骤 3: 检查 Supabase Dashboard
1. 访问 [Supabase Dashboard](https://supabase.com/dashboard)
2. 登录并选择项目 `communication_tool`
3. 进入 **Table Editor**，检查以下表是否存在：
   - `users`
   - `workspaces`
   - `workspace_members`
   - `conversations`
   - `conversation_members`
   - `messages`

### 步骤 4: 检查 SQL 脚本是否已运行
在 Supabase Dashboard 的 **SQL Editor** 中，查看历史记录，确认以下脚本已运行：
- `003_supabase_setup.sql`
- `019_find_direct_conversation_function.sql`
- `020_add_workspace_members_policies.sql`
- `023_create_insert_members_function.sql`
- `024_fix_conversation_members_select.sql`

## 📋 完整配置清单

### ✅ 必须完成的步骤

1. **创建 Supabase 项目**
   - [ ] 在 [Supabase Dashboard](https://supabase.com/dashboard) 创建项目
   - [ ] 记录项目 URL 和 Anon Key

2. **配置环境变量**
   - [ ] 创建 `.env.local` 文件
   - [ ] 添加 `NEXT_PUBLIC_SUPABASE_URL`
   - [ ] 添加 `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. **创建数据库表**
   - [ ] 运行 `scripts/003_supabase_setup.sql`
   - [ ] 运行 `scripts/019_find_direct_conversation_function.sql`
   - [ ] 运行 `scripts/020_add_workspace_members_policies.sql`
   - [ ] 运行 `scripts/023_create_insert_members_function.sql`
   - [ ] 运行 `scripts/024_fix_conversation_members_select.sql`

4. **配置认证**
   - [ ] 在 Supabase Dashboard 设置 Site URL
   - [ ] 配置 Redirect URLs
   - [ ] （可选）配置 Google OAuth

5. **测试连接**
   - [ ] 运行 `npx tsx scripts/test-supabase-connection.ts`
   - [ ] 确认所有检查通过

## 🔧 常见错误和解决方案

### 错误 1: "Supabase is not configured"
**原因**: 环境变量未设置或未加载

**解决**:
1. 确认 `.env.local` 文件存在
2. 重启开发服务器（环境变量更改需要重启）
3. 确认变量名正确（`NEXT_PUBLIC_` 前缀）

### 错误 2: "relation 'users' does not exist"
**原因**: 数据库表未创建

**解决**:
1. 在 Supabase Dashboard 的 SQL Editor 运行 `scripts/003_supabase_setup.sql`
2. 检查 Table Editor 确认表已创建

### 错误 3: "new row violates row-level security policy"
**原因**: RLS 策略未正确配置

**解决**:
1. 运行所有 SQL 脚本（特别是包含 RLS 策略的脚本）
2. 在 Supabase Dashboard 检查表的 Policies
3. 确认 RLS 已启用但策略允许所需操作

### 错误 4: "Failed to fetch" 或连接超时
**原因**: 网络问题或 Supabase 项目未激活

**解决**:
1. 检查网络连接
2. 确认 Supabase 项目状态（在 Dashboard 中查看）
3. 确认项目 URL 和 Key 正确

## 📞 需要帮助？

如果以上步骤都无法解决问题，请提供：
1. 运行 `npx tsx scripts/test-supabase-connection.ts` 的完整输出
2. 浏览器控制台的错误信息
3. 服务器日志的错误信息
4. Supabase Dashboard 中项目的状态截图












