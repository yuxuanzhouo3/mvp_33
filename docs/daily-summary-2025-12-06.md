# Daily Summary - 2025-12-06

## Channels 页面优化 & 联系人收藏功能 & 未读数计算优化 (Channels Page Optimization & Contact Favorites & Unread Count Calculation Fixes)

### 功能概述
1) Channels 页面优化：移除自动打开群聊逻辑，用户需手动点击才能查看消息；移除 channels 页面的消息提醒功能。  
2) 未读数计算优化：Messages 标签的未读提醒只计算直接消息（direct），排除群聊（group）和频道（channel）类型。  
3) 联系人收藏功能：在联系人详情页添加收藏/取消收藏按钮，实现 Favorites tab 显示收藏的联系人。  
4) 跨页面未读提醒：确保在 contacts、channels 等页面也能实时看到 Messages 标签的未读消息红点。  
5) React Hooks 顺序问题修复：修复了 channels 和 contacts 页面的 Hooks 调用顺序错误。

---

## 1. Channels 页面优化

### 问题描述
用户反馈：
- Channels 页面进入时会自动打开第一个群聊，希望只显示群聊列表，需要点击才能查看消息
- Channels 页面不需要显示消息提醒
- Channels 里的群聊消息不应该影响 Messages 页面的消息提醒

### 实现内容

#### 1.1 移除自动选择群聊逻辑

**修改文件**：`app/channels/page.tsx`

**修改前**：
```typescript
if (channelsAndGroups.length > 0 && !selectedChannelId) {
  setSelectedChannelId(channelsAndGroups[0].id)
}
```

**修改后**：
```typescript
// Don't auto-select first channel - let user choose
```

现在用户进入 Channels 页面时，右侧会显示空状态提示，需要手动点击群聊才能查看消息。

#### 1.2 移除 Channels 页面的消息提醒

**修改内容**：
1. 移除了 `totalUnreadCount` 状态和相关计算逻辑
2. 移除了传递给 `WorkspaceHeader` 的 `totalUnreadCount` prop

**修改文件**：
- `app/channels/page.tsx`：移除未读数计算和传递

现在 Channels 页面不再显示消息提醒，也不会影响 Messages 标签的未读提醒。

---

## 2. 未读数计算优化

### 问题描述
用户反馈：Messages 标签的未读提醒应该只计算直接消息（direct messages），不应该包括群聊（group）和频道（channel）的未读数。

### 实现内容

#### 2.1 修改未读数计算逻辑

**修改文件**：
1. `app/chat/page.tsx`
2. `app/contacts/page.tsx`
3. `components/chat/workspace-header.tsx`

**修改前**：
```typescript
const count = cachedConversations.reduce((sum: number, conv: any) => 
  sum + (conv.unread_count || 0), 0)
```

**修改后**：
```typescript
// Count only direct messages, exclude channels and groups
const count = cachedConversations
  .filter((conv: any) => conv.type === 'direct')
  .reduce((sum: number, conv: any) => sum + (conv.unread_count || 0), 0)
```

#### 2.2 实时订阅更新逻辑

**修改文件**：`components/chat/workspace-header.tsx`

在实时消息订阅中，更新未读数时也过滤掉非 direct 类型的会话：
```typescript
// Count only direct messages, exclude channels and groups
const count = updated
  .filter((conv: any) => conv.type === 'direct')
  .reduce((sum: number, conv: any) => sum + (conv.unread_count || 0), 0)
```

### 效果
- Messages 标签的未读提醒只显示直接消息的数量
- 群聊和频道的未读数不再影响 Messages 标签
- 用户在 Channels 页面查看群聊消息时，不会影响 Messages 标签的未读提醒

---

## 3. 联系人收藏功能

### 问题描述
用户需求：在联系人详情页添加"添加到收藏"功能，收藏的联系人显示在 Contacts 页面的 Favorites tab 中。

### 实现内容

#### 3.1 添加 PATCH API 接口

**新增文件**：`app/api/contacts/route.ts`

**新增方法**：`PATCH /api/contacts?contactUserId=xxx`

**功能**：更新联系人的收藏状态

**实现**：
```typescript
export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const contactUserId = searchParams.get('contactUserId')
  const body = await request.json()
  const { is_favorite } = body

  // Update contact
  const { data: updatedContact, error: updateError } = await supabase
    .from('contacts')
    .update({ is_favorite })
    .eq('user_id', currentUser.id)
    .eq('contact_user_id', contactUserId)
    .select('*')
    .single()

  return NextResponse.json({
    success: true,
    contact: updatedContact,
  })
}
```

#### 3.2 联系人详情页添加收藏按钮

**修改文件**：`components/contacts/contacts-panel.tsx`

**实现内容**：
1. 添加 `favoriteStatuses` 状态管理收藏状态
2. 在联系人详情页的按钮区域添加收藏按钮（星形图标）
3. 点击按钮时调用 PATCH API 更新收藏状态

**代码片段**：
```typescript
{selectedUser.id !== currentUser.id && (
  <Button
    variant={favoriteStatuses.get(selectedUser.id) ? "default" : "outline"}
    onClick={async () => {
      const newFavoriteStatus = !favoriteStatuses.get(selectedUser.id)
      const response = await fetch(
        `/api/contacts?contactUserId=${encodeURIComponent(selectedUser.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_favorite: newFavoriteStatus }),
        }
      )
      // Update state...
    }}
  >
    <Star className={cn("h-4 w-4", favoriteStatuses.get(selectedUser.id) && "fill-current")} />
  </Button>
)}
```

#### 3.3 实现 Favorites Tab

**修改文件**：`components/contacts/contacts-panel.tsx`

**实现内容**：
1. 从 `users` 中提取 `_is_favorite` 属性初始化收藏状态
2. 过滤出收藏的联系人：`favoriteUsers = baseUsersWithSelf.filter(u => favoriteStatuses.get(u.id) === true)`
3. 在 Favorites tab 中显示收藏的联系人列表

**代码片段**：
```typescript
<TabsContent value="favorites" className="m-0 p-4">
  {favoriteUsers.length === 0 ? (
    <div className="text-center text-muted-foreground py-8">
      <Star className="h-12 w-12 mx-auto mb-2 opacity-20" />
      <p>{t('noFavoriteContacts')}</p>
    </div>
  ) : (
    <div className="space-y-1">
      {favoriteUsers.map((user) => (
        <button
          key={user.id}
          onClick={() => setSelectedUser(user)}
          className={cn(
            'w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent',
            selectedUser?.id === user.id && 'bg-accent'
          )}
        >
          {/* User avatar and info */}
        </button>
      ))}
    </div>
  )}
</TabsContent>
```

#### 3.4 保存收藏状态到缓存

**修改文件**：`app/contacts/page.tsx`

**实现内容**：
1. 从 API 返回的 contacts 数据中提取 `is_favorite` 信息
2. 将 `is_favorite` 作为 `_is_favorite` 属性附加到 User 对象上
3. 保存到缓存时保留 `_is_favorite` 信息

**代码片段**：
```typescript
// Transform contacts to User format, preserving is_favorite info
const contactsMap = new Map<string, { user: User; is_favorite: boolean }>()
;(data.contacts || []).forEach((contact: any) => {
  if (contact.user) {
    contactsMap.set(contact.contact_user_id, {
      user: contact.user,
      is_favorite: contact.is_favorite || false,
    })
  }
})

let contactUsers = Array.from(contactsMap.values()).map(item => ({
  ...item.user,
  _is_favorite: item.is_favorite, // Store as private property
}))
```

### 效果
- 用户可以在联系人详情页点击星形按钮添加/移除收藏
- 收藏的联系人会显示在 Favorites tab 中
- 收藏状态会保存到数据库，刷新页面后仍然保留
- 收藏状态会同步到缓存，确保数据一致性

---

## 4. 跨页面未读提醒优化

### 问题描述
用户反馈：在 contacts 或 channels 页面时，如果收到新消息，Messages 标签应该实时显示未读消息红点，而不需要点击 Messages 标签才能看到。

### 实现内容

#### 4.1 WorkspaceHeader 实时订阅优化

**修改文件**：`components/chat/workspace-header.tsx`

**实现内容**：
1. 添加实时消息订阅，监听新消息插入事件
2. 监听 `localStorage` 变化和 `conversationsUpdated` 自定义事件
3. 从缓存中自动计算未读数并更新显示

**关键代码**：
```typescript
// Real-time subscription for new messages
useEffect(() => {
  const channel = supabase
    .channel(`unread-count-${currentUser.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
    }, async (payload) => {
      // Update cache and recalculate unread count
      // Dispatch custom event
      window.dispatchEvent(new Event('conversationsUpdated'))
    })
    .subscribe()
}, [currentUser, workspace])

// Listen for cache updates
useEffect(() => {
  const handleCustomStorage = () => {
    setTimeout(() => {
      calculateFromCache()
    }, 0)
  }
  window.addEventListener('conversationsUpdated', handleCustomStorage)
  return () => {
    window.removeEventListener('conversationsUpdated', handleCustomStorage)
  }
}, [currentUser, workspace])
```

#### 4.2 Contacts 页面未读数计算

**修改文件**：`app/contacts/page.tsx`

**实现内容**：
1. 从缓存读取所有会话的未读数
2. 只计算 direct 类型的会话
3. 监听 `conversationsUpdated` 事件实时更新

**关键代码**：
```typescript
useEffect(() => {
  const calculateUnreadCount = () => {
    const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
    const cachedData = localStorage.getItem(cacheKey)
    if (cachedData) {
      const cachedConversations = JSON.parse(cachedData)
      // Count only direct messages, exclude channels and groups
      const count = cachedConversations
        .filter((conv: any) => conv.type === 'direct')
        .reduce((sum: number, conv: any) => sum + (conv.unread_count || 0), 0)
      setTotalUnreadCount(count)
    }
  }

  // Listen to storage events and custom events
  const handleCustomStorage = () => {
    setTimeout(() => {
      calculateUnreadCount()
    }, 0)
  }

  window.addEventListener('conversationsUpdated', handleCustomStorage)
}, [currentUser, currentWorkspace])
```

#### 4.3 Chat 页面触发更新事件

**修改文件**：`app/chat/page.tsx`

**实现内容**：
在更新缓存时触发 `conversationsUpdated` 事件，通知其他页面更新未读数

**关键代码**：
```typescript
const persistConversationsCache = (conversations: ConversationWithDetails[]) => {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(conversations))
    localStorage.setItem(cacheTimestampKey, Date.now().toString())
    // Dispatch custom event to notify WorkspaceHeader of cache update
    window.dispatchEvent(new Event('conversationsUpdated'))
  } catch (error) {
    console.error('Failed to persist conversations cache:', error)
  }
}
```

### 效果
- 在 contacts 页面时，如果收到新消息，Messages 标签会实时显示红点
- 在 channels 页面时，同样会实时显示未读消息红点
- 无需点击 Messages 标签，只要能看到 Messages 标签，就能看到红点提示
- 所有页面的未读提醒都是实时同步的

---

## 5. React Hooks 顺序问题修复

### 问题描述
在实现上述功能时，出现了 React Hooks 顺序错误：
- Channels 页面：`totalUnreadCount` 的 `useState` 被放在了早期返回之后
- Contacts 页面：`totalUnreadCount` 的 `useState` 和相关的 `useEffect` 被放在了早期返回之后

### 问题原因
React Hooks 规则要求所有 Hooks 必须在组件顶层调用，不能在条件语句、循环或早期返回之后调用。当 `currentUser` 或 `currentWorkspace` 为 `null` 时，会在早期返回，不会执行后面的 Hooks；当它们都有值时，会执行所有 Hooks，导致 Hooks 顺序在不同渲染间不一致。

### 修复内容

#### 5.1 Channels 页面修复

**修改文件**：`app/channels/page.tsx`

**修复前**：
```typescript
if (!currentUser || !currentWorkspace) {
  return null
}

// Calculate total unread count from all conversations
const [totalUnreadCount, setTotalUnreadCount] = useState(0)
useEffect(() => {
  // ...
}, [currentUser, currentWorkspace])
```

**修复后**：
```typescript
const [totalUnreadCount, setTotalUnreadCount] = useState(0)

// Calculate total unread count from all conversations
useEffect(() => {
  // ...
}, [currentUser, currentWorkspace])

if (!currentUser || !currentWorkspace) {
  return null
}
```

#### 5.2 Contacts 页面修复

**修改文件**：`app/contacts/page.tsx`

**修复内容**：
1. 将 `totalUnreadCount` 的 `useState` 移到所有其他 Hooks 之后
2. 将相关的 `useEffect` 移到早期返回之前
3. 删除重复的 `useEffect`（在早期返回之后的版本）

**修复后的 Hooks 顺序**：
```typescript
// 1. useState hooks
const [currentUser, setCurrentUser] = useState<User | null>(null)
const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
// ... 其他 useState
const [totalUnreadCount, setTotalUnreadCount] = useState(0)

// 2. useRef hooks
const isLoadingContactsRef = useRef(false)

// 3. useCallback hooks
const loadContacts = useCallback(...)

// 4. useEffect hooks
useEffect(...) // totalUnreadCount 相关的
useEffect(...) // 其他 useEffect

// 5. 早期返回检查
if (!currentUser || !currentWorkspace) {
  return null
}
```

### 效果
- 所有 Hooks 都在组件顶层按固定顺序调用
- 不会再出现 Hooks 顺序错误
- 代码符合 React Hooks 规则

---

## 技术细节

### 1. 未读数计算过滤逻辑

**关键点**：只计算 `type === 'direct'` 的会话

**应用位置**：
- Chat 页面：`conversations.filter(conv => conv.type === 'direct')`
- Contacts 页面：缓存读取时过滤
- WorkspaceHeader：实时订阅和缓存计算时过滤

### 2. 收藏状态存储

**设计**：使用 `_is_favorite` 作为私有属性附加到 User 对象

**原因**：
- User 类型定义中没有 `is_favorite` 字段（该字段在 Contact 表中）
- 使用私有属性避免类型冲突
- 便于在组件间传递收藏状态

### 3. 跨页面事件通信

**机制**：
- `localStorage` 存储会话列表缓存
- `storage` 事件：跨标签页同步
- `conversationsUpdated` 自定义事件：同标签页内同步

**工作流程**：
1. Chat 页面收到新消息 → 更新缓存 → 触发 `conversationsUpdated` 事件
2. WorkspaceHeader 监听事件 → 重新计算未读数 → 更新显示
3. Contacts/Channels 页面监听事件 → 重新计算未读数 → 更新显示

---

## 测试建议

### 1. Channels 页面测试
- [ ] 进入 Channels 页面，确认不会自动打开群聊
- [ ] 点击群聊，确认可以正常查看消息
- [ ] 确认 Channels 页面不显示消息提醒

### 2. 未读数计算测试
- [ ] 在群聊中收到消息，确认 Messages 标签未读数不增加
- [ ] 在直接消息中收到消息，确认 Messages 标签未读数增加
- [ ] 确认群聊和频道的未读数不影响 Messages 标签

### 3. 收藏功能测试
- [ ] 在联系人详情页点击星形按钮，确认可以添加收藏
- [ ] 再次点击，确认可以取消收藏
- [ ] 切换到 Favorites tab，确认收藏的联系人显示
- [ ] 刷新页面，确认收藏状态保留

### 4. 跨页面未读提醒测试
- [ ] 在 contacts 页面时，收到新消息，确认 Messages 标签显示红点
- [ ] 在 channels 页面时，收到新消息，确认 Messages 标签显示红点
- [ ] 确认红点实时更新，无需刷新页面

---

## 相关文件

### 修改的文件
- `app/channels/page.tsx` - Channels 页面优化，移除自动选择和未读数计算
- `app/contacts/page.tsx` - Contacts 页面未读数计算和 Hooks 顺序修复
- `app/chat/page.tsx` - Chat 页面未读数计算过滤和事件触发
- `components/contacts/contacts-panel.tsx` - 联系人收藏功能和 Favorites tab
- `components/chat/workspace-header.tsx` - 未读数计算过滤和实时订阅优化
- `app/api/contacts/route.ts` - 新增 PATCH 接口用于更新收藏状态

### 新增的功能
- 联系人收藏/取消收藏功能
- Favorites tab 显示收藏的联系人
- 跨页面实时未读提醒

---

## 总结

今天主要完成了 Channels 页面的优化、未读数计算的优化、联系人收藏功能的实现，以及跨页面未读提醒的优化。这些改进提升了用户体验，使界面更加清晰和易用。同时修复了 React Hooks 顺序问题，确保代码符合最佳实践。

---

## 6. 页面加载体验优化 - 骨架屏实现 (Loading Experience Optimization - Skeleton Screens)

### 问题描述
用户反馈：
- Chat 页面刷新后，左侧聊天框列表会显示全屏 loading，即使有缓存数据也应该立即显示
- 消息列表加载时显示全屏 loading，体验不够流畅
- Contacts 页面和 Requests 页面也有类似问题

### 实现内容

#### 6.1 Chat 页面左侧聊天框加载优化

**问题**：刷新页面后，即使有缓存，也会先显示全屏 loading，然后才显示聊天框列表。

**解决方案**：
1. 组件初始化时立即检查缓存并显示
2. 有缓存时立即显示，不显示全屏 loading
3. 添加刷新指示器（`isRefreshingConversations`）在顶部显示小的加载提示
4. 实现增量更新逻辑（新会话插入顶部，保留已有会话）

**修改文件**：`app/chat/page.tsx`

**关键实现**：

1. **组件初始化时立即检查缓存**：
```typescript
// Check cache immediately on mount to show cached conversations instantly
useEffect(() => {
  if (!currentUser || !currentWorkspace || typeof window === 'undefined') return
  if (conversations.length > 0) return // Already have conversations, skip
  
  const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
  const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`
  const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
  
  // ... 检查缓存
  if (cachedConversations && cachedConversations.length > 0) {
    const enrichedCached = applyPinnedOrdering(directAndGroups.map(enrichConversation))
    setConversations(enrichedCached)
    conversationsRef.current = enrichedCached
    setIsLoadingConversations(false) // Hide loading immediately
    setIsRefreshingConversations(true) // Show refresh indicator
  }
}, [currentUser, currentWorkspace, enrichConversation, applyPinnedOrdering])
```

2. **增量更新逻辑**：
```typescript
// Incremental update: merge new conversations with existing ones (like WeChat)
const prevIds = new Set(prev.map(c => c.id))
const newIds = new Set(finalConversations.map(c => c.id))

// Separate new and existing conversations
const newConversations = finalConversations.filter(c => !prevIds.has(c.id))
const existingConversations = finalConversations.filter(c => prevIds.has(c.id))

// Update existing conversations with new data, preserve position
const updatedExisting = prev.map(prevConv => {
  const newData = existingConversations.find(c => c.id === prevConv.id)
  if (newData) {
    // Merge: use new data but preserve optimistic states
    return { ...newData, unread_count: shouldPreserveRead ? 0 : (newData.unread_count || 0) }
  }
  return prevConv
})

// Merge: new conversations at top, then existing (updated) conversations
const mergedConversations = [
  ...newConversations, // New conversations go to top
  ...updatedExisting    // Existing conversations (updated) follow
]
```

3. **刷新指示器**：
```typescript
const [isRefreshingConversations, setIsRefreshingConversations] = useState(false)

// 在 Sidebar 组件顶部显示
{isRefreshingConversations && !isLoadingConversations && (
  <div className="border-b bg-muted/30">
    <div className="h-1 bg-primary/20 relative overflow-hidden">
      <div className="h-full bg-primary/60 animate-pulse" style={{ width: '30%' }} />
    </div>
    <div className="px-4 py-1.5 flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>Refreshing...</span>
    </div>
  </div>
)}
```

**效果**：
- 刷新页面时，如果有缓存，聊天框列表立即显示
- 不显示全屏 loading，只在顶部显示小的刷新指示器
- 新会话插入到顶部，已有会话平滑更新
- 体验类似微信，流畅自然

---

#### 6.2 消息列表加载优化 - 骨架屏实现

**问题**：消息列表加载时显示全屏 loading（spinner + 文字），体验不够流畅。

**解决方案**：使用骨架屏（Skeleton Screen）替代全屏 loading。

**新增文件**：`components/chat/message-skeleton.tsx`

**实现内容**：
1. 创建消息骨架屏组件，显示 5 条消息占位符
2. 交替显示自己和他人的消息
3. 不同长度的消息气泡（短、中、长）
4. 头像占位符（仅在消息组开始时显示）
5. 发送者名称占位符（仅他人消息）
6. 时间戳占位符
7. 使用 `animate-pulse` 动画

**关键代码**：
```typescript
export function MessageSkeleton({ count = 5 }: MessageSkeletonProps) {
  const skeletonMessages = [
    { isOwn: false, width: 'w-48', height: 'h-16', showAvatar: true },
    { isOwn: true, width: 'w-64', height: 'h-20', showAvatar: false },
    { isOwn: false, width: 'w-56', height: 'h-12', showAvatar: false },
    { isOwn: true, width: 'w-52', height: 'h-16', showAvatar: true },
    { isOwn: false, width: 'w-72', height: 'h-24', showAvatar: true },
  ].slice(0, count)

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {skeletonMessages.map((msg, index) => (
        <div key={index} className={cn('flex gap-3', msg.isOwn && 'flex-row-reverse')}>
          {/* Avatar, name, message bubble, timestamp skeletons */}
        </div>
      ))}
    </div>
  )
}
```

**修改文件**：`components/chat/message-list.tsx`

**修改前**：
```typescript
{isLoading && messages.length === 0 ? (
  <div className="flex items-center justify-center h-full min-h-[400px]">
    <div className="text-center">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
      <p className="text-sm text-muted-foreground">Loading messages...</p>
    </div>
  </div>
) : (
```

**修改后**：
```typescript
{isLoading && messages.length === 0 ? (
  <MessageSkeleton count={5} />
) : (
```

**效果**：
- 不再显示全屏 loading
- 显示骨架屏，模拟真实消息布局
- 视觉更连贯，用户能感知正在加载消息
- 体验更接近微信、WhatsApp 等应用

---

#### 6.3 联系人页面加载优化 - 骨架屏实现

**问题**：联系人列表加载时显示全屏 loading（spinner + 文字），体验不够流畅。

**解决方案**：
1. 创建联系人骨架屏组件
2. 组件初始化时立即检查缓存并显示
3. 有缓存时立即显示，无缓存时显示骨架屏

**新增文件**：`components/contacts/contact-skeleton.tsx`

**实现内容**：
1. 显示 8 个联系人占位符
2. 按部门分组显示（模拟真实结构）
3. 包含：
   - 头像占位符（圆形）
   - 状态指示器占位符（小圆点）
   - 姓名占位符（不同宽度）
   - 职位占位符（不同宽度）
   - 部门标题占位符
4. 使用 `animate-pulse` 动画

**关键代码**：
```typescript
export function ContactSkeleton({ count = 8, showDepartments = true }: ContactSkeletonProps) {
  const departments = showDepartments ? [
    { name: 'Engineering', count: 3 },
    { name: 'Design', count: 2 },
    { name: 'Product', count: 3 },
  ] : [{ name: '', count: count }]

  return (
    <div className="space-y-2">
      {departments.map((dept, deptIndex) => (
        <div key={deptIndex} className="p-2">
          {showDepartments && dept.name && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <div className="h-4 w-20 bg-muted/60 rounded animate-pulse" />
            </div>
          )}
          {/* Contact items skeleton */}
        </div>
      ))}
    </div>
  )
}
```

**修改文件**：
- `components/contacts/contacts-panel.tsx`：替换 loading 显示为骨架屏
- `app/contacts/page.tsx`：添加组件初始化时立即检查缓存的逻辑

**关键实现**：
```typescript
// Check cache immediately on mount to show cached contacts instantly
useEffect(() => {
  if (!currentUser || typeof window === 'undefined') return
  if (contacts.length > 0) return // Already have contacts, skip
  
  const cacheKey = `contacts_${currentUser.id}`
  const cacheTsKey = `contacts_timestamp_${currentUser.id}`
  const CACHE_DURATION = 2 * 60 * 1000 // 2 minutes cache
  
  // ... 检查缓存并立即显示
  if (contactUsers && contactUsers.length > 0) {
    setContacts(contactUsers.map((u: any) => ({ ...u, _is_favorite: u._is_favorite || false })))
    setHasLoadedContacts(true)
    setIsLoading(false) // Hide loading immediately
  }
}, [currentUser])
```

**效果**：
- 刷新页面时，如果有缓存，联系人列表立即显示
- 没有缓存时显示骨架屏，不显示全屏 loading
- 视觉更连贯，体验更流畅

---

#### 6.4 联系人请求页面加载优化 - 骨架屏实现

**问题**：联系人请求列表加载时显示 "Loading requests..." 文字，体验不够流畅。

**解决方案**：
1. 创建请求骨架屏组件
2. 扩展缓存机制（不仅缓存数量，还缓存完整请求列表）
3. 组件初始化时立即检查缓存并显示

**新增文件**：`components/contacts/request-skeleton.tsx`

**实现内容**：
1. 显示 3 个请求卡片占位符
2. 包含：
   - 头像占位符（圆形）
   - 姓名和 Badge 占位符
   - 邮箱占位符
   - 可选的消息内容占位符（部分请求有）
   - 操作按钮占位符（Accept, Reject, Message）
3. 使用 `animate-pulse` 动画

**关键代码**：
```typescript
export function RequestSkeleton({ count = 3 }: RequestSkeletonProps) {
  const skeletonRequests = [
    { nameWidth: 'w-24', emailWidth: 'w-32', hasMessage: false },
    { nameWidth: 'w-28', emailWidth: 'w-36', hasMessage: true, messageWidth: 'w-48' },
    { nameWidth: 'w-20', emailWidth: 'w-28', hasMessage: true, messageWidth: 'w-40' },
  ].slice(0, count)

  return (
    <div className="p-4 space-y-3">
      {skeletonRequests.map((request, index) => (
        <div key={index} className="flex items-start gap-3 p-4 border rounded-lg">
          {/* Avatar, content, action buttons skeletons */}
        </div>
      ))}
    </div>
  )
}
```

**修改文件**：`components/contacts/contact-requests-panel.tsx`

**关键实现**：

1. **扩展缓存机制**：
```typescript
const requestsCacheKey = cacheKey ? `${cacheKey}_list` : null
const requestsCacheTsKey = cacheKey ? `${cacheKey}_list_ts` : null

// 缓存完整的请求列表（2分钟）
if (requestsCacheKey && requestsCacheTsKey && typeof window !== 'undefined') {
  localStorage.setItem(requestsCacheKey, JSON.stringify(nextRequests))
  localStorage.setItem(requestsCacheTsKey, Date.now().toString())
}
```

2. **组件初始化时立即检查缓存**：
```typescript
// Check cache immediately on mount to show cached requests instantly
useEffect(() => {
  if (!currentUser || typeof window === 'undefined') return
  if (requests.length > 0) return // Already have requests, skip
  
  const requestsCacheKey = `pending_requests_${currentUser.id}_list`
  const requestsCacheTsKey = `${requestsCacheKey}_ts`
  const ttl = 2 * 60 * 1000 // 2 minutes cache
  
  // ... 检查缓存并立即显示
  if (parsedRequests && Array.isArray(parsedRequests) && parsedRequests.length > 0) {
    setRequests(parsedRequests)
    setIsLoading(false) // Hide loading immediately
    setHasInitiallyLoaded(true) // Mark as loaded to prevent skeleton
  }
}, [currentUser])
```

3. **替换 loading 显示**：
```typescript
// 修改前
if (showInitialLoading) {
  return (
    <div className="flex items-center justify-center p-8 text-muted-foreground">
      Loading requests...
    </div>
  )
}

// 修改后
if (showInitialLoading) {
  return <RequestSkeleton count={3} />
}
```

**效果**：
- 刷新页面时，如果有缓存，请求列表立即显示
- 没有缓存时显示骨架屏，不显示全屏 loading
- 视觉更连贯，体验更流畅

---

## 技术细节

### 1. 骨架屏设计原则

**关键点**：
- 模拟真实内容布局，让用户知道会加载什么
- 使用不同宽度/高度模拟内容多样性
- 轻微动画（`animate-pulse`）提供加载反馈
- 保持与真实内容相同的间距和结构

**应用场景**：
- 消息列表：模拟消息气泡布局
- 联系人列表：模拟联系人卡片布局
- 请求列表：模拟请求卡片布局

### 2. 缓存优先加载策略

**策略**：
1. 组件初始化时立即检查缓存
2. 有缓存：立即显示，后台刷新
3. 无缓存：显示骨架屏，加载数据

**优势**：
- 立即看到内容，减少等待感
- 后台静默更新，不打断用户
- 体验流畅，类似微信等应用

### 3. 增量更新逻辑

**实现**：
- 新数据插入到顶部
- 已有数据在原位置更新
- 保留乐观状态（如 `unread_count = 0`）

**优势**：
- 列表顺序稳定，不会闪烁
- 用户体验流畅
- 符合用户预期（新内容在顶部）

---

## 测试建议

### 1. Chat 页面测试
- [ ] 刷新页面，确认有缓存时聊天框列表立即显示
- [ ] 确认不显示全屏 loading，只显示顶部刷新指示器
- [ ] 确认新会话插入到顶部
- [ ] 确认已有会话平滑更新，不闪烁

### 2. 消息列表测试
- [ ] 打开新会话，确认显示骨架屏而不是全屏 loading
- [ ] 确认骨架屏布局与真实消息布局一致
- [ ] 确认加载完成后平滑过渡到真实消息

### 3. 联系人页面测试
- [ ] 刷新页面，确认有缓存时联系人列表立即显示
- [ ] 没有缓存时确认显示骨架屏
- [ ] 确认骨架屏按部门分组显示

### 4. 请求页面测试
- [ ] 刷新页面，确认有缓存时请求列表立即显示
- [ ] 没有缓存时确认显示骨架屏
- [ ] 确认骨架屏包含所有必要元素（头像、姓名、按钮等）

---

## 相关文件

### 新增的文件
- `components/chat/message-skeleton.tsx` - 消息骨架屏组件
- `components/contacts/contact-skeleton.tsx` - 联系人骨架屏组件
- `components/contacts/request-skeleton.tsx` - 请求骨架屏组件

### 修改的文件
- `app/chat/page.tsx` - Chat 页面加载优化，增量更新逻辑
- `components/chat/sidebar.tsx` - 添加刷新指示器
- `components/chat/message-list.tsx` - 替换 loading 为骨架屏
- `app/contacts/page.tsx` - Contacts 页面加载优化
- `components/contacts/contacts-panel.tsx` - 替换 loading 为骨架屏
- `components/contacts/contact-requests-panel.tsx` - 请求页面加载优化，扩展缓存机制

---

## 总结

今天完成了页面加载体验的全面优化，实现了骨架屏方案和缓存优先加载策略。这些改进显著提升了用户体验：

1. **Chat 页面**：刷新时立即显示缓存数据，不显示全屏 loading，体验类似微信
2. **消息列表**：使用骨架屏替代全屏 loading，视觉更连贯
3. **联系人页面**：缓存优先 + 骨架屏，立即看到内容
4. **请求页面**：扩展缓存机制 + 骨架屏，体验流畅

所有优化都遵循了"立即显示缓存，后台静默更新"的原则，让用户感觉应用响应更快、更流畅。



