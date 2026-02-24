# Workspace Members Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Workspace Members" section in sidebar below contacts to allow same-workspace members to chat directly without adding as friends.

**Architecture:**
- Create new API endpoint to fetch workspace members
- Add workspace members panel in sidebar below contacts
- Modify conversation creation logic to skip friend check for same workspace members
- Use CloudBase for domestic (CN) version, Supabase for international (user handles manually)

**Tech Stack:** Next.js, TypeScript, CloudBase (CN), Supabase (INTL - manual)

---

## Task 1: Add i18n translations for workspace members

**Files:**
- Modify: `lib/i18n.ts`

**Step 1: Add translations**

Add the following keys to both `en` and `zh` sections:

```typescript
// In en section:
workspaceMembers: 'Workspace Members',
noWorkspaceMembers: 'No other members in this workspace',
startChat: 'Start Chat',

// In zh section:
workspaceMembers: '工作区成员',
noWorkspaceMembers: '此工作区暂无其他成员',
startChat: '发起聊天',
```

**Step 2: Save file**

Run: Check file is saved correctly

---

## Task 2: Create workspace members API endpoint (CloudBase for CN)

**Files:**
- Create: `app/api/workspace-members/route.ts`

**Step 1: Write the API endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { IS_DOMESTIC_VERSION } from '@/config'

/**
 * Get workspace members for current user
 * GET /api/workspace-members?workspaceId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const workspaceId = searchParams.get('workspaceId')

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    console.log('[API /api/workspace-members] Database:', {
      type: dbClient.type,
      region: userRegion,
      workspaceId
    })

    // CN version: use CloudBase
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      // Get current user from headers (CloudBase auth)
      const userId = request.headers.get('x-user-id')
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Import CloudBase services
      const { getUserService, getChatService } = await import('@/lib/services')
      const chatService = getChatService()

      // Get user's workspaces
      const workspaces = await chatService.getUserWorkspaces(userId)

      // If no workspaceId provided, use first workspace
      const targetWorkspaceId = workspaceId || (workspaces.length > 0 ? workspaces[0] : null)

      if (!targetWorkspaceId) {
        return NextResponse.json({
          success: true,
          members: []
        })
      }

      // Get workspace members
      const members = await chatService.getWorkspaceMembers(targetWorkspaceId)

      // Filter out current user
      const otherMembers = members.filter((m: any) => m.id !== userId)

      return NextResponse.json({
        success: true,
        members: otherMembers,
        workspaceId: targetWorkspaceId
      })
    }

    // INTL version: use Supabase (user will handle manually)
    // For now, return empty or implement similar logic
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workspace members from Supabase
    let query = supabase
      .from('workspace_members')
      .select(`
        user_id,
        role,
        workspaces!workspace_members_workspace_id_fkey (
          id,
          name,
          domain
        ),
        users!workspace_members_user_id_fkey (
          id,
          email,
          full_name,
          username,
          avatar_url,
          title,
          status,
          status_message
        )
      `)
      .eq('user_id', '!=' + user.id) // Exclude current user

    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId)
    }

    const { data: members, error } = await query

    if (error) {
      console.error('Error fetching workspace members:', error)
      return NextResponse.json(
        { error: 'Failed to fetch workspace members' },
        { status: 500 }
      )
    }

    // Transform data
    const transformedMembers = (members || []).map((m: any) => ({
      ...m.users,
      role: m.role,
      workspace: m.workspaces
    })).filter(Boolean)

    return NextResponse.json({
      success: true,
      members: transformedMembers,
      workspaceId: workspaceId || (members?.[0]?.workspaces?.id)
    })
  } catch (error: any) {
    console.error('Get workspace members error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get workspace members' },
      { status: 500 }
    )
  }
}
```

**Step 2: Save file**

Run: Verify file created at `D:\newcode\orbitchat\mvp33\mvp33\app\api\workspace-members\route.ts`

---

## Task 3: Add getWorkspaceMembers to CloudBase ChatService

**Files:**
- Modify: `lib/services/cloudbase/CloudBaseChatService.ts`

**Step 1: Add getWorkspaceMembers method**

Add this method to the CloudBaseChatService class:

```typescript
async getWorkspaceMembers(workspaceId: string): Promise<any[]> {
  const db = getCloudBaseDb()
  if (!db) {
    console.warn('[CloudBaseChatService] getWorkspaceMembers: DB not configured')
    return []
  }

  try {
    // Get workspace members
    const membersRes = await db.collection('workspace_members')
      .where({ workspace_id: workspaceId, region: 'cn' })
      .get()

    const memberDocs = membersRes.data || []
    if (memberDocs.length === 0) {
      return []
    }

    // Get user IDs
    const userIds = memberDocs.map((m: any) => m.user_id).filter(Boolean)

    if (userIds.length === 0) {
      return []
    }

    // Get user details
    const usersRes = await db.collection('users')
      .where({
        _id: db.command.in(userIds),
        region: 'cn'
      })
      .get()

    const userDocs = usersRes.data || []

    // Map members with user details
    const membersWithDetails = memberDocs.map((member: any) => {
      const user = userDocs.find((u: any) => u._id === member.user_id)
      return {
        id: member.user_id,
        email: user?.email || '',
        full_name: user?.full_name || user?.username || 'Unknown',
        username: user?.username || '',
        avatar_url: user?.avatar_url || null,
        title: user?.title || '',
        status: user?.status || 'offline',
        status_message: user?.status_message || null,
        role: member.role || 'member'
      }
    })

    return membersWithDetails
  } catch (error) {
    console.error('[CloudBaseChatService] getWorkspaceMembers error:', error)
    return []
  }
}
```

**Step 2: Save file**

Run: Verify method added to CloudBaseChatService

---

## Task 4: Add workspace-members-panel component

**Files:**
- Create: `components/chat/workspace-members-panel.tsx`

**Step 1: Write the component**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { User } from '@/lib/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Users, MessageSquare, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'

interface WorkspaceMembersPanelProps {
  currentUser: User
  workspaceId?: string
  onStartChat: (userId: string) => void
}

export function WorkspaceMembersPanel({
  currentUser,
  workspaceId,
  onStartChat
}: WorkspaceMembersPanelProps) {
  const [members, setMembers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  useEffect(() => {
    loadWorkspaceMembers()
  }, [workspaceId])

  const loadWorkspaceMembers = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (workspaceId) {
        params.set('workspaceId', workspaceId)
      }

      const response = await fetch(`/api/workspace-members?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setMembers(data.members || [])
      }
    } catch (error) {
      console.error('Failed to load workspace members:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredMembers = members.filter(member => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      member.full_name?.toLowerCase().includes(query) ||
      member.username?.toLowerCase().includes(query) ||
      member.title?.toLowerCase().includes(query)
    )
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'away': return 'bg-yellow-500'
      case 'busy': return 'bg-red-500'
      default: return 'bg-gray-400'
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (members.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        {t('noWorkspaceMembers')}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('searchContacts')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Members list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredMembers.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {t('noWorkspaceMembers')}
            </div>
          ) : (
            filteredMembers.map((member) => (
              <button
                key={member.id}
                onClick={() => onStartChat(member.id)}
                className={cn(
                  'w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent'
                )}
              >
                <div className="relative">
                  <Avatar className="h-10 w-10" userId={member.id} showOnlineStatus={true}>
                    <AvatarImage src={member.avatar_url || undefined} />
                    <AvatarFallback name={member.full_name}>
                      {member.full_name?.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{member.full_name}</div>
                  <p className="text-sm text-muted-foreground truncate">
                    {member.title}
                  </p>
                </div>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
```

**Step 2: Save file**

Run: Verify file created at `D:\newcode\orbitchat\mvp33\mvp33\components\chat\workspace-members-panel.tsx`

---

## Task 5: Integrate workspace members panel into sidebar

**Files:**
- Modify: `components/chat/sidebar.tsx`

**Step 1: Import the component**

Add import at top of file:
```typescript
import { WorkspaceMembersPanel } from './workspace-members-panel'
```

**Step 2: Add props to Sidebar interface**

Add to SidebarProps:
```typescript
workspaceMembers?: User[]
onWorkspaceMemberClick?: (userId: string) => void
```

**Step 3: Add state for workspace members panel visibility**

In the Sidebar component, add:
```typescript
const [showWorkspaceMembers, setShowWorkspaceMembers] = useState(false)
const [workspaceMembers, setWorkspaceMembers] = useState<User[]>([])
const [isLoadingWorkspaceMembers, setIsLoadingWorkspaceMembers] = useState(false)
```

**Step 4: Add loadWorkspaceMembers function**

Add this function inside Sidebar component:
```typescript
const loadWorkspaceMembers = async () => {
  if (!workspaceId) return

  try {
    setIsLoadingWorkspaceMembers(true)
    const response = await fetch(`/api/workspace-members?workspaceId=${workspaceId}`)
    const data = await response.json()

    if (data.success) {
      setWorkspaceMembers(data.members || [])
    }
  } catch (error) {
    console.error('Failed to load workspace members:', error)
  } finally {
    setIsLoadingWorkspaceMembers(false)
  }
}

// Load on mount and when workspaceId changes
useEffect(() => {
  if (workspaceId) {
    loadWorkspaceMembers()
  }
}, [workspaceId])
```

**Step 5: Add workspace members section below contacts**

Find where the contacts section ends and add the workspace members tab. In the TabsList, add:
```typescript
<TabsTrigger value="workspace-members" className="flex-1">
  <Users className="h-4 w-4 mr-2" />
  {t('workspaceMembers')}
</TabsTrigger>
```

**Step 6: Add TabsContent for workspace members**

Add after the favorites TabsContent:
```typescript
<TabsContent value="workspace-members" className="m-0">
  {isLoadingWorkspaceMembers ? (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ) : workspaceMembers.length === 0 ? (
    <div className="p-8 text-center text-muted-foreground">
      <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
      <p>{t('noWorkspaceMembers')}</p>
    </div>
  ) : (
    <div className="p-2">
      {workspaceMembers.map((member) => (
        <button
          key={member.id}
          onClick={() => onSelectConversation(member.id)}
          className={cn(
            'w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent'
          )}
        >
          <Avatar className="h-10 w-10" userId={member.id} showOnlineStatus={true}>
            <AvatarImage src={member.avatar_url || undefined} />
            <AvatarFallback name={member.full_name}>
              {member.full_name?.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{member.full_name}</div>
            <p className="text-sm text-muted-foreground truncate">
              {member.title}
            </p>
          </div>
        </button>
      ))}
    </div>
  )}
</TabsContent>
```

**Step 7: Save file**

Run: Verify all changes saved to sidebar.tsx

---

## Task 6: Modify conversation creation to skip friend check for same workspace

**Files:**
- Modify: `app/api/conversations/route.ts`

**Step 1: Add workspace check before friend check**

In the POST function, find the section where `skip_contact_check` is checked. Add logic to automatically skip contact check if both users are in the same workspace:

Around line 500-550, modify the code to:

```typescript
// Check if both users are in the same workspace (skip friend check)
let skipContactCheckForWorkspace = false

if (type === 'direct' && member_ids.length === 1) {
  const otherUserId = member_ids[0]
  const { getChatService } = await import('@/lib/services')
  const chatService = getChatService()

  // Get user's workspaces
  const senderWorkspaces = await chatService.getUserWorkspaces(currentUser.id)
  const targetWorkspaces = await chatService.getUserWorkspaces(otherUserId)

  // Check if there's a common workspace
  const commonWorkspaces = senderWorkspaces.filter((ws: string) => targetWorkspaces.includes(ws))

  if (commonWorkspaces.length > 0) {
    console.log('[API] Same workspace detected, skipping contact check')
    skipContactCheckForWorkspace = true
  }
}

// Use the workspace check result
if (!skip_contact_check && !skipContactCheckForWorkspace) {
  // Existing friend/privacy check logic
  // ...
}
```

**Step 2: Save file**

Run: Verify changes saved

---

## Task 7: Test the implementation

**Step 1: Start development server**

Run: `cd D:\newcode\orbitchat\mvp33\mvp33 && npm run dev`

**Step 2: Test workspace members panel**

1. Open the chat page
2. Check if "Workspace Members" tab appears below contacts
3. Verify members list loads correctly
4. Click on a member to start a conversation

**Step 3: Verify no-friend chat works**

1. Log in with two users in the same workspace
2. Try to start a conversation without being friends
3. Verify conversation is created successfully

---

## Task 8: Commit changes

**Step 1: Stage changes**

```bash
git add -A
```

**Step 2: Create commit**

```bash
git commit -m "feat: add workspace members panel for direct messaging

- Add workspace members API endpoint
- Add workspace-members-panel component
- Integrate workspace members in sidebar below contacts
- Skip friend check for same workspace members
- Add i18n translations

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
