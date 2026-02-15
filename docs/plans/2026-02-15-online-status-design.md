# 用户在线状态功能设计文档

**日期**: 2026-02-15
**状态**: 已实现

## 概述

实现用户在线状态功能，在所有显示用户头像的地方显示在线/离线状态指示器。

## 需求

### 功能需求

1. **在线状态定义**：简单的在线/离线二元状态
   - 用户打开应用 = 在线
   - 用户关闭应用/断网 = 离线

2. **显示位置**：所有显示用户头像的地方
   - 聊天列表中的头像
   - 聊天窗口顶部的头像
   - 联系人列表中的头像

3. **国际版和国内版支持**
   - 国际版：使用 Supabase Realtime Presence
   - 国内版：使用心跳更新机制

### 非功能需求

- 遵循"最简原则"，代码量最少
- 国际版和国内版用户体验一致
- 不使用 Redis 等外部服务

## 技术方案

### 方案选择

采用 **Supabase Presence + 心跳混合方案**：

- **国际版（Supabase）**：使用 Supabase Realtime Presence API
- **国内版（CloudBase）**：使用心跳更新机制（每 60 秒更新一次）

### 数据库设计

使用现有的 `users` 表字段，无需新增字段：

- `status`: 用户状态（'online' | 'offline'）
- `last_seen_at`: 最后在线时间（timestamp）

### 在线状态判断逻辑

#### 国际版（Supabase）

- 使用 Supabase Presence API 实时追踪
- 用户在 Presence channel 中 = 在线
- 用户离开 Presence channel = 离线

#### 国内版（CloudBase）

- 前端每 60 秒更新 `last_seen_at` 字段
- 判断逻辑：`Date.now() - last_seen_at < 120000` (2分钟) = 在线，否则离线

## 前端实现架构

### Hook 设计

#### 1. `hooks/use-online-status.ts`

**功能**：
- 接收 `userId` 参数
- 返回 `isOnline: boolean`
- 自动处理国际版/国内版的差异

**国际版实���**：
- 订阅 Supabase Presence channel
- 监听用户的 presence 状态
- 用户在 channel 中 = `isOnline: true`

**国内版实现**：
- 读取 `users.last_seen_at` 字段
- 计算时间差：`Date.now() - last_seen_at < 120000` (2分钟)
- 每 30 秒重新检查一次

#### 2. `hooks/use-heartbeat.ts`（仅国内版）

**功能**：
- 在应用启动时自动开始心跳
- 每 60 秒更新一次 `users.last_seen_at`
- 在组件卸载时停止心跳

**实现逻辑**：
```typescript
useEffect(() => {
  if (isCloudBase && currentUser) {
    const interval = setInterval(() => {
      updateLastSeenAt(currentUser.id)
    }, 60000) // 60秒

    return () => clearInterval(interval)
  }
}, [currentUser])
```

### Avatar 组件集成

修改 `components/ui/avatar.tsx`：

**新增 Props**：
- `userId?: string` - 用户 ID
- `showOnlineStatus?: boolean` - 是否显示在线状态（默认 false）

**实现**：
- 内部调用 `useOnlineStatus(userId)`
- 在头像右下角显示状态指示器

### 生命周期管理

#### 应用启动时的初始化

在 `app/chat/chat-content.tsx` 中：
- **国际版**：订阅 Presence channel，调用 `channel.track()`
- **国内版**：启动心跳定时器

#### 用户离开时的清理

- **国际版**：自动处理（Presence API 会在连接断开时自动移除）
- **国内版**：不需要特殊处理（2分钟后自动显示为离线）

## UI 设计

### 在线状态指示器

在头像右下角显示一个小圆点：

- **在线**：绿色圆点（`bg-green-500`）
- **离线**：灰色圆点（`bg-gray-400`）
- **样式**：
  - 圆点大小：`w-2.5 h-2.5`（10px）
  - 圆点位置：`absolute bottom-0 right-0`
  - 白色边框：`ring-2 ring-white`（确保在深色背景下可见）

## 实现计划

### 需要修改/创建的文件

**新建文件**：
1. `hooks/use-online-status.ts` - 在线状态 Hook
2. `hooks/use-heartbeat.ts` - 心跳机制 Hook（国内版）

**修改文件**：
1. `components/ui/avatar.tsx` - 添加在线状态指示器
2. `app/chat/chat-content.tsx` - 初始化 Presence/心跳

### 实现优先级

1. 实现 `use-online-status` Hook（国际版 Supabase Presence）
2. 修改 Avatar 组件集成在线状态
3. 实现 `use-heartbeat` Hook（国内版）
4. 在主布局中初始化 Presence/心跳
5. 测试和优化

## 技术细节

### Supabase Presence API

```typescript
// 订阅 Presence channel
const channel = supabase.channel('online-users')
  .on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState()
    // 处理在线用户列表
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ user_id: currentUser.id, online_at: new Date() })
    }
  })
```

### CloudBase 心跳更新

```typescript
// 每 60 秒更新一次
setInterval(async () => {
  await db.collection('users').doc(userId).update({
    last_seen_at: new Date()
  })
}, 60000)
```

## 性能考虑

- **国际版**：Supabase Presence 自动优化，无需担心性能
- **国内版**：每 60 秒一次更新，对数据库压力很小
- **前端**：使用 React Hook 缓存在线状态，避免重复计算

## 测试计划

1. **功能测试**
   - 用户登录后显示为在线
   - 用户关闭应用后显示为离线
   - 多个用户同时在线时状态正确

2. **跨版本测试**
   - 国际版 Presence 功能正常
   - 国内版心跳机制正常
   - 两个版本用户体验一致

3. **边界测试**
   - 网络断开后的状态变化
   - 长时间无操作后的状态
   - 快速切换在线/离线状态

## 后续优化（可选）

- 添加"正在输入"状态
- 添加"离开"状态（一段时间无操作）
- 优化心跳频率（根据用户活跃度动态调整）
