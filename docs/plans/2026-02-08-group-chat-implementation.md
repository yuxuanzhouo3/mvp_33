# 群聊功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 实现 OrbitChat 群聊功能的完整应用层，包括创建群聊、成员管理、群设置和实时通讯

**架构:** 基于 Supabase 数据库设计，采用三层架构（数据库交互层 → API 路由层 → 前端组件层），使用 Supabase Realtime 实现全局订阅的实时消息推送

**技术栈:** Next.js 16, React 19, TypeScript, Supabase, shadcn/ui, Tailwind CSS

---

## 阶段 1: 数据库交互层

### 任务 1: 创建群聊数据库操作模块

**文件:**
- Create: `lib/database/supabase/groups.ts`

**步骤 1: 创建群聊 CRUD 函数**

```typescript
import { createClient } from '@/lib/supabase/server'
import { Conversation } from '@/lib/types'

export async function createGroup(
  creatorId: string,
  userIds: string[],
  workspaceId: string
): Promise<{ groupId: string } | null> {
  const supabase = await createClient()

  // 生成群名称（取前3个成员名称）
  const { data: users } = await supabase
    .from('users')
    .select('full_name')
    .in('id', userIds.slice(0, 3))

  const groupName = users?.map(u => u.full_name).join('、') || 'New Group'

  // 创建群聊
  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({
      workspace_id: workspaceId,
      type: 'group',
      name: groupName,
      created_by: creatorId,
      is_private: false
    })
    .select('id')
    .single()

  if (error || !conversation) return null

  // 批量插入成员
  const members = [
    { conversation_id: conversation.id, user_id: creatorId, role: 'owner', join_status: 'joined' },
    ...userIds.map(uid => ({
      conversation_id: conversation.id,
      user_id: uid,
      role: 'member',
      join_status: 'joined'
    }))
  ]

  await supabase.from('conversation_members').insert(members)

  return { groupId: conversation.id }
}

export async function getGroupInfo(groupId: string): Promise<Conversation | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', groupId)
    .eq('type', 'group')
    .single()

  if (error || !data) return null
  return data as Conversation
}

export async function updateGroupSettings(
  groupId: string,
  updates: { name?: string; settings?: any }
): Promise<boolean> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('conversations')
    .update(updates)
    .eq('id', groupId)

  return !error
}

export async function deleteGroup(groupId: string): Promise<boolean> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', groupId)

  return !error
}
```

**步骤 2: 提交**

```bash
git add lib/database/supabase/groups.ts
git commit -m "feat: 添加群聊数据库操作模块

实现群聊的创建、查询、更新和删除功能

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### 任务 2: 创建群成员管理模块

**文件:**
- Create: `lib/database/supabase/group-members.ts`

**步骤 1: 创建成员管理函数**

```typescript
import { createClient } from '@/lib/supabase/server'
import { User } from '@/lib/types'

export async function getGroupMembers(groupId: string): Promise<User[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('conversation_members')
    .select(`
      user_id,
      role,
      is_muted,
      can_send_messages,
      join_status,
      users (*)
    `)
    .eq('conversation_id', groupId)
    .eq('join_status', 'joined')

  if (error || !data) return []

  return data.map(m => ({
    ...m.users,
    role: m.role,
    is_muted: m.is_muted,
    can_send_messages: m.can_send_messages
  })) as User[]
}

export async function addGroupMembers(
  groupId: string,
  userIds: string[],
  invitedBy: string
): Promise<boolean> {
  const supabase = await createClient()

  const members = userIds.map(uid => ({
    conversation_id: groupId,
    user_id: uid,
    role: 'member',
    join_status: 'joined',
    invited_by: invitedBy
  }))

  const { error } = await supabase
    .from('conversation_members')
    .insert(members)

  return !error
}

export async function updateMemberRole(
  groupId: string,
  userId: string,
  role: 'admin' | 'member'
): Promise<boolean> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('conversation_members')
    .update({ role })
    .eq('conversation_id', groupId)
    .eq('user_id', userId)

  return !error
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
  const supabase = await createClient()

  const { error } = await supabase
    .from('conversation_members')
    .update(permissions)
    .eq('conversation_id', groupId)
    .eq('user_id', userId)

  return !error
}

export async function removeGroupMember(
  groupId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', groupId)
    .eq('user_id', userId)

  return !error
}

export async function transferOwnership(
  groupId: string,
  oldOwnerId: string,
  newOwnerId: string
): Promise<boolean> {
  const supabase = await createClient()

  // 更新原群主为管理员
  await supabase
    .from('conversation_members')
    .update({ role: 'admin' })
    .eq('conversation_id', groupId)
    .eq('user_id', oldOwnerId)

  // 更新新群主
  const { error } = await supabase
    .from('conversation_members')
    .update({ role: 'owner' })
    .eq('conversation_id', groupId)
    .eq('user_id', newOwnerId)

  return !error
}
```

**步骤 2: 提交**

```bash
git add lib/database/supabase/group-members.ts
git commit -m "feat: 添加群成员管理模块

实现成员查询、添加、权限更新、移除和群主转让功能

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 阶段 2: API 路由层

### 任务 3: 创建群聊 API

**文件:**
- Create: `app/api/groups/route.ts`

**步骤 1: 实现创建群聊 API**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createGroup } from '@/lib/database/supabase/groups'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userIds, workspaceId } = await request.json()

    if (!userIds || userIds.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 members required' },
        { status: 400 }
      )
    }

    const result = await createGroup(user.id, userIds, workspaceId)

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
git commit -m "feat: 添加创建群聊 API

实现 POST /api/groups 接口，支持创建群聊

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### 任务 4: 群信息管理 API

**文件:**
- Create: `app/api/groups/[id]/route.ts`

**步骤 1: 实现群信息 API**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGroupInfo, updateGroupSettings, deleteGroup } from '@/lib/database/supabase/groups'

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

    const group = await getGroupInfo(params.id)

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
    const success = await updateGroupSettings(params.id, updates)

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

    const success = await deleteGroup(params.id)

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
git commit -m "feat: 添加群信息管理 API

实现 GET/PUT/DELETE /api/groups/[id] 接口

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### 任务 5: 群成员管理 API

**文件:**
- Create: `app/api/groups/[id]/members/route.ts`

**步骤 1: 实现成员管理 API**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGroupMembers, addGroupMembers } from '@/lib/database/supabase/group-members'

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

    const members = await getGroupMembers(params.id)

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

    const success = await addGroupMembers(params.id, userIds, user.id)

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
git commit -m "feat: 添加群成员管理 API

实现 GET/POST /api/groups/[id]/members 接口

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 阶段 3: 前端组件

### 任务 6: 创建群聊对话框

**文件:**
- Create: `components/chat/create-group-dialog.tsx`

**步骤 1: 实现创建群聊对话框组件**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User } from '@/lib/types'
import { Search } from 'lucide-react'

interface CreateGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contacts: User[]
  workspaceId: string
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  contacts,
  workspaceId
}: CreateGroupDialogProps) {
  const router = useRouter()
  const [selectedUsers, setSelectedUsers] = useState<User[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const filteredContacts = contacts.filter(c =>
    c.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const toggleUser = (user: User) => {
    setSelectedUsers(prev =>
      prev.find(u => u.id === user.id)
        ? prev.filter(u => u.id !== user.id)
        : [...prev, user]
    )
  }

  const handleCreate = async () => {
    if (selectedUsers.length < 2) return

    setIsCreating(true)
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: selectedUsers.map(u => u.id),
          workspaceId
        })
      })

      const data = await response.json()

      if (data.success) {
        onOpenChange(false)
        router.push(`/chat?conversation=${data.groupId}`)
      }
    } catch (error) {
      console.error('Failed to create group:', error)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>创建群聊</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索联系人"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-2">
            {filteredContacts.map(contact => (
              <div
                key={contact.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent cursor-pointer"
                onClick={() => toggleUser(contact)}
              >
                <Checkbox
                  checked={selectedUsers.some(u => u.id === contact.id)}
                  onCheckedChange={() => toggleUser(contact)}
                />
                <Avatar className="h-10 w-10">
                  <AvatarImage src={contact.avatar_url} />
                  <AvatarFallback>{contact.full_name[0]}</AvatarFallback>
                </Avatar>
                <span>{contact.full_name}</span>
              </div>
            ))}
          </div>
        </ScrollArea>

        {selectedUsers.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-sm text-muted-foreground mb-2">
              已选择 {selectedUsers.length} 人
            </p>
            <div className="flex gap-2 flex-wrap">
              {selectedUsers.map(user => (
                <Avatar key={user.id} className="h-8 w-8">
                  <AvatarImage src={user.avatar_url} />
                  <AvatarFallback>{user.full_name[0]}</AvatarFallback>
                </Avatar>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleCreate}
            disabled={selectedUsers.length < 2 || isCreating}
          >
            {isCreating ? '创建中...' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**步骤 2: 提交**

```bash
git add components/chat/create-group-dialog.tsx
git commit -m "feat: 添加创建群聊对话框组件

实现联系人选择和群聊创建功能

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### 任务 7: 集成创建群聊按钮

**文件:**
- Modify: `components/chat/sidebar.tsx`

**步骤 1: 在侧边栏添加创建群聊按钮**

在 `sidebar.tsx` 中找到 `onNewConversation` 按钮，修改为打开创建群聊对话框。

**步骤 2: 提交**

```bash
git add components/chat/sidebar.tsx
git commit -m "feat: 集成创建群聊按钮到侧边栏

在侧边栏添加创建群聊功能入口

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 总结

本实施计划将群聊功能分为 3 个阶段、7 个任务：

**阶段 1: 数据库交互层** (任务 1-2)
- 群聊 CRUD 操作
- 群成员管理操作

**阶段 2: API 路由层** (任务 3-5)
- 创建群聊 API
- 群信息管理 API
- 群成员管理 API

**阶段 3: 前端组件** (任务 6-7)
- 创建群聊对话框
- 集成到侧边栏

每个任务都包含详细的代码实现和提交步骤，遵循 DRY、YAGNI 和频繁提交的原则。

---

**计划版本**: v1.0
**创建日期**: 2026-02-08
**状态**: 待执行
