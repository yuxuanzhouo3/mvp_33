# Bug 修复指南

## 问题1：文件上传失败 ✅

### 原因
Supabase 存储桶 `group-files` 不存在

### 解决步骤
1. 登录你的 Supabase 项目控制台
2. 进入 SQL Editor
3. 执行以下脚本（或直接运行 `scripts/018_setup_group_files_storage.sql`）：

```sql
-- 创建存储桶
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'group-files',
  'group-files',
  true,
  104857600, -- 100MB
  NULL -- 允许所有文件类型
)
ON CONFLICT (id) DO NOTHING;

-- 创建存储策略
CREATE POLICY "Users can upload files to their groups"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'group-files' AND
  (storage.foldername(name))[1] IN (
    SELECT conversation_id::text
    FROM conversation_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update files in their groups"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'group-files' AND
  (storage.foldername(name))[1] IN (
    SELECT conversation_id::text
    FROM conversation_members
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'group-files' AND
  (storage.foldername(name))[1] IN (
    SELECT conversation_id::text
    FROM conversation_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete files in their groups"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'group-files' AND
  (storage.foldername(name))[1] IN (
    SELECT conversation_id::text
    FROM conversation_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Public can view group files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'group-files');
```

4. 执行完成后，刷新页面并重试文件上传

---

## 问题2：群头像上传后不更新 ✅

### 原因
代码已经修复，但可能需要重新编译前端

### 解决步骤
1. 停止开发服务器（如果正在运行）
2. 清除 Next.js 缓存：
```bash
cd D:\newcode\orbitchat\mvp33\mvp33
rm -rf .next
```

3. 重新启动开发服务器：
```bash
npm run dev
```

4. 清除浏览器缓存（Ctrl+Shift+Delete）或使用无痕模式测试
5. 重新测试群头像上传功能

### 验证
- 上传群头像后，检查以下位置是否都更新了：
  - 左侧会话列表中的群聊头像
  - 聊天窗口顶部的群聊头像
  - 群信息面板中的群聊头像

---

## 问题3：消息撤回后UI不更新 ⚠️

### 原因
代码逻辑正确，但可能存在以下问题：
1. React 状态更新没有触发重新渲染
2. 消息 ID 不匹配
3. 组件缓存问题

### 解决步骤

#### 步骤1：添加调试日志
我将在代码中添加调试日志来追踪问题。

#### 步骤2：重新编译并测试
```bash
cd D:\newcode\orbitchat\mvp33\mvp33
rm -rf .next
npm run dev
```

#### 步骤3：测试并查看控制台
1. 打开浏览器开发者工具（F12）
2. 切换到 Console 标签
3. 发送一条测试消息
4. 撤回该消息
5. 查看控制台输出的调试信息

### 预期的调试输出
```
[RECALL] 开始撤回消息: <messageId>
[RECALL] API 响应: { success: true, message: {...} }
[RECALL] 更新前的消息列表长度: <count>
[RECALL] 找到要撤回的消息: <messageId>
[RECALL] 更新后的消息: { id: ..., is_recalled: true, ... }
[RECALL] 更新后的消息列表长度: <count>
```

如果看不到这些日志，说明代码没有执行到相应位置。
如果看到日志但UI没更新，说明是渲染问题。

---

## 快速验证清单

- [ ] 问题1：在 Supabase 中执行 SQL 脚本
- [ ] 问题1：测试文件上传功能
- [ ] 问题2：清除 .next 缓存
- [ ] 问题2：重启开发服务器
- [ ] 问题2：清除浏览器缓存
- [ ] 问题2：测试群头像上传功能
- [ ] 问题3：添加调试日志（见下一步）
- [ ] 问题3：重新编译并测试
- [ ] 问题3：查看控制台输出

---

## 下一步

我现在将为消息撤回功能添加调试日志，以便追踪问题的根本原因。
