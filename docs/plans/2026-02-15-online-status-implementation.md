# 用户在线状态功能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 实现用户在线状态功能，在所有显示用户头像的地方显示在线/离线状态指示器

**架构:** 国际版使用 Supabase Realtime Presence API 实时追踪在线状态，国内版使用心跳机制（每 60 秒更新 last_seen_at）。通过 Hook 封装逻辑，在 Avatar 组件中统一显示状态指示器。

**技术栈:** React, TypeScript, Supabase Realtime Presence, CloudBase, Next.js

---

## Task 1: 实现 use-online-status Hook（国际版 Supabase Presence）

**文件:**
- 创建: `hooks/use-online-status.ts`

**步骤 1: 创建基础 Hook 文件**

创建 `hooks/use-online-status.ts` 文件，实现基础结构：

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useOnlineStatus(userId?: string) {
  const [isOnline, setIsOnline] = useState(false)

  useEffect(() => {
    if (!userId) {
      setIsOnline(false)
      return
    }

    // TODO: 实现 Supabase Presence 订阅

  }, [userId])

  return isOnline
}
```

**步骤 2: 实现 Supabase Presence 订阅逻辑**

在 `hooks/use-online-status.ts` 中添加 Presence 订阅：

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useOnlineStatus(userId?: string) {
  const [isOnline, setIsOnline] = useState(false)

  useEffect(() => {
    if (!userId) {
      setIsOnline(false)
      return
    }

    // 检查是否使用 Supabase（国际版）
    const isGlobal = process.env.NEXT_PUBLIC_FORCE_GLOBAL_DATABASE !== 'false'

    if (!isGlobal) {
      // 国内版逻辑将在 Task 3 实现
      return
    }

    let supabase: any
    try {
      supabase = createClient()
    } catch (error) {
      console.error('Failed to create Supabase client:', error)
      return
    }

    const channel = supabase
      .channel('online-users')
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        // 检查用户是否在线
        const userPresent = Object.values(state).some((presences: any) =>
          presences.some((presence: any) => presence.user_id === userId)
        )
        setIsOnline(userPresent)
      })
      .subscribe()

    return () => {
      if (supabase) {
        supabase.removeChannel(channel)
      }
    }
  }, [userId])

  return isOnline
}
```

**步骤 3: 提交代码**

```bash
git add hooks/use-online-status.ts
git commit -m "$(cat <<'EOF'
feat: 添加 use-online-status Hook（国际版 Supabase Presence）

实现基于 Supabase Realtime Presence 的在线状态检测 Hook

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 修改 Avatar 组件集成在线状态

**文件:**
- 修改: `components/ui/avatar.tsx`

**步骤 1: 添加在线状态 Props**

在 `components/ui/avatar.tsx` 中修改 `Avatar` 组件，添加新的 props：

```typescript
'use client'

import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'

import { cn } from '@/lib/utils'
import { getAvatarColor, getInitials } from '@/lib/avatar-utils'
import { useOnlineStatus } from '@/hooks/use-online-status'

interface AvatarProps extends React.ComponentProps<typeof AvatarPrimitive.Root> {
  userId?: string
  showOnlineStatus?: boolean
}

function Avatar({
  className,
  userId,
  showOnlineStatus = false,
  ...props
}: AvatarProps) {
  const isOnline = useOnlineStatus(showOnlineStatus ? userId : undefined)

  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        'relative flex size-8 shrink-0 overflow-hidden rounded-full',
        className,
      )}
      {...props}
    >
      {props.children}
      {showOnlineStatus && userId && (
        <span
          className={cn(
            'absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white',
            isOnline ? 'bg-green-500' : 'bg-gray-400'
          )}
        />
      )}
    </AvatarPrimitive.Root>
  )
}

// ... 保持其他组件不变
```

**步骤 2: 更新 Avatar 组件导出**

确保 `Avatar` 组件的其他部分保持不变，只修改 `Avatar` 函数本身。

**步骤 3: 测试 Avatar 组件**

运行开发服务器测试：

```bash
npm run dev
```

预期：应用正常启动，Avatar 组件可以接收 `userId` 和 `showOnlineStatus` props

**步骤 4: 提交代码**

```bash
git add components/ui/avatar.tsx
git commit -m "$(cat <<'EOF'
feat: Avatar 组件集成在线状态指示器

- 添加 userId 和 showOnlineStatus props
- 在头像右下角显示绿色（在线）或灰色（离线）圆点
- 使用 useOnlineStatus Hook 获取在线状态

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 实现 use-heartbeat Hook（国内版心跳机制）

**文件:**
- 创建: `hooks/use-heartbeat.ts`
- 修改: `hooks/use-online-status.ts`

**步骤 1: 创建 use-heartbeat Hook**

创建 `hooks/use-heartbeat.ts` 文件：

```typescript
'use client'

import { useEffect } from 'react'

export function useHeartbeat(userId?: string) {
  useEffect(() => {
    if (!userId) return

    // 检查是否使用 CloudBase（国内版）
    const isGlobal = process.env.NEXT_PUBLIC_FORCE_GLOBAL_DATABASE !== 'false'
    if (isGlobal) return

    // 立即更新一次
    updateLastSeen(userId)

    // 每 60 秒更新一次
    const interval = setInterval(() => {
      updateLastSeen(userId)
    }, 60000)

    return () => clearInterval(interval)
  }, [userId])
}

async function updateLastSeen(userId: string) {
  try {
    await fetch('/api/users/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
  } catch (error) {
    console.error('Failed to update heartbeat:', error)
  }
}
```

**步骤 2: 创建心跳 API 路由**

创建 `app/api/users/heartbeat/route.ts` 文件：

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', userId)

    if (error) {
      console.error('Failed to update last_seen_at:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Heartbeat API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

**步骤 3: 更新 use-online-status Hook 支持国内版**

修改 `hooks/use-online-status.ts`，添加国内版逻辑：

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useOnlineStatus(userId?: string) {
  const [isOnline, setIsOnline] = useState(false)

  useEffect(() => {
    if (!userId) {
      setIsOnline(false)
      return
    }

    const isGlobal = process.env.NEXT_PUBLIC_FORCE_GLOBAL_DATABASE !== 'false'

    if (isGlobal) {
      // 国际版：Supabase Presence
      let supabase: any
      try {
        supabase = createClient()
      } catch (error) {
        console.error('Failed to create Supabase client:', error)
        return
      }

      const channel = supabase
        .channel('online-users')
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState()
          const userPresent = Object.values(state).some((presences: any) =>
            presences.some((presence: any) => presence.user_id === userId)
          )
          setIsOnline(userPresent)
        })
        .subscribe()

      return () => {
        if (supabase) {
          supabase.removeChannel(channel)
        }
      }
    } else {
      // 国内版：检查 last_seen_at
      const checkOnlineStatus = async () => {
        try {
          const supabase = await createClient()
          const { data, error } = await supabase
            .from('users')
            .select('last_seen_at')
            .eq('id', userId)
            .single()

          if (!error && data) {
            const lastSeen = new Date(data.last_seen_at).getTime()
            const now = Date.now()
            const isUserOnline = now - lastSeen < 120000 // 2 分钟内
            setIsOnline(isUserOnline)
          }
        } catch (error) {
          console.error('Failed to check online status:', error)
        }
      }

      // 立即检查一次
      checkOnlineStatus()

      // 每 30 秒检查一次
      const interval = setInterval(checkOnlineStatus, 30000)

      return () => clearInterval(interval)
    }
  }, [userId])

  return isOnline
}
```

**步骤 4: 提交代码**

```bash
git add hooks/use-heartbeat.ts hooks/use-online-status.ts app/api/users/heartbeat/route.ts
git commit -m "$(cat <<'EOF'
feat: 添加国内版心跳机制和在线状态检测

- 创建 use-heartbeat Hook 每 60 秒更新 last_seen_at
- 创建心跳 API 路由处理更新请求
- 更新 use-online-status Hook 支持国内版（检查 last_seen_at）

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 在主布局中初始化 Presence/心跳

**文件:**
- 修改: `app/chat/chat-content.tsx`

**步骤 1: 在 chat-content.tsx 中初始化 Presence**

在 `app/chat/chat-content.tsx` 中添加 Presence 初始化逻辑（在现有的 useEffect 中添加）：

找到文件中的用户状态订阅部分（约 7493 行），在该 useEffect 之后添加新的 useEffect：

```typescript
// 初始化 Presence（国际版）或心跳（国内版）
useEffect(() => {
  if (!currentUser) return

  const isGlobal = process.env.NEXT_PUBLIC_FORCE_GLOBAL_DATABASE !== 'false'

  if (isGlobal) {
    // 国际版：订阅 Presence channel 并 track 自己
    let supabase: any
    try {
      supabase = createClient()
    } catch (error) {
      console.error('Failed to create Supabase client for Presence:', error)
      return
    }

    const channel = supabase
      .channel('online-users')
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: currentUser.id,
            online_at: new Date().toISOString(),
          })
          console.log('✅ Tracking presence for user:', currentUser.id)
        }
      })

    return () => {
      if (supabase) {
        supabase.removeChannel(channel)
      }
    }
  }
  // 国内版的心跳将通过 use-heartbeat Hook 在需要的地方调用
}, [currentUser])
```

**步骤 2: 导入必要的依赖**

确保在文件顶部导入了 `createClient`（如果还没有的话）。

**步骤 3: 在 chat-content.tsx 中使用 useHeartbeat**

在 `ChatPageContent` 组件中添加 `useHeartbeat` Hook：

```typescript
import { useHeartbeat } from '@/hooks/use-heartbeat'

function ChatPageContent() {
  // ... 现有代码 ...

  // 启动心跳（仅国内版）
  useHeartbeat(currentUser?.id)

  // ... 其余代码 ...
}
```

**步骤 4: 测试功能**

运行开发服务器：

```bash
npm run dev
```

预期：
- 国际版：用户登录后自动 track presence
- 国内版：用户登录后每 60 秒更新 last_seen_at

**步骤 5: 提交代码**

```bash
git add app/chat/chat-content.tsx
git commit -m "$(cat <<'EOF'
feat: 在聊天页面初始化 Presence 和心跳机制

- 国际版：订阅 Presence channel 并 track 用户在线状态
- 国内版：启动心跳定时器定期更新 last_seen_at

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 在聊天列表和联系人列表中显示在线状态

**文件:**
- 修改: 所有使用 Avatar 组件的地方

**步骤 1: 查找所有使用 Avatar 的地方**

运行搜索命令：

```bash
grep -r "Avatar" --include="*.tsx" --include="*.ts" components/ app/
```

**步骤 2: 更新聊天列表中的 Avatar**

在聊天列表组件中，为 Avatar 添加 `userId` 和 `showOnlineStatus` props。

示例（需要根据实际文件调整）：

```typescript
<Avatar userId={member.id} showOnlineStatus={true}>
  <AvatarImage src={member.avatar_url} />
  <AvatarFallback name={member.full_name} />
</Avatar>
```

**步骤 3: 更新联系人列表中的 Avatar**

在联系人列表组件中，同样添加 props。

**步骤 4: 更新聊天窗口顶部的 Avatar**

在聊天窗口头部组件中，添加 props。

**步骤 5: 测试所有显示位置**

运行开发服务器并测试：

```bash
npm run dev
```

预期：
- 聊天列表中显示在线状态
- 联系人列表中显示在线状态
- 聊天窗口顶部显示在线状态

**步骤 6: 提交代码**

```bash
git add .
git commit -m "$(cat <<'EOF'
feat: 在所有 Avatar 组件中显示在线状态

- 聊天列表中的头像显示在线状态
- 联系人列表中的头像显示在线状态
- 聊天窗口顶部的头像显示在线状态

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 测试和优化

**步骤 1: 功能测试**

测试以下场景：
1. 用户登录后显示为在线
2. 打开多个浏览器标签，验证在线状态同步
3. 关闭浏览器标签，验证离线状态更新
4. 国际版和国内版分别测试

**步骤 2: 性能优化（如需要）**

检查：
- Presence 订阅是否正确清理
- 心跳定时器是否正确清理
- 是否有内存泄漏

**步骤 3: 边界情况测试**

测试：
- 网络断开后的行为
- 快速切换在线/离线状态
- 长时间无操作后的状态

**步骤 4: 文档更新**

更新设计文档的状态为"已实现"。

**步骤 5: 最终提交**

```bash
git add docs/plans/2026-02-15-online-status-design.md
git commit -m "$(cat <<'EOF'
docs: 更新在线状态功能设计文档状态

标记功能为已实现

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## 实现注意事项

1. **最简原则**: 只实现必要的功能，不添加额外的复杂性
2. **错误处理**: 确保所有网络请求都有适当的错误处理
3. **性能**: 使用 React Hook 缓存状态，避免不必要的重新渲染
4. **清理**: 确保所有订阅和定时器在组件卸载时正确清理
5. **类型安全**: 使用 TypeScript 确保类型安全

## 后续优化（可选）

- 添加"正在输入"状态
- 添加"离开"状态（一段时间无操作）
- 优化心跳频率（根据用户活跃度动态调整）
- 添加单元测试
