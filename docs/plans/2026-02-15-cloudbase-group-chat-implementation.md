# CloudBase 群聊功能实施计划(国内版)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 基于已完成的 Supabase 国际版群聊功能,实现 CloudBase 国内版的群聊功能

**架构:** 基于 CloudBase 文档型数据库,采用三层架构(数据库交互层 → API 路由层 → 前端组件层),通过环境变量切换数据库

**技术栈:** Next.js 16, React 19, TypeScript, CloudBase, shadcn/ui, Tailwind CSS

---

## 阶段 1: 数据库交互层

### 任务 1: 创建 CloudBase 群聊数据库操作模块

**文件:**
- Create: `lib/database/cloudbase/groups.ts`

**步骤 1: 创建群聊 CRUD 函数**

```typescript
import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { Conversation } from '@/lib/types'

export async function createGroup(
  creatorId: string,
  userIds: string[],
  workspaceId: string
): Promise<{ groupId: string } | null> {
  const db = getCloudBaseDb()
  if (!db) return null

  try {
    // 生成群名称(取前3个成员名称)
    const userIdsToQuery = userIds.slice(0, 3)
    const usersRes = await db.collection('users')
      .where({
        id: db.command.in(userIdsToQuery)
      })
      .get()

    const users = usersRes.data || []
    const groupName = users.map((u: any) => u.full_name || u.name).join('、') || 'New Group'

    // 创建群聊
    const now = new Date().toISOString()
    const convRes = await db.collection('conversations').add({
      workspace_id: workspaceId,
      type: 'group',
      name: groupName,
      created_by: creatorId,
      is_private: false,
      created_at: now,
      last_message_at: now,
      region: 'cn'
    })

    const conversationId = convRes.id || convRes._id
    if (!conversationId) return null

    // 批量插入成员
    const members = [
      {
        conversation_id: conversationId,
        user_id: creatorId,
        role: 'owner',
        join_status: 'joined',
        created_at: now,
        region: 'cn'
      },
      ...userIds.map(uid => ({
        conversation_id: conversationId,
        user_id: uid,
        role: 'member',
        join_status: 'joined',
        created_at: now,
        region: 'cn'
      }))
    ]

    for (const member of members) {
      await db.collection('conversation_members').add(member)
    }

    return { groupId: conversationId }
  } catch (error) {
    console.error('[CloudBase createGroup] 错误:', error)
    return null
  }
}

export async function getGroupInfo(groupId: string): Promise<Conversation | null> {
  const db = getCloudBaseDb()
  if (!db) return null

  try {
    const res = await db.collection('conversations')
      .where({
        _id: groupId,
        type: 'group'
      })
      .get()

    if (!res.data || res.data.length === 0) return null

    const data = res.data[0]
    return {
      id: data._id,
      workspace_id: data.workspace_id,
      type: data.type,
      name: data.name,
      description: data.description,
      avatar_url: data.avatar_url,
      is_private: data.is_private,
      created_by: data.created_by,
      created_at: data.created_at,
      last_message_at: data.last_message_at
    } as Conversation
  } catch (error) {
    console.error('[CloudBase getGroupInfo] 错误:', error)
    return null
  }
}

export async function updateGroupSettings(
  groupId: string,
  updates: { name?: string; description?: string; avatar_url?: string }
): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) return false

  try {
    // 先查找文档
    const res = await db.collection('conversations')
      .where({ _id: groupId })
      .get()

    if (!res.data || res.data.length === 0) return false

    const doc = res.data[0]
    await db.collection('conversations')
      .doc(doc._id)
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })

    return true
  } catch (error) {
    console.error('[CloudBase updateGroupSettings] 错误:', error)
    return false
  }
}

export async function deleteGroup(groupId: string): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) return false

  try {
    // 先查找文档
    const res = await db.collection('conversations')
      .where({ _id: groupId })
      .get()

    if (!res.data || res.data.length === 0) return false

    const doc = res.data[0]
    await db.collection('conversations')
      .doc(doc._id)
      .remove()

    return true
  } catch (error) {
    console.error('[CloudBase deleteGroup] 错误:', error)
    return false
  }
}
```

**步骤 2: 提交**

```bash
git add lib/database/cloudbase/groups.ts
git commit -m "feat(cloudbase): 添加群聊数据库操作模块

实现 CloudBase 群聊的创建、查询、更新和删除功能

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### 任务 2: 创建 CloudBase 群成员管理模块

**文件:**
- Create: `lib/database/cloudbase/group-members.ts`

**步骤 1: 创建成员管理函数**

```typescript
import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { User } from '@/lib/types'

export async function getGroupMembers(groupId: string): Promise<User[]> {
  const db = getCloudBaseDb()
  if (!db) return []

  try {
    const membersRes = await db.collection('conversation_members')
      .where({
        conversation_id: groupId,
        join_status: 'joined'
      })
      .get()

    const members = membersRes.data || []
    if (members.length === 0) return []

    // 获取用户详情
    const userIds = members.map((m: any) => m.user_id).filter(Boolean)
    if (userIds.length === 0) return []

    const usersRes = await db.collection('users')
      .where({
        id: db.command.in(userIds)
      })
      .get()

    const users = usersRes.data || []

    // 合并成员信息和用户信息
    return members.map((m: any) => {
      const user = users.find((u: any) => u.id === m.user_id)
      return {
        id: m.user_id,
        email: user?.email || '',
        username: user?.username || '',
        full_name: user?.full_name || user?.name || '',
        avatar_url: user?.avatar_url || null,
        role: m.role,
        is_muted: m.is_muted || false,
        can_send_messages: m.can_send_messages !== false,
        status: user?.status || 'offline',
        region: 'cn'
      } as User
    })
  } catch (error) {
    console.error('[CloudBase getGroupMembers] 错误:', error)
    return []
  }
}

export async function addGroupMembers(
  groupId: string,
  userIds: string[],
  invitedBy: string
): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) return false

  try {
    const now = new Date().toISOString()

    for (const userId of userIds) {
      await db.collection('conversation_members').add({
        conversation_id: groupId,
        user_id: userId,
        role: 'member',
        join_status: 'joined',
        invited_by: invitedBy,
        created_at: now,
        region: 'cn'
      })
    }

    return true
  } catch (error) {
    console.error('[CloudBase addGroupMembers] 错误:', error)
    return false
  }
}

export async function updateMemberRole(
  groupId: string,
  userId: string,
  role: 'admin' | 'member'
): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) return false

  try {
    const res = await db.collection('conversation_members')
      .where({
        conversation_id: groupId,
        user_id: userId
      })
      .get()

    if (!res.data || res.data.length === 0) return false

    const doc = res.data[0]
    await db.collection('conversation_members')
      .doc(doc._id)
      .update({
        role,
        updated_at: new Date().toISOString()
      })

    return true
  } catch (error) {
    console.error('[CloudBase updateMemberRole] 错误:', error)
    return false
  }
}

export async function updateMemberPermissions(
  groupId: string,
  userId: string,
  permissions: {
    is_muted?: boolean
    can_send_messages?: boolean
    muted_until?: string
  }
): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) return false

  try {
    const res = await db.collection('conversation_members')
      .where({
        conversation_id: groupId,
        user_id: userId
      })
      .get()

    if (!res.data || res.data.length === 0) return false

    const doc = res.data[0]
    await db.collection('conversation_members')
      .doc(doc._id)
      .update({
        ...permissions,
        updated_at: new Date().toISOString()
      })

    return true
  } catch (error) {
    console.error('[CloudBase updateMemberPermissions] 错误:', error)
    return false
  }
}

export async function removeGroupMember(
  groupId: string,
  userId: string
): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) return false

  try {
    const res = await db.collection('conversation_members')
      .where({
        conversation_id: groupId,
        user_id: userId
      })
      .get()

    if (!res.data || res.data.length === 0) return false

    const doc = res.data[0]
    await db.collection('conversation_members')
      .doc(doc._id)
      .remove()

    return true
  } catch (error) {
    console.error('[CloudBase removeGroupMember] 错误:', error)
    return false
  }
}

export async function transferOwnership(
  groupId: string,
  oldOwnerId: string,
  newOwnerId: string
): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) return false

  try {
    // 更新原群主为管理员
    const oldOwnerRes = await db.collection('conversation_members')
      .where({
        conversation_id: groupId,
        user_id: oldOwnerId
      })
      .get()

    if (oldOwnerRes.data && oldOwnerRes.data.length > 0) {
      await db.collection('conversation_members')
        .doc(oldOwnerRes.data[0]._id)
        .update({ role: 'admin' })
    }

    // 更新新群主
    const newOwnerRes = await db.collection('conversation_members')
      .where({
        conversation_id: groupId,
        user_id: newOwnerId
      })
      .get()

    if (!newOwnerRes.data || newOwnerRes.data.length === 0) return false

    await db.collection('conversation_members')
      .doc(newOwnerRes.data[0]._id)
      .update({ role: 'owner' })

    return true
  } catch (error) {
    console.error('[CloudBase transferOwnership] 错误:', error)
    return false
  }
}
```

**步骤 2: 提交**

```bash
git add lib/database/cloudbase/group-members.ts
git commit -m "feat(cloudbase): 添加群成员管理模块

实现 CloudBase 成员查询、添加、权限更新、移除和群主转让功能

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 阶段 2: API 路由层适配

### 任务 3: 修改群聊 API 支持数据库切换

**文件:**
- Modify: `app/api/groups/route.ts`

**步骤 1: 添加数据库切换逻辑**

在 `app/api/groups/route.ts` 中,添加对 CloudBase 的支持:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createGroup as createGroupSupabase } from '@/lib/database/supabase/groups'
import { createGroup as createGroupCloudbase } from '@/lib/database/cloudbase/groups'

const isCloudBase = process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE === 'zh' && !process.env.FORCE_GLOBAL_DATABASE

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userIds, workspaceId } = await request.json()

    // 根据环境变量选择数据库
    const result = isCloudBase
      ? await createGroupCloudbase(user.id, userIds, workspaceId)
      : await createGroupSupabase(user.id, userIds, workspaceId)

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to create group' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      groupId: result.groupId
    })
  } catch (error) {
    console.error('Create group error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

**步骤 2: 提交**

```bash
git add app/api/groups/route.ts
git commit -m "feat(api): 群聊 API 支持数据库切换

添加 CloudBase 和 Supabase 数据库切换逻辑

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### 任务 4: 修改群信息管理 API

**文件:**
- Modify: `app/api/groups/[id]/route.ts`

**步骤 1: 添加数据库切换逻辑**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGroupInfo as getGroupInfoSupabase, updateGroupSettings as updateGroupSettingsSupabase, deleteGroup as deleteGroupSupabase } from '@/lib/database/supabase/groups'
import { getGroupInfo as getGroupInfoCloudbase, updateGroupSettings as updateGroupSettingsCloudbase, deleteGroup as deleteGroupCloudbase } from '@/lib/database/cloudbase/groups'

const isCloudBase = process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE === 'zh' && !process.env.FORCE_GLOBAL_DATABASE

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const group = isCloudBase
      ? await getGroupInfoCloudbase(params.id)
      : await getGroupInfoSupabase(params.id)

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, group })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const updates = await request.json()
    const success = isCloudBase
      ? await updateGroupSettingsCloudbase(params.id, updates)
      : await updateGroupSettingsSupabase(params.id, updates)

    if (!success) {
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const success = isCloudBase
      ? await deleteGroupCloudbase(params.id)
      : await deleteGroupSupabase(params.id)

    if (!success) {
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**步骤 2: 提交**

```bash
git add app/api/groups/[id]/route.ts
git commit -m "feat(api): 群信息管理 API 支持数据库切换

添加 GET/PUT/DELETE 接口的数据库切换逻辑

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### 任务 5: 修改群成员管理 API

**文件:**
- Modify: `app/api/groups/[id]/members/route.ts`

**步骤 1: 添加数据库切换逻辑**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGroupMembers as getGroupMembersSupabase, addGroupMembers as addGroupMembersSupabase } from '@/lib/database/supabase/group-members'
import { getGroupMembers as getGroupMembersCloudbase, addGroupMembers as addGroupMembersCloudbase } from '@/lib/database/cloudbase/group-members'

const isCloudBase = process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE === 'zh' && !process.env.FORCE_GLOBAL_DATABASE

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const members = isCloudBase
      ? await getGroupMembersCloudbase(params.id)
      : await getGroupMembersSupabase(params.id)

    return NextResponse.json({ success: true, members })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userIds } = await request.json()

    const success = isCloudBase
      ? await addGroupMembersCloudbase(params.id, userIds, user.id)
      : await addGroupMembersSupabase(params.id, userIds, user.id)

    if (!success) {
      return NextResponse.json({ error: 'Failed to add members' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**步骤 2: 提交**

```bash
git add app/api/groups/[id]/members/route.ts
git commit -m "feat(api): 群成员管理 API 支持数据库切换

添加 GET/POST 接口的数据库切换逻辑

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### 任务 6: 修改成员操作 API

**文件:**
- Modify: `app/api/groups/[id]/members/[memberId]/route.ts`

**步骤 1: 添加数据库切换逻辑**

需要在该文件中添加对 `updateMemberRole`, `updateMemberPermissions`, `removeGroupMember` 的 CloudBase 支持。

**步骤 2: 提交**

```bash
git add app/api/groups/[id]/members/[memberId]/route.ts
git commit -m "feat(api): 成员操作 API 支持数据库切换

添加成员角色、权限更新和移除的数据库切换逻辑

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### 任务 7: 修改群主转让 API

**文件:**
- Modify: `app/api/groups/[id]/transfer/route.ts`

**步骤 1: 添加数据库切换逻辑**

需要在该文件中添加对 `transferOwnership` 的 CloudBase 支持。

**步骤 2: 提交**

```bash
git add app/api/groups/[id]/transfer/route.ts
git commit -m "feat(api): 群主转让 API 支持数据库切换

添加群主转让的数据库切换逻辑

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 阶段 3: 测试与验证

### 任务 8: 手动测试国内版群聊功能

**测试步骤:**

1. 设置环境变量为国内版:
   - `NEXT_PUBLIC_DEFAULT_LANGUAGE=zh`
   - `FORCE_GLOBAL_DATABASE=false` 或删除该变量

2. 测试创建群聊:
   - 访问聊天页面
   - 点击创建群聊按钮
   - 选择成员并创建

3. 测试群成员管理:
   - 查看群成员列表
   - 添加新成员
   - 修改成员角色
   - 移除成员

4. 测试群设置:
   - 修改群名称
   - 修改群描述
   - 上传群头像

5. 测试群主转让:
   - 转让群主给其他成员

---

## 总结

本实施计划将国际版的群聊功能适配到国内版 CloudBase,分为 3 个阶段、8 个任务:

**阶段 1: 数据库交互层** (任务 1-2)
- CloudBase 群聊 CRUD 操作
- CloudBase 群成员管理操作

**阶段 2: API 路由层适配** (任务 3-7)
- 修改所有群聊相关 API 支持数据库切换
- 通过环境变量自动选择 Supabase 或 CloudBase

**阶段 3: 测试与验证** (任务 8)
- 手动测试国内版群聊功能

每个任务都包含详细的代码实现和提交步骤,遵循 DRY、YAGNI 和频繁提交的原则。

---

**计划版本**: v1.0
**创建日期**: 2026-02-15
**状态**: 待执行
