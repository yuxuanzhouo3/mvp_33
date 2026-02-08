# Daily Summary - 2025-11-28

## 消息撤回功能实现 (Message Recall Feature)

### 功能概述
实现了完整的消息撤回功能，允许用户在发送消息后的 2 分钟内撤回自己的消息。撤回后的消息会显示 "This message has been recalled" 提示。

### 实现步骤

#### 1. 数据库层面
**文件**: `scripts/036_add_message_recall.sql`

- 添加 `is_recalled` 字段到 `messages` 表
- 创建索引优化查询性能
- 添加 UPDATE 策略（RLS），允许用户更新自己发送的消息

**关键点**:
- PostgreSQL 不支持 `CREATE POLICY IF NOT EXISTS`，需要使用 `DROP POLICY IF EXISTS` 然后 `CREATE POLICY`
- UPDATE 策略需要同时满足：
  - `sender_id = auth.uid()` (只能更新自己的消息)
  - `conversation_id IN (SELECT ...)` (必须是会话成员)

```sql
-- 添加字段
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS is_recalled BOOLEAN DEFAULT false;

-- 添加 UPDATE 策略
DROP POLICY IF EXISTS "Users can update their own messages" ON messages;
CREATE POLICY "Users can update their own messages"
  ON messages FOR UPDATE
  USING (
    sender_id = auth.uid() AND
    conversation_id IN (
      SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
    )
  );
```

#### 2. TypeScript 类型定义
**文件**: `lib/types.ts`

- 在 `Message` 接口中添加 `is_recalled?: boolean` 字段

#### 3. 后端实现

**3.1 数据库函数** (`lib/supabase/database.ts`)
- 实现 `recallMessage()` 函数
- 包含时间限制检查（2 分钟内）
- 分离 users 查询避免外键关系问题

**关键优化**:
- 先更新消息，再单独查询 sender 信息，避免外键查询导致的错误
- 添加详细的错误日志便于调试

```typescript
export async function recallMessage(messageId: string): Promise<MessageWithSender | null> {
  // 1. 验证 messageId
  // 2. 查询消息状态
  // 3. 检查是否已撤回/已删除
  // 4. 检查时间限制（2 分钟）
  // 5. 更新消息状态
  // 6. 单独查询 sender 信息（避免外键查询问题）
}
```

**3.2 API 路由** (`app/api/messages/[messageId]/route.ts`)
- 在 PATCH 端点中添加 `recall` action
- 处理 Next.js 15+ 的异步 params

**关键修复**:
- Next.js 15+ 中 `params` 可能是 Promise，需要使用 `await Promise.resolve(params)`
- 添加详细的错误处理和日志

```typescript
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> | { messageId: string } }
) {
  // 处理异步 params
  const resolvedParams = await Promise.resolve(params)
  const messageId = resolvedParams.messageId
  
  // 验证和权限检查
  // 调用 recallMessage()
}
```

#### 4. 前端实现

**4.1 消息列表组件** (`components/chat/message-list.tsx`)
- 添加 `onRecallMessage` prop
- 实现 `handleRecall()` 和 `canRecallMessage()` 函数
- 在右键菜单和下拉菜单中添加撤回选项
- 显示撤回状态（"This message has been recalled"）

**关键功能**:
- `canRecallMessage()`: 检查消息是否在 2 分钟内且未被撤回/删除
- 撤回按钮只在符合条件的消息上显示
- 撤回后的消息显示特殊样式

```typescript
const canRecallMessage = (message: MessageWithSender): boolean => {
  if (!message || message.is_recalled || message.is_deleted) return false
  const messageTime = new Date(message.created_at).getTime()
  const now = Date.now()
  const timeDiff = (now - messageTime) / 1000 // seconds
  return timeDiff <= 120 // 2 minutes
}
```

**4.2 聊天页面** (`app/chat/page.tsx`)
- 实现 `handleRecallMessage()` 函数
- 调用 API 并更新本地消息状态

**4.3 侧边栏** (`components/chat/sidebar.tsx`)
- 更新最后一条消息显示，处理撤回状态

### 遇到的问题和解决方案

#### 问题 1: "Message not found" 错误
**原因**: messages 表缺少 UPDATE 的 RLS 策略
**解决**: 在 SQL 脚本中添加 UPDATE 策略

#### 问题 2: SQL 语法错误
**错误**: `CREATE POLICY IF NOT EXISTS` 不支持
**解决**: 使用 `DROP POLICY IF EXISTS` 然后 `CREATE POLICY`

#### 问题 3: UUID 类型错误 ⚠️ **关键修复**
**错误**: `invalid input syntax for type uuid: "undefined"`
**原因**: Next.js 15+ 中 `params` 可能是 Promise，未正确处理导致 `params.messageId` 为 `undefined`

**详细分析**:
- Next.js 15+ 中，动态路由的 `params` 参数可能是 `Promise<{ messageId: string }>` 而不是直接的 `{ messageId: string }`
- 直接使用 `params.messageId` 会导致 `undefined`，传递给数据库查询时就会报 UUID 类型错误

**解决方案**:
```typescript
// ❌ 错误的方式（Next.js 15+ 会失败）
export async function PATCH(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  const messageId = params.messageId // 可能是 undefined
  // ...
}

// ✅ 正确的方式（兼容 Next.js 15+）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> | { messageId: string } }
) {
  // 处理异步 params
  const resolvedParams = await Promise.resolve(params)
  const messageId = resolvedParams.messageId
  
  if (!messageId) {
    return NextResponse.json(
      { error: 'messageId is required' },
      { status: 400 }
    )
  }
  // ...
}
```

**修复的文件**:
- `app/api/messages/[messageId]/route.ts` - PUT, DELETE, PATCH 函数
- 所有使用 `params.messageId` 的地方都改为先解析 params

**影响范围**:
- 所有动态路由的 API 端点都需要这个修复
- 这是 Next.js 15+ 的 breaking change，必须处理

#### 问题 4: 外键查询问题
**错误**: 在 UPDATE 查询中使用 `users (*)` 导致错误
**原因**: Supabase 的外键关系查询在 UPDATE 操作中可能不稳定

**解决方案**: 
```typescript
// ❌ 错误的方式
const { data: updatedMessage } = await supabase
  .from('messages')
  .update({ is_recalled: true })
  .eq('id', messageId)
  .select('*, users (*)') // 外键查询可能失败
  .single()

// ✅ 正确的方式
// 1. 先更新消息
const { data: updatedMessage } = await supabase
  .from('messages')
  .update({ is_recalled: true })
  .eq('id', messageId)
  .select('*') // 只查询消息本身
  .single()

// 2. 然后单独查询 sender 信息
let sender = null
if (updatedMessage.sender_id) {
  const { data: senderData } = await supabase
    .from('users')
    .select('id, email, full_name, username, avatar_url')
    .eq('id', updatedMessage.sender_id)
    .single()
  sender = senderData
}
```

**优化点**:
- 分离查询避免复杂的外键关系
- 添加详细的错误日志便于调试
- 添加 messageId 验证防止 undefined 错误

### 优化点

1. **性能优化**:
   - 为 `is_recalled` 字段创建部分索引（只索引 true 值）
   - 分离查询避免复杂的外键关系

2. **用户体验**:
   - 撤回按钮只在 2 分钟内显示
   - 撤回后的消息显示清晰的提示
   - 在侧边栏也正确处理撤回状态

3. **安全性**:
   - RLS 策略确保只能撤回自己的消息
   - 时间限制防止滥用
   - 权限验证多层检查

4. **错误处理**:
   - 详细的错误日志
   - 友好的错误提示
   - 前端和后端双重验证

### 文件清单

**新增文件**:
- `scripts/036_add_message_recall.sql` - 数据库迁移脚本

**修改文件**:
- `lib/types.ts` - 添加 `is_recalled` 字段
- `lib/supabase/database.ts` - 实现 `recallMessage()` 函数
- `app/api/messages/[messageId]/route.ts` - 添加撤回 API 端点
- `app/chat/page.tsx` - 添加撤回处理函数
- `components/chat/message-list.tsx` - 添加撤回 UI
- `components/chat/sidebar.tsx` - 处理撤回状态显示

### 测试要点

1. ✅ 只能撤回自己发送的消息
2. ✅ 只能撤回 2 分钟内的消息
3. ✅ 已撤回的消息不能再次撤回
4. ✅ 已删除的消息不能撤回
5. ✅ 撤回后消息显示 "This message has been recalled"
6. ✅ 撤回按钮只在符合条件的消息上显示
7. ✅ 侧边栏正确显示撤回状态

### 后续优化建议

1. 可配置撤回时间限制（目前硬编码为 2 分钟）
2. 添加撤回通知（可选，通知其他用户消息已被撤回）
3. 撤回历史记录（可选，记录撤回操作）
4. 批量撤回功能（可选，撤回多条消息）

---

## 删除对话后重新创建功能实现

### 功能概述
实现了当用户删除对话后，再次点击 Message 时自动创建新对话的功能。确保删除的对话不会自动恢复，而是创建全新的对话。

### 实现步骤

#### 1. API 层面检查
**文件**: `app/api/conversations/route.ts`

**关键修复**: 在创建对话时，检查用户是否已删除该对话

```typescript
// 检查用户是否删除了这个对话
const { data: userMembership } = await supabase
  .from('conversation_members')
  .select('deleted_at')
  .eq('conversation_id', conv.id)
  .eq('user_id', currentUser.id)
  .maybeSingle()

if (userMembership && userMembership.deleted_at) {
  // 用户已删除，创建新对话而不是恢复旧的
  console.log('🔒 User has deleted this conversation, creating new one instead of restoring')
  // 继续执行创建新对话的逻辑
} else {
  // 用户未删除，返回现有对话
  return existingConversation
}
```

**逻辑说明**:
- `find_direct_conversation` 函数会找到已存在的对话（即使被用户删除）
- 但我们需要检查 `conversation_members.deleted_at` 字段
- 如果用户删除了对话（`deleted_at` 不为 NULL），则创建新对话
- 如果用户未删除，则返回现有对话

#### 2. 前端处理 userId 参数 ⚠️ **关键修复**
**文件**: `app/chat/page.tsx`

**问题描述**: 
- 原来的代码只在 `isInitialLoadRef.current === true` 时处理 `userId` 参数
- 但该标志在首次执行后立即变为 `false`
- 导致当用户从 contacts 页面点击 Message 时，如果 chat 页面已经加载过，`userId` 参数无法被处理
- 结果：点击 Message 后没有创建对话，用户看到空白页面

**根本原因**:
```typescript
// ❌ 错误的方式
if (isInitialLoadRef.current) {
  isInitialLoadRef.current = false // 第一次执行后变为 false
  
  if (userId && !conversationId) {
    // 创建对话 - 但只在第一次执行
  }
}
// 后续执行时，isInitialLoadRef.current 已经是 false，userId 永远不会被处理
```

**解决方案**:
```typescript
// ✅ 正确的方式：将 userId 检查移到 isInitialLoadRef 之前
const userId = searchParams.get('userId')
const conversationId = searchParams.get('conversation')

// CRITICAL: 始终检查 userId 参数，不依赖 isInitialLoadRef
if (userId && !conversationId) {
  if (!currentWorkspace || !currentUser) {
    // 等待用户/工作区加载完成
    console.log('⏳ Waiting for currentWorkspace/currentUser to be set')
    return
  }
  
  // 检查是否已处理过，防止重复创建
  const processedUserIdKey = `processed_userId_${userId}`
  const alreadyProcessed = sessionStorage.getItem(processedUserIdKey) === 'true'
  
  if (!alreadyProcessed) {
    console.log('📝 Creating/finding conversation for userId:', userId)
    // 创建对话
    // ...
    
    // 标记为已处理，防止重复创建
    sessionStorage.setItem(processedUserIdKey, 'true')
    setTimeout(() => {
      sessionStorage.removeItem(processedUserIdKey) // 5秒后清除，允许重新处理
    }, 5000)
  }
}

// 然后才处理 isInitialLoadRef 的逻辑
if (isInitialLoadRef.current) {
  // 其他初始加载逻辑
}
```

**关键修复点**:
1. **移出 isInitialLoadRef 检查**: 将 `userId` 处理逻辑移到 `isInitialLoadRef` 检查之前
2. **添加依赖项**: 在 useEffect 依赖项中添加 `currentUser` 和 `loadConversations`
3. **添加详细日志**: 便于调试和定位问题
   ```typescript
   console.log('🔍 URL params check:', {
     conversationId,
     userId,
     hasCurrentWorkspace: !!currentWorkspace,
     hasCurrentUser: !!currentUser,
     currentWorkspaceId: currentWorkspace?.id,
     currentUserId: currentUser?.id
   })
   ```

**影响**:
- 修复前：点击 Message 后，如果 chat 页面已加载，不会创建对话
- 修复后：无论 chat 页面是否已加载，都能正确处理 `userId` 参数并创建对话

**测试验证**:
- ✅ 首次访问 chat 页面时，`userId` 参数能正确处理
- ✅ 从 contacts 页面点击 Message 时，即使 chat 页面已加载，也能创建对话
- ✅ 使用 sessionStorage 防止重复创建对话
- ✅ 添加的日志能帮助快速定位问题

#### 3. 恢复已删除对话的场景
虽然删除后应该创建新对话，但在某些场景下需要恢复：

1. **发送消息时**: 如果用户在已删除的对话中发送消息，自动恢复对话
2. **URL 参数选择**: 如果通过 URL 直接访问已删除的对话，恢复它
3. **手动点击对话**: 如果用户点击对话列表中的已删除对话，恢复它

**实现位置**:
- `handleSendMessage`: 发送消息时恢复
- URL 参数处理: 从 URL 选择对话时恢复
- `onSelectConversation`: 点击对话时恢复

### 关键修复总结

1. **Next.js 15+ 异步 params 处理** ⚠️ **最重要**
   - 修复了所有动态路由 API 端点
   - 使用 `await Promise.resolve(params)` 处理异步 params
   - 添加了 messageId 验证

2. **删除后创建新对话**
   - API 检查 `conversation_members.deleted_at`
   - 如果已删除，创建新对话而不是恢复

3. **前端 userId 参数处理**
   - 不依赖 `isInitialLoadRef` 标志
   - 始终检查 `userId` 参数
   - 使用 sessionStorage 防止重复创建

4. **外键查询优化**
   - 分离 users 查询避免外键关系问题
   - 先更新消息，再单独查询 sender 信息

---

**实现时间**: 2025-11-28
**状态**: ✅ 完成并测试通过


