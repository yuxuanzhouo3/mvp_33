# CloudBase 群聊功能数据库架构设计（国内版）

> **设计日期**: 2026-02-07
> **架构师**: Claude Sonnet 4.5
> **项目**: OrbitChat MVP33 - 双数据库聊天应用
> **数据库**: CloudBase (腾讯云文档型数据库)

---

## 一、CloudBase 与 Supabase 的关键差异

### 1.1 技术架构对比

| 特性 | Supabase (国际版) | CloudBase (国内版) |
|------|------------------|-------------------|
| 数据库类型 | PostgreSQL (关系型) | 文档型 NoSQL |
| 外键约束 | ✅ 支持 | ❌ 不支持 |
| JOIN 查询 | ✅ 支持 | ❌ 不支持 |
| RLS 策略 | ✅ 数据库层面 | ❌ 需应用层实现 |
| 触发器 | ✅ 数据库触发器 | ❌ 需云函数替代 |
| 实时订阅 | Realtime (逻辑复制) | Watch API |
| 事务支持 | ✅ ACID 事务 | ⚠️ 单文档事务 |

### 1.2 用户隔离策略

**重要**: 国内版和国际版的用户数据完全隔离:
- 国内用户数据存储在 CloudBase
- 国际用户数据存储在 Supabase
- 两个版本之间没有数据同步
- 根据 `NEXT_PUBLIC_DEFAULT_LANGUAGE` 环境变量路由到不同数据库

---

## 二、CloudBase 集合设计

### 2.1 orbitchat_users 集合

**文档结构**:
```json
{
  "_id": "user_uuid",
  "_openid": "wechat_openid",
  "email": "user@example.com",
  "username": "username",
  "full_name": "用户姓名",
  "avatar_url": "https://...",
  "phone": "+86 138xxxx",
  "department": "技术部",
  "title": "工程师",
  "status": "online",
  "status_message": "忙碌中",
  "subscription_type": "free",
  "subscription_expires_at": "2026-12-31T23:59:59Z",
  "region": "cn",
  "created_at": "2026-02-07T10:00:00Z",
  "updated_at": "2026-02-07T10:00:00Z"
}
```

**索引设计**:
- `email` (唯一索引)
- `username` (唯一索引)
- `_openid` (唯一索引)
- `subscription_type + subscription_expires_at` (复合索引)

### 2.2 orbitchat_conversations 集合

**文档结构**:
```json
{
  "_id": "conversation_uuid",
  "workspace_id": "workspace_uuid",
  "type": "group",
  "name": "技术讨论群",
  "description": "团队技术交流",
  "avatar_url": "https://...",
  "created_by": "user_uuid",
  "is_private": true,
  "settings": {
    "max_members": 50,
    "join_approval_required": false,
    "allow_member_invite": true,
    "only_admin_can_send": false,
    "allow_at_all": true
  },
  "member_count": 10,
  "last_message_at": "2026-02-07T12:00:00Z",
  "last_message_preview": "最后一条消息预览",
  "created_at": "2026-02-07T10:00:00Z",
  "updated_at": "2026-02-07T12:00:00Z"
}
```

**索引设计**:
- `workspace_id + last_message_at` (复合索引,倒序)
- `type + created_at` (复合索引)
- `created_by` (单字段索引)

### 2.3 orbitchat_conversation_members 集合

**文档结构**:
```json
{
  "_id": "member_uuid",
  "conversation_id": "conversation_uuid",
  "user_id": "user_uuid",
  "role": "member",
  "is_muted": false,
  "can_send_messages": true,
  "muted_until": null,
  "muted_by": null,
  "join_status": "joined",
  "invited_by": "user_uuid",
  "last_read_at": "2026-02-07T11:30:00Z",
  "notification_setting": "all",
  "is_pinned": false,
  "is_hidden": false,
  "joined_at": "2026-02-07T10:00:00Z",
  "updated_at": "2026-02-07T12:00:00Z"
}
```

**索引设计**:
- `conversation_id + join_status` (复合索引)
- `user_id + join_status` (复合索引)
- `conversation_id + user_id` (唯一复合索引)
- `conversation_id + is_muted` (复合索引)

### 2.4 orbitchat_messages 集合

**文档结构**:
```json
{
  "_id": "message_uuid",
  "conversation_id": "conversation_uuid",
  "sender_id": "user_uuid",
  "content": "消息内容",
  "type": "text",
  "metadata": {
    "file_url": "https://...",
    "file_name": "document.pdf",
    "file_size": 1024000,
    "mime_type": "application/pdf"
  },
  "reply_to": "message_uuid",
  "reactions": [
    {"emoji": "👍", "user_ids": ["user1", "user2"], "count": 2}
  ],
  "is_edited": false,
  "is_deleted": false,
  "is_recalled": false,
  "mentions": ["user_uuid1", "user_uuid2"],
  "mention_all": false,
  "created_at": "2026-02-07T12:00:00Z",
  "updated_at": "2026-02-07T12:00:00Z"
}
```

**索引设计**:
- `conversation_id + created_at` (复合索引,倒序)
- `sender_id + created_at` (复合索引)
- `mentions + created_at` (复合索引)

### 2.5 orbitchat_group_join_requests 集合

**文档结构**:
```json
{
  "_id": "request_uuid",
  "conversation_id": "conversation_uuid",
  "user_id": "user_uuid",
  "invited_by": "user_uuid",
  "message": "申请理由",
  "status": "pending",
  "reviewed_by": "admin_user_uuid",
  "reviewed_at": "2026-02-07T11:00:00Z",
  "created_at": "2026-02-07T10:30:00Z"
}
```

**索引设计**:
- `conversation_id + status + created_at` (复合索引)
- `user_id + status` (复合索引)
- `conversation_id + user_id + status` (唯一复合索引)

---

## 三、应用层权限控制

由于 CloudBase 没有 RLS,所有权限控制必须在应用层实现。

### 3.1 权限检查函数

创建文件: `lib/cloudbase/permissions.ts`

```typescript
import { db } from './client'

// 检查用户是否为群成员
export async function isGroupMember(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const member = await db
    .collection('orbitchat_conversation_members')
    .where({
      conversation_id: conversationId,
      user_id: userId,
      join_status: 'joined'
    })
    .getOne()

  return !!member
}

// 检查用户是否为群管理员
export async function isGroupAdmin(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const member = await db
    .collection('orbitchat_conversation_members')
    .where({
      conversation_id: conversationId,
      user_id: userId,
      role: db.command.in(['owner', 'admin']),
      join_status: 'joined'
    })
    .getOne()

  return !!member
}

// 检查用户是否为群主
export async function isGroupOwner(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const member = await db
    .collection('orbitchat_conversation_members')
    .where({
      conversation_id: conversationId,
      user_id: userId,
      role: 'owner',
      join_status: 'joined'
    })
    .getOne()

  return !!member
}

// 检查用户是否可以发送消息
export async function canSendMessage(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const member = await db
    .collection('orbitchat_conversation_members')
    .where({
      conversation_id: conversationId,
      user_id: userId,
      join_status: 'joined'
    })
    .getOne()

  if (!member) return false
  if (member.is_muted) return false
  if (!member.can_send_messages) return false

  // 检查群设置
  const conversation = await db
    .collection('orbitchat_conversations')
    .doc(conversationId)
    .get()

  if (conversation?.data?.settings?.only_admin_can_send) {
    return ['owner', 'admin'].includes(member.role)
  }

  return true
}

// 检查成员数量限制
export async function checkMemberLimit(
  conversationId: string,
  creatorId: string
): Promise<{ allowed: boolean; limit: number; current: number }> {
  // 获取群创建者的订阅类型
  const creator = await db
    .collection('orbitchat_users')
    .doc(creatorId)
    .get()

  const subscriptionType = creator?.data?.subscription_type || 'free'

  // 根据订阅类型设置上限
  let maxAllowed = 50
  if (subscriptionType === 'pro') maxAllowed = 200
  if (subscriptionType === 'enterprise') maxAllowed = 500

  // 获取当前成员数
  const { total } = await db
    .collection('orbitchat_conversation_members')
    .where({
      conversation_id: conversationId,
      join_status: 'joined'
    })
    .count()

  return {
    allowed: total < maxAllowed,
    limit: maxAllowed,
    current: total
  }
}
```

### 3.2 API 路由权限中间件

创建文件: `lib/cloudbase/middleware.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { isGroupMember, isGroupAdmin, canSendMessage } from './permissions'

// 验证群成员身份
export async function requireGroupMember(
  req: NextRequest,
  conversationId: string,
  userId: string
) {
  const isMember = await isGroupMember(conversationId, userId)

  if (!isMember) {
    return NextResponse.json(
      { error: '您不是该群的成员' },
      { status: 403 }
    )
  }

  return null
}

// 验证群管理员身份
export async function requireGroupAdmin(
  req: NextRequest,
  conversationId: string,
  userId: string
) {
  const isAdmin = await isGroupAdmin(conversationId, userId)

  if (!isAdmin) {
    return NextResponse.json(
      { error: '需要管理员权限' },
      { status: 403 }
    )
  }

  return null
}

// 验证发送消息权限
export async function requireSendPermission(
  req: NextRequest,
  conversationId: string,
  userId: string
) {
  const canSend = await canSendMessage(conversationId, userId)

  if (!canSend) {
    return NextResponse.json(
      { error: '您没有发言权限' },
      { status: 403 }
    )
  }

  return null
}
```

---

## 四、云函数实现触发器逻辑

### 4.1 自动更新成员数量

创建云函数: `cloudbase/functions/updateMemberCount/index.js`

```javascript
const cloud = require('@cloudbase/node-sdk')
const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = app.database()

exports.main = async (event) => {
  const { conversationId, operation } = event

  // 获取当前成员数
  const { total } = await db
    .collection('orbitchat_conversation_members')
    .where({
      conversation_id: conversationId,
      join_status: 'joined'
    })
    .count()

  // 更新会话的成员数量
  await db
    .collection('orbitchat_conversations')
    .doc(conversationId)
    .update({
      member_count: total,
      updated_at: new Date().toISOString()
    })

  return { success: true, memberCount: total }
}
```

### 4.2 自动更新最后消息时间

创建云函数: `cloudbase/functions/updateLastMessage/index.js`

```javascript
const cloud = require('@cloudbase/node-sdk')
const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = app.database()

exports.main = async (event) => {
  const { conversationId, messageContent, createdAt } = event

  // 更新会话的最后消息时间和预览
  await db
    .collection('orbitchat_conversations')
    .doc(conversationId)
    .update({
      last_message_at: createdAt,
      last_message_preview: messageContent.substring(0, 50),
      updated_at: new Date().toISOString()
    })

  return { success: true }
}
```

### 4.3 自动处理加群申请

创建云函数: `cloudbase/functions/handleJoinRequest/index.js`

```javascript
const cloud = require('@cloudbase/node-sdk')
const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = app.database()

exports.main = async (event) => {
  const { requestId, status, reviewedBy } = event

  // 更新申请状态
  const request = await db
    .collection('orbitchat_group_join_requests')
    .doc(requestId)
    .get()

  if (!request.data) {
    return { success: false, error: '申请不存在' }
  }

  await db
    .collection('orbitchat_group_join_requests')
    .doc(requestId)
    .update({
      status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString()
    })

  // 如果批准,添加成员
  if (status === 'approved') {
    await db
      .collection('orbitchat_conversation_members')
      .add({
        conversation_id: request.data.conversation_id,
        user_id: request.data.user_id,
        role: 'member',
        invited_by: reviewedBy,
        join_status: 'joined',
        is_muted: false,
        can_send_messages: true,
        notification_setting: 'all',
        joined_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

    // 触发更新成员数量
    await cloud.callFunction({
      name: 'updateMemberCount',
      data: {
        conversationId: request.data.conversation_id,
        operation: 'add'
      }
    })
  }

  return { success: true }
}
```

---

## 五、实时订阅方案

### 5.1 CloudBase Watch API

CloudBase 提供 Watch API 用于实时监听数据变化。

### 5.2 客户端订阅实现

创建文件: `lib/cloudbase/realtime.ts`

```typescript
import { db } from './client'

// 订阅群消息
export function subscribeToMessages(
  conversationId: string,
  onMessage: (message: any) => void
) {
  const watcher = db
    .collection('orbitchat_messages')
    .where({
      conversation_id: conversationId
    })
    .watch({
      onChange: (snapshot) => {
        snapshot.docChanges.forEach((change) => {
          if (change.queueType === 'init') return

          if (change.dataType === 'add') {
            onMessage(change.doc)
          }
        })
      },
      onError: (err) => {
        console.error('消息订阅错误:', err)
      }
    })

  return () => watcher.close()
}

// 订阅群成员变化
export function subscribeToMembers(
  conversationId: string,
  onMemberChange: (change: any) => void
) {
  const watcher = db
    .collection('orbitchat_conversation_members')
    .where({
      conversation_id: conversationId
    })
    .watch({
      onChange: (snapshot) => {
        snapshot.docChanges.forEach((change) => {
          if (change.queueType === 'init') return
          onMemberChange(change)
        })
      },
      onError: (err) => {
        console.error('成员订阅错误:', err)
      }
    })

  return () => watcher.close()
}

// 订阅会话列表更新
export function subscribeToConversations(
  userId: string,
  onConversationUpdate: (conversation: any) => void
) {
  // 先获取用户加入的所有会话ID
  db.collection('orbitchat_conversation_members')
    .where({
      user_id: userId,
      join_status: 'joined'
    })
    .get()
    .then(({ data }) => {
      const conversationIds = data.map(m => m.conversation_id)

      // 订阅这些会话的更新
      const watcher = db
        .collection('orbitchat_conversations')
        .where({
          _id: db.command.in(conversationIds)
        })
        .watch({
          onChange: (snapshot) => {
            snapshot.docChanges.forEach((change) => {
              if (change.queueType === 'init') return
              onConversationUpdate(change.doc)
            })
          },
          onError: (err) => {
            console.error('会话订阅错误:', err)
          }
        })

      return () => watcher.close()
    })
}
```

---

## 六、安全规则配置

CloudBase 支持配置安全规则来限制数据访问。

### 6.1 安全规则示例

在 CloudBase 控制台配置安全规则:

```json
{
  "read": "auth.uid != null && doc.user_id == auth.uid",
  "write": "auth.uid != null && doc.user_id == auth.uid"
}
```

**注意**: CloudBase 的安全规则功能有限,主要权限控制仍需在应用层实现。

---

## 七、数据迁移与同步

### 7.1 初始化集合

创建脚本: `scripts/cloudbase/init_collections.js`

```javascript
const cloud = require('@cloudbase/node-sdk')
const app = cloud.init({ env: 'your-env-id' })
const db = app.database()

async function initCollections() {
  // 创建集合
  const collections = [
    'orbitchat_users',
    'orbitchat_conversations',
    'orbitchat_conversation_members',
    'orbitchat_messages',
    'orbitchat_group_join_requests'
  ]

  for (const collectionName of collections) {
    try {
      await db.createCollection(collectionName)
      console.log(`集合 ${collectionName} 创建成功`)
    } catch (err) {
      console.log(`集合 ${collectionName} 已存在`)
    }
  }

  // 创建索引
  await createIndexes()
}

async function createIndexes() {
  // users 集合索引
  await db.collection('orbitchat_users').createIndex({
    keys: [{ name: 'email', direction: '1' }],
    unique: true
  })

  // conversations 集合索引
  await db.collection('orbitchat_conversations').createIndex({
    keys: [
      { name: 'workspace_id', direction: '1' },
      { name: 'last_message_at', direction: '-1' }
    ]
  })

  // conversation_members 集合索引
  await db.collection('orbitchat_conversation_members').createIndex({
    keys: [
      { name: 'conversation_id', direction: '1' },
      { name: 'user_id', direction: '1' }
    ],
    unique: true
  })

  // messages 集合索引
  await db.collection('orbitchat_messages').createIndex({
    keys: [
      { name: 'conversation_id', direction: '1' },
      { name: 'created_at', direction: '-1' }
    ]
  })

  console.log('索引创建完成')
}

initCollections()
```

---

## 八、总结与对比

### 8.1 Supabase vs CloudBase 功能对比

| 功能 | Supabase 实现 | CloudBase 实现 |
|------|--------------|---------------|
| 权限控制 | RLS 策略(数据库层) | 应用层函数 + 中间件 |
| 触发器 | PostgreSQL 触发器 | 云函数 |
| 实时订阅 | Realtime API | Watch API |
| 成员数量限制 | 触发器自动检查 | 应用层手动检查 |
| 数据一致性 | ACID 事务 | 应用层保证 |

### 8.2 实施步骤

1. **创建集合** - 运行初始化脚本创建所有集合
2. **配置索引** - 为所有集合创建必要的索引
3. **部署云函数** - 上传触发器逻辑的云函数
4. **实现权限控制** - 在 API 路由中添加权限检查
5. **测试功能** - 验证所有群聊功能正常工作
6. **性能优化** - 监控查询性能,优化索引

### 8.3 注意事项

⚠️ **重要提醒**:
- CloudBase 没有外键约束,需在应用层保证数据一致性
- 所有权限检查必须在 API 路由中实现,不能依赖数据库
- Watch API 有连接数限制,需合理控制订阅数量
- 云函数调用有配额限制,需注意成本控制
- 定期备份数据,CloudBase 不支持自动备份

---

**文档版本**: v1.0
**最后更新**: 2026-02-07
**状态**: 待审核
