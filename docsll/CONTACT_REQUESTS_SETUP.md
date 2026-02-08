# 联系人请求功能设置指南

## 错误：找不到 contact_requests 表

如果遇到错误 "Could not find the table 'public.contact_requests' in the schema cache"，需要运行 SQL 脚本创建表。

## 快速修复步骤

### 1. 在 Supabase Dashboard 中运行 SQL

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择项目：`communication_tool` (kradpewmiizgughuxveg)
3. 进入 **SQL Editor**
4. 复制 `scripts/005_contact_requests.sql` 的全部内容
5. 粘贴到 SQL Editor 并点击 **Run** 执行

### 2. 验证表已创建

在 Supabase Dashboard 中：
1. 进入 **Table Editor**
2. 确认可以看到 `contact_requests` 表
3. 检查表结构是否正确

## 临时解决方案

如果暂时不想创建 `contact_requests` 表，应用会自动降级为直接添加联系人（不通过请求系统）。但建议运行 SQL 脚本以启用完整的请求功能。

## 功能说明

运行 SQL 脚本后，将启用：
- ✅ 发送联系人请求
- ✅ 查看待处理请求
- ✅ 接受/拒绝请求
- ✅ 双向联系人关系

## 添加联系人流程

1. **搜索用户**：在联系人页面搜索 `yuxuanzhouo3@gmail.com`
2. **发送请求**：点击 "Add" 按钮发送联系人请求
3. **查看请求**：切换到 "Requests" 标签页查看待处理请求
4. **接受请求**：对方可以在 "Requests" 标签页接受你的请求
5. **开始聊天**：接受后可以立即发送消息

## 故障排除

如果运行 SQL 脚本后仍有问题：
1. 检查 RLS 策略是否正确创建
2. 确认外键关系正确
3. 查看 Supabase Logs 中的错误信息

