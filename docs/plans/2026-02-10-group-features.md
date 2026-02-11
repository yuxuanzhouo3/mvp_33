# 群聊功能增强实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 为群聊功能添加撤回消息、群头像、群文件、群公告四个核心功能

**架构:** 基于现有的 Next.js + React + Supabase/CloudBase 双数据库架构，扩展群聊功能模块

**技术栈:** Next.js 16, React 19, TypeScript, Supabase (PostgreSQL), CloudBase (NoSQL), Tailwind CSS

---

## 功能概述

根据项目探索结果，当前项目已经实现了完整的群聊基础功能（创建群聊、成员管理、消息发送等）。本���划将添加以下四个功能：

1. **撤回消息功能** - 允许用户撤回自己发送的消息（2分钟内）
2. **群头像功能** - 支持群主/管理员上传和修改群头像
3. **群文件功能** - 群成员可以上传、下载、管理群文件
4. **群公告功能** - 群主/管理员可以发布和管理群公告

---

## 任务 1: 实现消息撤回功能

### 数据库层面

**状态:** 已完成 - `scripts/036_add_message_recall.sql` 已添加 `is_recalled` 字段

### 后端 API - 添加撤回消息端点

**文件:**
- 创建: `app/api/messages/[id]/recall/route.ts`

**实现步骤:**

1. 创建撤回消息 API 端点
2. 验证用户权限（只能撤回自己的消息）
3. 验证时间限制（2分钟内）
4. 更新消息的 is_recalled 状态

### 前端 UI - 添加撤回按钮

**文件:**
- 修改: `components/chat/message-list.tsx`

**实现步骤:**

1. 在消息操作菜单中添加"撤回"选项
2. 显示撤回倒计时
3. 实现撤回功能调用
4. 显示已撤回的消息状态

---

## 任务 2: 实现群头像功能

### 数据库层面

**状态:** 已完成 - `conversations` 表已有 `avatar_url` 字段

### 后端 API - 支持群头像上传

**文件:**
- 修改: `app/api/groups/[id]/route.ts`

**实现步骤:**

1. 在 PUT 端点中支持 avatar_url 更新
2. 验证权限（群主和管理员）
3. 集成 Supabase Storage 上传

### 前端 UI - 群头像上传组件

**文件:**
- 修改: `components/chat/group-settings-dialog.tsx`
- 修改: `components/chat/group-info-panel.tsx`

**实现步骤:**

1. 添加头像上传区域
2. 实现图片预览和上传
3. 在群信息面板显示头像

---

## 任务 3: 实现群公告功能

### 数据库层面 - 创建群公告表

**文件:**
- 创建: `scripts/046_create_group_announcements.sql`

**表结构:**
```sql
CREATE TABLE group_announcements (
    id UUID PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_pinned BOOLEAN DEFAULT false
);
```

### 类型定义

**文件:**
- 修改: `lib/types.ts`

添加 GroupAnnouncement 接口

### 后端 API - 群公告 CRUD

**文件:**
- 创建: `app/api/groups/[id]/announcements/route.ts`
- 创建: `app/api/groups/[id]/announcements/[announcementId]/route.ts`

**实现步骤:**

1. GET - 获取群公告列表
2. POST - 创建群公告
3. PUT - 更新群公告
4. DELETE - 删除群公告

### 前端 UI - 群公告组件

**文件:**
- 创建: `components/chat/group-announcements-panel.tsx`
- 创建: `components/chat/create-announcement-dialog.tsx`
- 修改: `components/chat/group-info-panel.tsx`

**实现步骤:**

1. 创建公告面板组件
2. 创建公告创建/编辑对话框
3. 在群信息面板中集成公告标签页

---

## 任务 4: 实现群文件功能

### 数据库层面 - 创建群文件表

**文件:**
- 创建: `scripts/047_create_group_files.sql`

**表结构:**
```sql
CREATE TABLE group_files (
    id UUID PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id),
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    file_type VARCHAR(100),
    file_url TEXT NOT NULL,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### 类型定义

**文件:**
- 修改: `lib/types.ts`

添加 GroupFile 接口

### 后端 API - 群文件 CRUD

**文件:**
- 创建: `app/api/groups/[id]/files/route.ts`
- 创建: `app/api/groups/[id]/files/[fileId]/route.ts`

**实现步骤:**

1. GET - 获取群文件列表
2. POST - 上传群文件
3. DELETE - 删除文件

### 前端 UI - 群文件组件

**文件:**
- 创建: `components/chat/group-files-panel.tsx`
- 创建: `components/chat/upload-file-dialog.tsx`
- 修改: `components/chat/group-info-panel.tsx`

**实现步骤:**

1. 创建文件面板组件
2. 创建文件上传对话框
3. 在群信息面板中集成文件标签页

---

## 前端界面设计

### 1. 消息撤回界面
- 消息操作菜单中添加"撤回"选项
- 显示倒计时提示
- 已撤回消息显示为灰色文本

### 2. 群头像界面
- 群设置对话框中添加头像上传区域
- 支持拖拽上传
- 群信息面板顶部显示大尺寸头像

### 3. 群公告界面
- 群信息面板添加"公告"标签页
- 置顶公告高亮显示
- 支持 Markdown 渲染

### 4. 群文件界面
- 群信息面板添加"文件"标签页
- 文件列表表格展示
- 支持拖拽上传

---

## 测试计划

### 功能测试

1. **消息撤回测试**
   - [ ] 2分钟内可以撤回
   - [ ] 2分钟后无法撤回
   - [ ] 只能撤回自己的消息

2. **群头像测试**
   - [ ] 群主可以上传群头像
   - [ ] 管理员可以修改群头像
   - [ ] 普通成员无法修改

3. **群公告测试**
   - [ ] 管理员可以创建公告
   - [ ] 普通成员只能查看
   - [ ] 置顶公告显示在顶部

4. **群文件测试**
   - [ ] 所有成员可以上传文件
   - [ ] 上传者可以删除自己的文件
   - [ ] 管理员可以删除任何文件

---

## 注意事项

1. **权限控制**: 所有操作都需要验证用户权限
2. **文件大小限制**: 群文件上传限制 100MB
3. **存储空间**: 使用 Supabase Storage
4. **实时更新**: 使用 Supabase Realtime
5. **错误处理**: 适当的错误处理和用户提示
6. **双数据库支持**: 同时支持 Supabase 和 CloudBase

---

## 执行方式

**两种执行选项:**

**1. Subagent-Driven (当前会话)** - 在当前会话中逐任务执行，每个任务完成后进行代码审查

**2. Parallel Session (独立会话)** - 在新会话中使用 executing-plans skill 批量执行

请选择执行方式。
