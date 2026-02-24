'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { mockAuth } from '@/lib/mock-auth'
import { WorkspaceHeader } from '@/components/chat/workspace-header'
import { AppNavigation } from '@/components/layout/app-navigation'
import { WorkspaceMembersPanel } from '@/components/chat/workspace-members-panel'
import { useToast } from '@/components/ui/use-toast'
import { User, Workspace } from '@/lib/types'
import { useIsMobile } from '@/hooks/use-mobile'
import { Loader2 } from 'lucide-react'

function WorkspaceMembersPageContent() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [totalUnreadCount, setTotalUnreadCount] = useState(0)
  const { toast } = useToast()
  const isMobile = useIsMobile()

  // Load current user and workspace
  useEffect(() => {
    async function loadInitialData() {
      try {
        const user = await mockAuth.getCurrentUser()
        if (!user) {
          router.push('/login')
          return
        }
        setCurrentUser(user)

        // Get current workspace from mockAuth (same as contacts page)
        const workspace = mockAuth.getCurrentWorkspace()
        if (!workspace) {
          console.error('No workspace found')
          router.push('/login')
          return
        }
        setCurrentWorkspace(workspace)
      } catch (error) {
        console.error('Failed to load initial data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadInitialData()
  }, [router])

  // Start a chat with a workspace member
  const handleStartChat = useCallback(async (userId: string) => {
    if (!currentUser) return

    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'direct',
          member_ids: [userId],
          skip_contact_check: true // Skip friend check for same workspace
        })
      })

      const data = await response.json()

      if (data.success) {
        router.push(`/chat?conversation=${data.conversation.id}`)
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to start conversation',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Failed to start chat:', error)
      toast({
        title: 'Error',
        description: 'Failed to start conversation',
        variant: 'destructive'
      })
    }
  }, [currentUser, router, toast])

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
        />
        <div className="flex flex-1 overflow-hidden relative">
          {/* 左侧导航栏（仅桌面端显示） */}
          {!isMobile && <AppNavigation />}
          <div className="flex-1 overflow-hidden h-full">
            {currentUser && currentWorkspace && (
              <WorkspaceMembersPanel
                currentUser={currentUser}
                workspaceId={currentWorkspace.id}
                onStartChat={handleStartChat}
              />
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default WorkspaceMembersPageContent
