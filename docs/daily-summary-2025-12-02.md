# Daily Summary - 2025-12-02

## 代码架构重构 & CloudBase 功能完善 (Code Refactoring & CloudBase Feature Completion)

### 功能概述
今天完成了**代码架构的重大重构**，将 CloudBase 和 Supabase 的逻辑完全分离到不同目录/模块，确保互不干扰。同时实现了 CloudBase 的完整消息操作功能（撤回、隐藏、删除、置顶），修复了支付订阅更新、文件上传限制、图片 URL 过期等多个问题，并优化了图片加载和聊天页面自动滚动体验。

### 重要说明
**由于 Supabase 没有备份**，在重构过程中需要重新实现 Supabase 的一些核心功能，包括：
- 消息撤回（recall message）
- 消息隐藏/取消隐藏（hide/unhide message）
- 消息删除（delete message）
- 对话置顶/取消置顶（pin/unpin conversation）

这些功能在重构时被重新实现，确保 Supabase 和 CloudBase 都有完整且一致的功能实现。重构完成后，两个数据库系统的功能完全对齐，代码结构也更加清晰。

---

## 1. 代码架构重构：CloudBase 与 Supabase 完全分离

### 实现内容
- 将 CloudBase 和 Supabase 的数据库操作代码完全分离到不同目录
- 重构 `database-router.ts`，使其只负责路由逻辑，不直接操作数据库
- 更新所有 API 路由的导入路径，使用新的模块结构
- **保持 IP 路由逻辑不变**，根据用户区域自动选择数据库
- **重新实现 Supabase 的消息操作功能**：由于 Supabase 没有备份，在重构过程中重新实现了撤回、隐藏、删除、置顶等功能，确保功能完整且与 CloudBase 对齐

### 关键实现

#### 1.1 创建新的目录结构
```
lib/database/
├── types.ts                    # 统一的类型定义
├── cloudbase/                  # CloudBase 数据库操作模块
│   ├── users.ts               # 用户操作
│   ├── conversations.ts       # 会话操作
│   ├── messages.ts            # 消息操作
│   └── index.ts               # 统一导出
└── supabase/                  # Supabase 数据库操作模块
    ├── users.ts               # 用户操作
    ├── conversations.ts       # 会话操作
    ├── messages.ts            # 消息操作
    └── index.ts               # 统一导出
```

#### 1.2 重构 database-router.ts
- **之前**：`database-router.ts` 直接包含数据库操作逻辑
- **现在**：只负责路由，调用分离的模块
  ```typescript
  // 根据用户区域动态导入对应的模块
  if (userRegion === 'cn') {
    const { getUserById } = await import('@/lib/database/cloudbase/users')
    const cloudbaseUser = await getUserById(user.id)
  } else {
    const { getUserById } = await import('@/lib/database/supabase/users')
    const supabaseUser = await getUserById(user.id)
  }
  ```

#### 1.3 更新所有 API 路由
- 将所有导入路径从旧的 `@/lib/cloudbase/database` 和 `@/lib/supabase/database` 改为新的 `@/lib/database/cloudbase` 和 `@/lib/database/supabase`
- 涉及的文件：
  - `/api/messages/route.ts`
  - `/api/messages/[messageId]/route.ts`
  - `/api/conversations/route.ts`
  - `/api/conversations/[conversationId]/route.ts`
  - `/api/users/route.ts`
  - `/api/auth/register/route.ts`
  - `/api/auth/login/route.ts`
  - `/api/payment/wechat/callback/route.ts`
  - `/api/payment/alipay/callback/route.ts`
  - 等等...

### 优势
- ✅ **代码分离**：CloudBase 和 Supabase 的逻辑完全分离，互不干扰
- ✅ **易于维护**：修改 CloudBase 时不会影响 Supabase 的代码
- ✅ **清晰的目录结构**：按数据库类型和操作类型组织代码
- ✅ **向后兼容**：保持了 IP 路由逻辑不变，API 接口保持一致

---

## 2. 支付订阅更新：微信和支付宝支付后自动更新会员状态

### 实现内容
- 修复了 CloudBase 订阅更新逻辑（使用 `id` 字段查询用户）
- 创建了微信支付回调接口 `/api/payment/wechat/callback`
- 创建了支付宝支付回调接口 `/api/payment/alipay/callback`
- 支付成功后自动更新用户的订阅状态（`subscription_type` 和 `subscription_expires_at`）

### 关键实现

#### 2.1 修复 CloudBase 订阅更新逻辑
**问题**：之前使用 `doc(userId)` 查询，但 CloudBase 的 `users` 集合中用户 ID 存储在 `id` 字段，不是文档 `_id`

**修复**：
```typescript
// 之前（错误）
const userResult = await db.collection('users').doc(userId).get()

// 现在（正确）
const userResult = await db.collection('users')
  .where({ id: userId })
  .get()

if (userResult.data && userResult.data.length > 0) {
  const docId = userResult.data[0]._id // 使用文档的 _id 进行更新
  await db.collection('users')
    .doc(docId)
    .update({
      subscription_type: subscriptionType,
      subscription_expires_at: expiresAt,
      updated_at: new Date().toISOString()
    })
}
```

#### 2.2 创建微信支付回调接口
```typescript
// /api/payment/wechat/callback/route.ts
export async function POST(request: NextRequest) {
  // 1. 验证支付签名
  // 2. 更新订单状态为 'completed'
  // 3. 调用 updateUserSubscriptionAfterPayment 更新订阅
  if (payment_status === 'paid' && order) {
    await updateUserSubscriptionAfterPayment(
      order.user_id.toString(),
      order.description,
      dbClient
    )
  }
}
```

#### 2.3 创建支付宝支付回调接口
- 与微信回调逻辑类似，验证支付签名后更新订阅状态

### 工作流程
1. 用户通过微信/支付宝支付
2. 支付成功后，支付平台调用回调接口
3. 回调接口更新订单状态为 `completed`
4. 调用 `updateUserSubscriptionAfterPayment` 更新 CloudBase 用户的订阅状态
5. 用户订阅状态更新为 `monthly` 或 `yearly`，并设置 `subscription_expires_at`

---

## 3. 文件上传优化：订阅检查与大小限制

### 实现内容
- 添加了订阅状态检查，动态设置文件大小限制
- 免费用户：10MB
- 会员用户（monthly/yearly）：500MB
- 配置了 Next.js 请求体大小限制，支持大文件上传

### 关键实现

#### 3.1 订阅检查逻辑
```typescript
// /api/messages/upload/route.ts
// 检查订阅状态
let subscriptionType: 'free' | 'monthly' | 'yearly' | null = 'free'
let expiresAt: string | null = null
let isPro = false

if (dbClient.type === 'cloudbase') {
  const userResult = await db.collection('users')
    .where({ id: user.id })
    .get()
  // ... 读取订阅信息
} else if (dbClient.type === 'supabase') {
  const { data: userData } = await supabase
    .from('users')
    .select('subscription_type, subscription_expires_at')
    .eq('id', user.id)
    .single()
  // ... 读取订阅信息
}

// 动态设置文件大小限制
const maxSize = isPro ? 500 * 1024 * 1024 : 10 * 1024 * 1024 // 500MB for pro, 10MB for free
const maxSizeMB = isPro ? 500 : 10
```

#### 3.2 Next.js 配置
```javascript
// next.config.mjs
const nextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
    // 配置 API Routes 的请求体大小限制为 500MB（用于文件上传）
    proxyClientMaxBodySize: '500mb',
  },
}

// /api/messages/upload/route.ts
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for large file uploads
```

---

## 4. CloudBase 图片 URL 过期问题：创建代理 API

### 问题描述
- CloudBase 上传后返回的临时 URL（`https://xxx.tcb.qcloud.la/...`）会过期
- 导致图片显示时出现 `ERR_INVALID_RESPONSE` 错误

### 解决方案

#### 4.1 修改上传 API 返回永久有效的 URL
```typescript
// /api/messages/upload/route.ts
// CloudBase 上传后，不返回临时 URL，而是返回通过 cn-download API 的 URL
const publicUrl = `/api/files/cn-download?fileId=${encodeURIComponent(fileId)}`
return NextResponse.json({
  success: true,
  file_url: publicUrl, // 使用 cn-download API URL，避免临时链接过期
  file_id: fileId,
})
```

#### 4.2 创建文件下载代理 API
```typescript
// /api/files/cn-download/route.ts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rawFileId = searchParams.get('fileId')
  const rawUrl = searchParams.get('url')

  if (rawFileId) {
    // 使用 CloudBase SDK 的 downloadFile 直接下载（永久访问）
    const result = await app.downloadFile({ fileID: finalFileId })
    // ... 返回文件内容
  } else if (rawUrl) {
    // 处理旧格式 CloudBase URLs，转换为 fileId 并通过 SDK 下载
    // ... 提取 filePath 并构造 fileId
    const result = await app.downloadFile({ fileID: fileId })
    // ... 返回文件内容
  }
}
```

#### 4.3 前端自动转换旧 URL
```typescript
// components/chat/message-list.tsx
const convertCloudBaseUrl = (url: string, fileId?: string): string => {
  if (!url) return url
  // blob URL 不需要转换
  if (url.startsWith('blob:')) return url
  // 如果已经是 cn-download API URL，直接返回
  if (url.startsWith('/api/files/cn-download')) return url
  // 优先使用 file_id（永久有效）
  if (fileId && fileId.startsWith('cloud://')) {
    return `/api/files/cn-download?fileId=${encodeURIComponent(fileId)}`
  }
  // 如果是 CloudBase 临时 URL（tcb.qcloud.la），转换为 cn-download API
  if (url.includes('.tcb.qcloud.la/')) {
    return `/api/files/cn-download?url=${encodeURIComponent(url)}`
  }
  // 如果是 cloud:// 格式，转换为 cn-download API
  if (url.startsWith('cloud://')) {
    return `/api/files/cn-download?fileId=${encodeURIComponent(url)}`
  }
  // 其他情况（Supabase URL 等）直接返回
  return url
}
```

### 工作原理
- **新上传的文件**：上传 API 直接返回 `/api/files/cn-download?fileId=cloud://...` 格式的 URL
- **旧数据**：前端检测到 `.tcb.qcloud.la` 的临时 URL 时，自动转换为 `/api/files/cn-download?url=...` 格式
- **cn-download API**：每次访问时动态生成新的临时链接，避免过期

---

## 5. 图片加载优化：移除占位符和强制样式

### 问题描述
- 图片上传后会短暂显示黑色框或黑色点
- 原因是 `minWidth`、`minHeight` 和 `objectFit: 'cover'` 强制显示最小尺寸

### 解决方案

#### 5.1 移除强制样式
```typescript
// components/chat/message-list.tsx
// 之前
<img
  src={displayUrl}
  style={{
    minWidth: '100px',   // ← 强制最小宽度 100px
    minHeight: '100px',  // ← 强制最小高度 100px
    objectFit: 'cover'   // ← 图片填充整个容器
  }}
/>

// 现在
<img
  src={displayUrl}
  className="rounded-lg max-w-sm"
  loading="eager"
/>
```

#### 5.2 优化 blob URL 处理
```typescript
// convertCloudBaseUrl 函数中
// CRITICAL: 如果是 blob URL，不要转换，直接返回（避免图片消失）
// blob URL 会在预加载完成后由 page.tsx 切换为真实 URL
if (url.startsWith('blob:')) {
  return url
}
```

### 最终效果
- ✅ 图片加载完成前不占据空间（不会显示黑框）
- ✅ 图片加载完成后自然显示
- ✅ 发送图片时，加载完成前不会显示任何内容

---

## 6. CloudBase 消息操作功能：撤回、隐藏、删除、置顶

### 实现内容
- 实现了 CloudBase 的撤回消息功能（`recallMessageCN`）
- 实现了 CloudBase 的隐藏/取消隐藏消息功能（`hideMessageCN` / `unhideMessageCN`）
- 实现了 CloudBase 的删除消息功能（`deleteMessageCN`）
- 实现了 CloudBase 的置顶/取消置顶对话功能（`pinConversationCN` / `unpinConversationCN`）
- 所有功能完全按照 Supabase 的逻辑实现，确保行为一致

### 关键实现

#### 6.1 撤回消息（recallMessageCN）
```typescript
// lib/database/cloudbase/messages.ts
export async function recallMessageCN(messageId: string): Promise<MessageWithSender | null> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  const now = new Date().toISOString()
  
  // 检查消息是否存在且未撤回/删除
  const msgRes = await db.collection('messages').doc(messageId).get()
  const m = msgRes?.data || msgRes
  if (!m || m.is_recalled || m.is_deleted) {
    return null
  }

  // 检查时间限制（2分钟内）
  const msgTime = new Date(m.created_at).getTime()
  const nowTime = new Date().getTime()
  if (nowTime - msgTime > 2 * 60 * 1000) {
    throw new Error('Message can only be recalled within 2 minutes')
  }

  // 更新消息
  await db.collection('messages')
    .doc(messageId)
    .update({
      is_recalled: true,
      content: 'This message has been recalled',
      reactions: [], // 清空反应
      updated_at: now,
    })

  // 返回更新后的消息
  // ...
}
```

#### 6.2 隐藏/取消隐藏消息
```typescript
// lib/database/cloudbase/messages.ts
export async function hideMessageCN(messageId: string, userId: string): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  try {
    // 检查是否已隐藏
    const existingRes = await db.collection('hidden_messages')
      .where({
        message_id: messageId,
        user_id: userId,
        region: 'cn',
      })
      .get()

    if (existingRes.data && existingRes.data.length > 0) {
      return true // 已经隐藏
    }

    // 创建隐藏记录
    await db.collection('hidden_messages').add({
      message_id: messageId,
      user_id: userId,
      region: 'cn',
      created_at: new Date().toISOString(),
    })

    return true
  } catch (error) {
    console.error('CloudBase hideMessageCN error:', error)
    return false
  }
}
```

#### 6.3 置顶/取消置顶对话
```typescript
// lib/database/cloudbase/conversations.ts
export async function pinConversationCN(conversationId: string, userId: string): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  try {
    const res = await db.collection('conversation_members')
      .where({
        conversation_id: conversationId,
        user_id: userId,
        region: 'cn',
      })
      .get()

    if (res.data && res.data.length > 0) {
      const docId = res.data[0]._id
      await db.collection('conversation_members')
        .doc(docId)
        .update({
          is_pinned: true,
          pinned_at: new Date().toISOString(),
        })
      return true
    }
    return false
  } catch (error) {
    console.error('CloudBase pinConversationCN error:', error)
    return false
  }
}
```

#### 6.4 更新 API 路由
- `/api/messages/[messageId]/route.ts`：支持 CloudBase 的撤回、隐藏/取消隐藏、删除
- `/api/conversations/[conversationId]/route.ts`：支持 CloudBase 的置顶/取消置顶
- `/api/messages/route.ts`：获取消息时过滤隐藏的消息

---

## 7. 撤回功能优化：修复多个显示问题

### 问题与修复

#### 7.1 授权检查问题（403 Forbidden）
**问题**：撤回消息时出现 "Not authorized to recall this message" 错误

**原因**：
- CloudBase 返回的数据结构中 `sender_id` 可能为 `undefined`
- `sender_id` 和 `user.id` 的类型不一致（字符串 vs 数字）

**修复**：
```typescript
// app/api/messages/[messageId]/route.ts
// 增强数据读取逻辑，处理多种 CloudBase 返回格式
let m: any = null

// Try res.data first (most common)
if (res && res.data) {
  if (Array.isArray(res.data)) {
    m = res.data[0]
  } else {
    m = res.data
  }
}

// If res.data doesn't work, try res directly
if (!m && res && typeof res === 'object') {
  if (res.sender_id !== undefined || res._id !== undefined) {
    m = res
  }
}

// 检查 sender_id 是否存在
if (m.sender_id === undefined || m.sender_id === null) {
  return NextResponse.json(
    { error: 'Message data is invalid: missing sender_id' },
    { status: 500 }
  )
}

// 授权检查：同时进行字符串和数字比较
const messageSenderId = String(m.sender_id || '').trim()
const currentUserId = String(user.id || '').trim()

const messageSenderIdNum = Number(m.sender_id)
const currentUserIdNum = Number(user.id)
const numericMatch = !isNaN(messageSenderIdNum) && !isNaN(currentUserIdNum) && messageSenderIdNum === currentUserIdNum

const stringMatch = messageSenderId === currentUserId
const isAuthorized = stringMatch || numericMatch
```

#### 7.2 日期显示问题（"Invalid Date"）
**问题**：撤回后消息显示 "invalid date" 然后才显示 "recalled"

**修复**：
```typescript
// components/chat/message-list.tsx
const isValidDate = (dateString: string) => {
  const date = new Date(dateString)
  return !isNaN(date.getTime())
}

const formatTime = (date: string) => {
  if (!isValidDate(date)) return '' // 返回空字符串而不是 "Invalid Date"
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

const formatDate = (date: string) => {
  if (!isValidDate(date)) return '' // 返回空字符串而不是 "Invalid Date"
  // ... 其余逻辑
}
```

#### 7.3 反应 UI 仍然显示问题
**问题**：撤回后消息左侧仍然显示反应图标和表情选择器

**修复**：
```typescript
// components/chat/message-list.tsx
const renderMessageReactions = (message: MessageWithSender) => {
  // Don't show reactions for recalled or deleted messages
  if (message.is_recalled || message.is_deleted) {
    return null
  }
  // ... 其余逻辑
}

// DropdownMenu 触发条件
{hoveredMessageId === message.id && !message.is_deleted && !message.is_recalled && (
  <DropdownMenu>
    {/* ... */}
  </DropdownMenu>
)}
```

```typescript
// app/chat/page.tsx - handleRecallMessage
setMessages(prev => prev.map(msg => {
  if (msg.id === messageId) {
    return {
      ...data.message,
      sender_id: msg.sender_id ?? data.message.sender_id ?? (currentUser?.id || ''), // 保留原始 sender_id
      is_recalled: true, // 强制设置为 true
      reactions: [], // 强制清空反应
      sender: msg.sender || data.message.sender, // 保留原始 sender 信息
    }
  }
  return msg
}))
```

#### 7.4 消息位置问题（自己跟自己聊天）
**问题**：撤回后消息位置不正确（应该显示在右边，但显示在左边）

**修复**：
```typescript
// app/chat/page.tsx - handleRecallMessage
// 确保撤回后保留原始的 sender_id，以维持正确的消息位置
return {
  ...data.message,
  sender_id: msg.sender_id ?? data.message.sender_id ?? (currentUser?.id || ''),
  // ... 其他字段
}
```

---

## 8. 聊天页面自动滚动：打开时自动滚动到最新消息

### 实现内容
- 实现了打开聊天页面时自动滚动到最新消息
- 实现了切换会话时自动滚动到底部
- 实现了收到新消息时自动滚动到最新消息

### 关键实现

#### 8.1 使用 useRef 跟踪滚动状态
```typescript
// components/chat/message-list.tsx
const hasInitiallyScrolledRef = useRef(false)
const previousMessagesLengthRef = useRef(messages.length)
```

#### 8.2 自动滚动逻辑
```typescript
useEffect(() => {
  const scrollContainer = getScrollContainer()
  if (scrollContainer) {
    // Reset initial scroll flag if messages were cleared (conversation switched)
    if (messages.length === 0 && previousMessagesLengthRef.current > 0) {
      hasInitiallyScrolledRef.current = false
    }

    // Auto-scroll to bottom when:
    // 1. Messages are first loaded (from empty to having messages, or from loading to loaded)
    // 2. New messages are added
    const shouldScroll =
      (!hasInitiallyScrolledRef.current && messages.length > 0 && !isLoading) || // First load
      (messages.length > previousMessagesLengthRef.current) // New messages added

    if (shouldScroll) {
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
        setShowScrollDownButton(false)
        if (!hasInitiallyScrolledRef.current) {
          hasInitiallyScrolledRef.current = true
        }
      })
    }

    previousMessagesLengthRef.current = messages.length
  }
}, [messages, isLoading])
```

### 工作流程
1. **首次加载**：当消息从空变为有内容且不在加载状态时，自动滚动到底部
2. **切换会话**：当消息从有变为空时，重置初始滚动标志；新会话加载完成后自动滚动到底部
3. **新消息**：当消息数量增加时，自动滚动到最新消息

---

## 9. 代码质量改进

### 9.1 类型安全
- 创建了 `lib/database/types.ts` 统一类型定义
- 所有数据库操作函数都有明确的类型签名
- 避免了类型不一致导致的运行时错误

### 9.2 错误处理
- 所有 CloudBase 操作都添加了 try-catch 错误处理
- 添加了详细的错误日志，便于调试
- API 路由返回了详细的错误信息（包括 debug 字段）

### 9.3 代码组织
- 按功能模块组织代码（users、conversations、messages）
- 每个模块都有清晰的职责划分
- 统一的导出接口（index.ts）

---

## 10. 测试与验证

### 10.1 支付订阅更新
- ✅ 微信支付成功后，用户订阅状态正确更新
- ✅ 支付宝支付成功后，用户订阅状态正确更新
- ✅ 前端 "pro" 状态正确显示

### 10.2 文件上传
- ✅ 免费用户上传限制为 10MB
- ✅ 会员用户上传限制为 500MB
- ✅ 大文件上传功能正常

### 10.3 图片显示
- ✅ CloudBase 图片不再出现 `ERR_INVALID_RESPONSE` 错误
- ✅ 旧数据中的临时 URL 自动转换为永久有效的 URL
- ✅ 图片加载时不再显示黑色框或黑色点

### 10.4 消息操作
- ✅ 撤回消息功能正常（2分钟内）
- ✅ 隐藏/取消隐藏消息功能正常
- ✅ 删除消息功能正常
- ✅ 置顶/取消置顶对话功能正常
- ✅ 撤回后不再显示反应 UI
- ✅ 撤回后消息位置正确

### 10.5 自动滚动
- ✅ 打开聊天页面时自动滚动到最新消息
- ✅ 切换会话时自动滚动到底部
- ✅ 收到新消息时自动滚动到最新消息

---

## 11. 经验总结

### 11.1 代码重构的重要性
- **分离关注点**：将 CloudBase 和 Supabase 的逻辑分离，使代码更清晰、更易维护
- **模块化设计**：按功能模块组织代码，每个模块职责单一
- **向后兼容**：重构时保持 API 接口不变，确保现有功能不受影响

### 11.2 CloudBase vs Supabase 的差异
- **数据查询方式**：CloudBase 使用 `where` 查询，Supabase 使用 SQL 查询
- **ID 字段**：CloudBase 的文档有 `_id`（文档ID）和 `id`（业务ID），需要区分使用
- **数据返回格式**：CloudBase 可能返回多种格式（`res.data`、`res.data[0]`、`res` 直接），需要兼容处理
- **类型一致性**：CloudBase 可能将 ID 存储为字符串或数字，需要统一处理

### 11.3 调试技巧
- **详细日志**：在关键位置添加详细的日志，包括数据结构和类型信息
- **错误信息**：API 返回详细的错误信息（包括 debug 字段），便于前端定位问题
- **逐步排查**：从数据读取、类型转换、授权检查等各个环节逐步排查问题

### 11.4 用户体验优化
- **自动滚动**：打开聊天页面时自动滚动到最新消息，提升用户体验
- **图片加载**：移除占位符和强制样式，让图片自然加载
- **错误提示**：提供清晰的错误提示，帮助用户理解问题

---

## 12. 后续工作

### 12.1 已知问题
- 无

### 12.2 待优化项
- 可以考虑添加图片懒加载优化
- 可以考虑添加加载时的骨架屏或占位符
- 可以考虑优化图片预加载策略

### 12.3 功能扩展
- CloudBase 的聊天功能已基本完成，与 Supabase 功能对齐
- 可以继续扩展其他功能（如频道、表情等）

---

## 总结

今天完成了**代码架构的重大重构**和**CloudBase 功能的完善**，主要成果包括：

1. ✅ **代码架构重构**：将 CloudBase 和 Supabase 的逻辑完全分离，使代码更清晰、更易维护
   - **重要**：由于 Supabase 没有备份，在重构过程中重新实现了 Supabase 的消息操作功能（撤回、隐藏、删除、置顶），确保功能完整
2. ✅ **支付订阅更新**：实现了微信和支付宝支付后自动更新 CloudBase 用户的订阅状态
3. ✅ **文件上传优化**：添加了订阅检查，动态设置文件大小限制（免费 10MB，会员 500MB）
4. ✅ **图片 URL 过期问题**：创建了代理 API，解决了 CloudBase 临时 URL 过期问题
5. ✅ **图片加载优化**：移除了占位符和强制样式，让图片自然加载
6. ✅ **消息操作功能**：实现了 CloudBase 的撤回、隐藏、删除、置顶功能，并与 Supabase 功能对齐
7. ✅ **撤回功能优化**：修复了授权检查、日期显示、反应 UI、消息位置等多个问题
8. ✅ **自动滚动**：实现了打开聊天页面时自动滚动到最新消息

所有功能都已测试通过，代码质量得到显著提升。现在 CloudBase 和 Supabase 的代码完全分离，互不干扰，功能完全对齐，便于后续维护和扩展。

