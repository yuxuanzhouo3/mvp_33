'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { mockAuth } from '@/lib/mock-auth'
import { WorkspaceHeader } from '@/components/chat/workspace-header'
import { AppNavigation } from '@/components/layout/app-navigation'
import { WorkspaceMembersPanel } from '@/components/chat/workspace-members-panel'
import { User, Workspace } from '@/lib/types'
import { useIsMobile } from '@/hooks/use-mobile'
import { Loader2 } from 'lucide-react'

function WorkspaceMembersPageContent() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<User | null>(() => mockAuth.getCurrentUser())
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(() => mockAuth.getCurrentWorkspace())
  const [isLoading, setIsLoading] = useState(() => !(mockAuth.getCurrentUser() && mockAuth.getCurrentWorkspace()))
  const [totalUnreadCount, setTotalUnreadCount] = useState(0)
  const isMobile = useIsMobile()

  // Load current user and workspace
  useEffect(() => {
    const user = mockAuth.getCurrentUser()
    const workspace = mockAuth.getCurrentWorkspace()

    if (!user || !workspace) {
      router.push('/login')
      return
    }

    setCurrentUser(user)
    setCurrentWorkspace(workspace)
    setIsLoading(false)
  }, [router])

  // Start a chat with a workspace member
  // 采用与联系人页面相同的异步跳转策略：先查缓存，找不到就直接跳转让聊天页创建会话
  const buildChatUrl = useCallback((params: {
    conversationId?: string
    userId?: string
    callType?: 'voice' | 'video'
  }) => {
    const query = new URLSearchParams()
    if (params.conversationId) {
      query.set('conversation', params.conversationId)
    }
    if (params.userId) {
      query.set('userId', params.userId)
    }
    if (params.callType) {
      query.set('callType', params.callType)
      query.set('autoCall', '1')
    }
    return `/chat?${query.toString()}`
  }, [])

  const handleStartChat = useCallback(async (userId: string, callType?: 'voice' | 'video') => {
    if (!currentUser || !currentWorkspace) return

    try {
      // 1. 先查缓存有没有现成的 direct 会话
      const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
      const cachedData = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null

      if (cachedData) {
        try {
          const cachedConversations = JSON.parse(cachedData)
          // Find existing direct conversation with this user
          const existingConv = cachedConversations.find((conv: any) => {
            if (conv.type !== 'direct' || !conv.members) return false
            const memberIds = conv.members.map((m: any) => m.id || m)
            return memberIds.includes(currentUser.id) && memberIds.includes(userId)
          })

          if (existingConv) {
            // Conversation exists - jump immediately
            console.log('[WorkspaceMembers] Found conversation in cache, jumping:', existingConv.id)
            sessionStorage.setItem('pending_conversation', JSON.stringify(existingConv))
            router.push(buildChatUrl({ conversationId: existingConv.id, callType }))
            return
          }
        } catch (error) {
          console.error('[WorkspaceMembers] Error reading cache:', error)
        }
      }

      // 2. Conversation doesn't exist - jump immediately, let chat page create it
      console.log('[WorkspaceMembers] Jumping to chat page, will create conversation there for userId:', userId)

      // Jump immediately - chat page will handle conversation creation
      router.push(buildChatUrl({ userId, callType }))
    } catch (error) {
      console.error('[WorkspaceMembers] Error in handleStartChat:', error)
    }
  }, [buildChatUrl, currentUser, currentWorkspace, router])

  const handleStartVoiceCall = useCallback((userId: string) => {
    void handleStartChat(userId, 'voice')
  }, [handleStartChat])

  const handleStartVideoCall = useCallback((userId: string) => {
    void handleStartChat(userId, 'video')
  }, [handleStartChat])

  // 处理工作区切换
  const handleWorkspaceChange = useCallback((newWorkspace: Workspace) => {
    setCurrentWorkspace(newWorkspace)
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className="flex h-screen flex-col">
        <WorkspaceHeader
          workspace={currentWorkspace!}
          currentUser={currentUser!}
          totalUnreadCount={totalUnreadCount}
          onWorkspaceChange={handleWorkspaceChange}
        />
        <div className="flex flex-1 overflow-hidden relative">
          {/* 左侧导航栏（仅桌面端显示） */}
          {!isMobile && <AppNavigation />}
          <div className="flex-1 overflow-hidden h-full">
            {currentUser && currentWorkspace && (
              <WorkspaceMembersPanel
                currentUser={currentUser}
                workspaceId={currentWorkspace.id}
                workspace={currentWorkspace}
                onStartChat={handleStartChat}
                onStartVoiceCall={handleStartVoiceCall}
                onStartVideoCall={handleStartVideoCall}
              />
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default WorkspaceMembersPageContent
