'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { User, Workspace } from '@/lib/types'
import { Building2, ChevronDown, Settings, LogOut, Bell, Hash, UsersIcon, MessageSquare, Plus, UserPlus, Loader2, AlertCircle, RefreshCw, Copy, Check } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { mockAuth } from '@/lib/mock-auth'
import { useRouter, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { SettingsSwitcher } from '@/components/settings/settings-switcher'
import { useSettings } from '@/lib/settings-context'
import { useSubscription } from '@/hooks/use-subscription'
import { SubscriptionBadge } from '@/components/subscription/subscription-badge'
import { Crown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { getTranslation } from '@/lib/i18n'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { JoinWorkspaceDialog } from '@/components/workspace/join-workspace-dialog'

interface WorkspaceHeaderProps {
  workspace: Workspace
  currentUser: User
  totalUnreadCount?: number
  onWorkspaceChange?: (workspace: Workspace) => void
}

export function WorkspaceHeader({ workspace: initialWorkspace, currentUser, totalUnreadCount: propTotalUnreadCount = 0, onWorkspaceChange }: WorkspaceHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { t: tSettings } = useSettings()
  const { subscription } = useSubscription()
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace)
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false)
  const [workspaceList, setWorkspaceList] = useState<Workspace[]>([])
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false)
  const [showJoinDialog, setShowJoinDialog] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [newInviteCode, setNewInviteCode] = useState('')
  const [generatedInviteCode, setGeneratedInviteCode] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Invite code dialog state
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [currentInviteCode, setCurrentInviteCode] = useState<string | null>(null)
  const [isLoadingInviteCode, setIsLoadingInviteCode] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  // Initialize with prop value
  const [realTimeUnreadCount, setRealTimeUnreadCount] = useState<number | undefined>(propTotalUnreadCount)

  // Load workspaces
  useEffect(() => {
    async function loadWorkspaces() {
      setIsLoadingWorkspaces(true)
      try {
        const response = await fetch('/api/workspaces')
        const data = await response.json()

        if (data.success && data.workspaces && data.workspaces.length > 0) {
          setWorkspaceList(data.workspaces)
        }
        // 如果没有从API获取到数据，显示空列表
      } finally {
        setIsLoadingWorkspaces(false)
      }
    }

    loadWorkspaces()
  }, [])

  // Real-time subscription for new messages (Supabase only)
  useEffect(() => {
    if (!currentUser || !workspace) return

    let supabase: ReturnType<typeof createClient> | null = null
    try {
      supabase = createClient()
      if (!supabase) return
    } catch (e) {
      return
    }

    const channelName = `unread-count-${currentUser.id}-${Date.now()}`
    const channel = supabase
      .channel(channelName, {
        config: {
          broadcast: { self: true },
          presence: { key: currentUser.id },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMessage = payload.new as any
          if (newMessage.sender_id === currentUser.id) return

          const isChatPage = typeof window !== 'undefined' && window.location.pathname === '/chat'
          if (isChatPage) {
            setTimeout(() => {
              const cacheKey = `conversations_${currentUser.id}_${workspace.id}`
              const cachedData = localStorage.getItem(cacheKey)
              if (cachedData) {
                try {
                  const cachedConversations = JSON.parse(cachedData)
                  const selectedConvId = typeof window !== 'undefined'
                    ? new URLSearchParams(window.location.search).get('conversation')
                    : null
                  const count = cachedConversations
                    .filter((conv: any) => conv.type === 'direct')
                    .filter((conv: any) => {
                      if (selectedConvId && conv.id === selectedConvId) return false
                      return true
                    })
                    .reduce((sum: number, conv: any) => sum + (conv.unread_count || 0), 0)
                  setRealTimeUnreadCount(prev => prev !== count ? count : prev)
                } catch (e) { }
              }
            }, 100)
            return
          }

          try {
            const cacheKey = `conversations_${currentUser.id}_${workspace.id}`
            let cachedData = localStorage.getItem(cacheKey)
            let cachedConversations: any[] = []
            if (!cachedData) {
              const response = await fetch('/api/conversations')
              const data = await response.json()
              if (data.success && data.conversations) {
                cachedConversations = data.conversations
                localStorage.setItem(cacheKey, JSON.stringify(cachedConversations))
              }
            } else {
              cachedConversations = JSON.parse(cachedData)
            }

            let isCurrentlyViewing = false
            if (typeof window !== 'undefined') {
              const isOnChatPage = window.location.pathname === '/chat'
              const urlSelectedConvId = isOnChatPage
                ? new URLSearchParams(window.location.search).get('conversation')
                : null
              if (urlSelectedConvId === newMessage.conversation_id) {
                isCurrentlyViewing = true
              }
            }

            const updated = cachedConversations.map((conv: any) => {
              if (conv.id === newMessage.conversation_id) {
                return {
                  ...conv,
                  unread_count: isCurrentlyViewing ? 0 : (conv.unread_count || 0) + 1,
                  last_message: { id: newMessage.id, content: newMessage.content, type: newMessage.type, created_at: newMessage.created_at },
                  last_message_at: newMessage.created_at,
                }
              }
              return conv
            })

            localStorage.setItem(cacheKey, JSON.stringify(updated))
            const count = updated
              .filter((conv: any) => conv.type === 'direct')
              .reduce((sum: number, conv: any) => sum + (conv.unread_count || 0), 0)
            setRealTimeUnreadCount(prev => prev !== count ? count : prev)
            window.dispatchEvent(new Event('conversationsUpdated'))
          } catch (e) { }
        }
      )
      .on(
        'broadcast',
        { event: 'new_message' },
        async (payload) => {
          console.log('[WorkspaceHeader] Received broadcast new_message:', payload)

          // Check if this broadcast is for current user
          if (payload.user_id && payload.user_id !== currentUser.id) {
            return
          }

          // Trigger conversation list refresh
          try {
            const cacheKey = `conversations_${currentUser.id}_${workspace.id}`

            // Fetch latest conversations from API
            const response = await fetch('/api/conversations')
            const data = await response.json()

            if (data.success && data.conversations) {
              // Update cache
              localStorage.setItem(cacheKey, JSON.stringify(data.conversations))

              // Calculate new unread count
              const count = data.conversations
                .filter((conv: any) => conv.type === 'direct')
                .reduce((sum: number, conv: any) => sum + (conv.unread_count || 0), 0)

              setRealTimeUnreadCount(prev => prev !== count ? count : prev)

              // Notify other components to refresh
              window.dispatchEvent(new Event('conversationsUpdated'))

              console.log('[WorkspaceHeader] Updated unread count from broadcast:', count)
            }
          } catch (e) {
            console.error('[WorkspaceHeader] Failed to handle broadcast:', e)
          }
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString(), user_id: currentUser.id })
          const presenceInterval = setInterval(async () => {
            try { await channel.track({ online_at: new Date().toISOString(), user_id: currentUser.id }) }
            catch (e) { clearInterval(presenceInterval) }
          }, 30000)
          ;(channel as any)._presenceInterval = presenceInterval
        }
      })

    return () => {
      if (channel && supabase) {
        if ((channel as any)._presenceInterval) clearInterval((channel as any)._presenceInterval)
        supabase.removeChannel(channel)
      }
    }
  }, [currentUser, workspace])

  useEffect(() => {
    if (realTimeUnreadCount === undefined) {
      setRealTimeUnreadCount(propTotalUnreadCount)
    } else if (propTotalUnreadCount !== realTimeUnreadCount) {
      const diff = Math.abs(propTotalUnreadCount - realTimeUnreadCount)
      if (diff > 1 || (propTotalUnreadCount === 0 && realTimeUnreadCount > 0)) {
        setRealTimeUnreadCount(propTotalUnreadCount)
      }
    }
  }, [propTotalUnreadCount, realTimeUnreadCount])

  const totalUnreadCount = realTimeUnreadCount !== undefined && realTimeUnreadCount !== null
    ? realTimeUnreadCount
    : propTotalUnreadCount

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      await response.json()
    } catch (error) { }
    finally {
      mockAuth.logout()
      router.push('/login')
    }
  }

  const handleWorkspaceSelect = (ws: Workspace) => {
    setWorkspace(ws)
    mockAuth.setCurrentWorkspace(ws)
    setShowWorkspaceMenu(false)
    // 通知父组件工作区已切换
    onWorkspaceChange?.(ws)
  }

  const handleJoin = async (workspaceId: string): Promise<{ success: boolean; error?: string }> => {
    console.log('[WorkspaceHeader] ========== handleJoin 开始 ==========')
    console.log('[WorkspaceHeader] 目标工作区ID:', workspaceId)

    try {
      console.log('[WorkspaceHeader] 准备发送 POST 请求到 /api/workspace-join-requests')

      const response = await fetch('/api/workspace-join-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })

      console.log('[WorkspaceHeader] 响应状态:', response.status, response.statusText)

      const data = await response.json()
      console.log('[WorkspaceHeader] 响应数据:', JSON.stringify(data, null, 2))

      if (data.success) {
        console.log('[WorkspaceHeader] 申请成功!')
        return { success: true }
      } else {
        console.log('[WorkspaceHeader] 申请失败:', data.error)
        return { success: false, error: data.error || 'Failed to submit request' }
      }
    } catch (error: any) {
      console.error('[WorkspaceHeader] 请求异常:', error)
      return { success: false, error: 'Failed to submit join request' }
    }
  }

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim() || !newInviteCode.trim()) return

    setIsCreating(true)

    try {
      // 调用 API 创建工作区，传递邀请码
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWorkspaceName, inviteCode: newInviteCode.trim().toUpperCase() }),
      })
      const data = await response.json()

      if (data.success) {
        // 保存邀请码，显示给用户
        setGeneratedInviteCode(newInviteCode.trim().toUpperCase())

        // 将新工作区添加到列表
        const newWorkspace: Workspace = {
          id: data.workspace?.id || newWorkspaceName.toLowerCase().replace(/\s+/g, '-'),
          name: newWorkspaceName,
          domain: newWorkspaceName.toLowerCase().replace(/\s+/g, '-'),
          description: '',
        }
        setWorkspaceList([...workspaceList, newWorkspace])
        setNewWorkspaceName('')
        setNewInviteCode('')

        // 不关闭对话框，让用户看到邀请码
        setShowCreateDialog(true) // 保持对话框打开以显示邀请码
      } else {
        console.error('Failed to create workspace:', data.error)
        // 即使 API 失败，也显示邀请码
        setGeneratedInviteCode(newInviteCode.trim().toUpperCase())

        const newWorkspace: Workspace = {
          id: newWorkspaceName.toLowerCase().replace(/\s+/g, '-'),
          name: newWorkspaceName,
          domain: newWorkspaceName.toLowerCase().replace(/\s+/g, '-'),
          description: '',
        }
        setWorkspaceList([...workspaceList, newWorkspace])
        setNewWorkspaceName('')
        setNewInviteCode('')
        setShowCreateDialog(true)
      }
    } catch (error) {
      console.error('Create workspace error:', error)
      // 即使 API 失败也显示邀请码
      setGeneratedInviteCode(newInviteCode.trim().toUpperCase())

      const newWorkspace: Workspace = {
        id: newWorkspaceName.toLowerCase().replace(/\s+/g, '-'),
        name: newWorkspaceName,
        domain: newWorkspaceName.toLowerCase().replace(/\s+/g, '-'),
        description: '',
      }
      setWorkspaceList([...workspaceList, newWorkspace])
      setNewWorkspaceName('')
      setNewInviteCode('')
      setShowCreateDialog(true)
    } finally {
      setIsCreating(false)
    }
  }

  const goToPayment = () => {
    router.push('/payment')
  }

  const handleShowInviteCode = async () => {
    setIsLoadingInviteCode(true)
    setShowInviteDialog(true)

    try {
      // 从当前工作区对象获取邀请码（工作区列表已包含 invite_code）
      if (workspace.invite_code) {
        setCurrentInviteCode(workspace.invite_code)
      } else {
        // 如果当前对象没有，尝试从工作区列表查找
        const currentWs = workspaceList.find(ws => ws.id === workspace.id)
        if (currentWs?.invite_code) {
          setCurrentInviteCode(currentWs.invite_code)
        } else {
          setCurrentInviteCode(null)
        }
      }
    } catch (error) {
      console.error('Failed to get invite code:', error)
      setCurrentInviteCode(null)
    } finally {
      setIsLoadingInviteCode(false)
    }
  }

  const handleCopyInviteCode = async () => {
    if (!currentInviteCode) return

    try {
      await navigator.clipboard.writeText(currentInviteCode)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (error) {
      // 降级方案
      const textArea = document.createElement('textarea')
      textArea.value = currentInviteCode
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }

  const navItems = [
    { label: t('messages'), icon: MessageSquare, path: '/chat' },
    { label: t('channels'), icon: Hash, path: '/channels' },
    { label: t('contacts'), icon: UsersIcon, path: '/contacts' },
  ]

  return (
    <>
      <div className="border-b bg-background">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <DropdownMenu open={showWorkspaceMenu} onOpenChange={setShowWorkspaceMenu}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    {workspace.logo_url ? (
                      <img src={workspace.logo_url || "/placeholder.svg"} alt={workspace.name} className="h-6 w-6 rounded" />
                    ) : (
                      <Building2 className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-sm">{workspace.name}</div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72 p-0">
                {/* 工作区列表 */}
                <div className="p-2">
                  <div className="text-[10px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wider">
                    {language === 'zh' ? '切换工作区' : 'Switch Workspace'}
                  </div>
                  {isLoadingWorkspaces ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    workspaceList.map((ws) => (
                      <button
                        key={ws.id}
                        onClick={() => handleWorkspaceSelect(ws)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center space-x-2 ${workspace.id === ws.id ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'}`}
                      >
                        <div className="w-6 h-6 bg-blue-500 rounded flex-shrink-0 flex items-center justify-center text-[10px] text-white font-bold">
                          {ws.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate">{ws.name}</span>
                      </button>
                    ))
                  )}
                </div>
                <div className="p-2 border-t border-gray-100 bg-gray-50 flex flex-col space-y-1">
                  <button
                    onClick={() => { setShowWorkspaceMenu(false); handleShowInviteCode(); }}
                    className="flex items-center space-x-2 px-3 py-2 text-sm text-purple-600 hover:bg-purple-100 rounded-lg transition-colors"
                  >
                    <UserPlus size={16} />
                    <span>{language === 'zh' ? '邀请成员' : 'Invite Members'}</span>
                  </button>
                  <button
                    onClick={() => { setShowWorkspaceMenu(false); setShowJoinDialog(true); }}
                    className="flex items-center space-x-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                  >
                    <UserPlus size={16} />
                    <span>{language === 'zh' ? '加入组织' : 'Join Organization'}</span>
                  </button>
                  <button
                    onClick={() => { setShowWorkspaceMenu(false); setShowCreateDialog(true); }}
                    className="flex items-center space-x-2 px-3 py-2 text-sm text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                  >
                    <Plus size={16} />
                    <span>{language === 'zh' ? '创建新组织' : 'Create New Organization'}</span>
                  </button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2">
            {subscription.type === 'free' && (
              <Button size="sm" variant="ghost" onClick={goToPayment} className="h-8 gap-1.5 px-2.5 hover:bg-accent/50">
                <Crown className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">Pro</span>
              </Button>
            )}
            {subscription.type !== 'free' && subscription.isActive && (
              <button type="button" onClick={goToPayment} className="rounded-full border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <SubscriptionBadge subscription={subscription} showDays />
              </button>
            )}
            <Button size="icon" variant="ghost">
              <Bell className="h-5 w-5" />
            </Button>
            <SettingsSwitcher />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={currentUser.avatar_url || undefined} />
                    <AvatarFallback name={currentUser.full_name}>
                      {currentUser.full_name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-2">
                  <div className="font-semibold">{currentUser.full_name}</div>
                  <div className="text-sm text-muted-foreground">{currentUser.title}</div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/settings/profile')}>
                  {t('profileSettings')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/settings/preferences')}>
                  {t('preferences')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* 加入组织对话框 */}
      <JoinWorkspaceDialog
        open={showJoinDialog}
        onOpenChange={setShowJoinDialog}
        onJoin={handleJoin}
      />

      {/* 创建新组织对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open)
        if (!open) {
          setNewWorkspaceName('')
          setNewInviteCode('')
          setGeneratedInviteCode('')
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              {generatedInviteCode ? (language === 'zh' ? '创建成功' : 'Created Successfully') : (language === 'zh' ? '创建新组织' : 'Create New Organization')}
            </DialogTitle>
            <DialogDescription>
              {generatedInviteCode ? (language === 'zh' ? '请保存以下邀请码，分享给成员加入组织' : 'Save the invite code below to share with members') : (language === 'zh' ? '创建一个新的工作区' : 'Create a new workspace')}
            </DialogDescription>
          </DialogHeader>

          {generatedInviteCode ? (
            // 显示生成的邀请码
            <div className="py-4 space-y-4">
              <div className="text-center">
                <div className="text-sm text-muted-foreground mb-2">
                  {language === 'zh' ? '邀请码' : 'Invite Code'}
                </div>
                <div className="text-3xl font-mono font-bold tracking-widest text-primary bg-primary/10 px-6 py-3 rounded-lg">
                  {generatedInviteCode}
                </div>
              </div>
              <div className="text-center text-sm text-muted-foreground">
                {language === 'zh' ? '将此邀请码分享给需要加入组织的成员' : 'Share this invite code with members who need to join'}
              </div>
              <DialogFooter>
                <Button onClick={() => {
                  setShowCreateDialog(false)
                  setGeneratedInviteCode('')
                }}>
                  {language === 'zh' ? '完成' : 'Done'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            // 创建表单
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {language === 'zh' ? '组织名称' : 'Organization Name'}
                  </label>
                  <Input
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    placeholder={language === 'zh' ? '例如：TechCorp 总组' : 'e.g., TechCorp'}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">
                      {language === 'zh' ? '邀请码' : 'Invite Code'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const prefix = newWorkspaceName.substring(0, 4).toUpperCase() || 'ORG'
                        const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase()
                        setNewInviteCode(`${prefix}${randomPart}`)
                      }}
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      {language === 'zh' ? '随机生成' : 'Random'}
                    </button>
                  </div>
                  <Input
                    value={newInviteCode}
                    onChange={(e) => setNewInviteCode(e.target.value.toUpperCase())}
                    placeholder={language === 'zh' ? '例如：TECHCORP123' : 'e.g., TECHCORP123'}
                    className="font-mono"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setShowCreateDialog(false)
                  setNewWorkspaceName('')
                  setNewInviteCode('')
                }}>
                  {language === 'zh' ? '取消' : 'Cancel'}
                </Button>
                <Button onClick={handleCreateWorkspace} disabled={!newWorkspaceName.trim() || !newInviteCode.trim() || isCreating}>
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {language === 'zh' ? '创建中...' : 'Creating...'}
                    </>
                  ) : (
                    language === 'zh' ? '创建' : 'Create'
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 邀请成员对话框 */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              {language === 'zh' ? '邀请成员' : 'Invite Members'}
            </DialogTitle>
            <DialogDescription>
              {language === 'zh'
                ? '分享以下邀请码给新成员，他们可以通过邀请码加入组织'
                : 'Share this invite code with new members to join your organization'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            {isLoadingInviteCode ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : currentInviteCode ? (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-2">
                    {language === 'zh' ? '邀请码' : 'Invite Code'}
                  </div>
                  <div className="text-3xl font-mono font-bold tracking-widest text-primary bg-primary/10 px-6 py-4 rounded-lg">
                    {currentInviteCode}
                  </div>
                </div>
                <div className="flex justify-center">
                  <Button
                    onClick={handleCopyInviteCode}
                    className="gap-2"
                  >
                    {copySuccess ? (
                      <>
                        <Check className="h-4 w-4" />
                        {language === 'zh' ? '已复制' : 'Copied'}
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        {language === 'zh' ? '复制邀请码' : 'Copy Code'}
                      </>
                    )}
                  </Button>
                </div>
                <div className="text-center text-sm text-muted-foreground">
                  {language === 'zh'
                    ? '新成员可在"加入组织"中输入此邀请码'
                    : 'New members can enter this code in "Join Organization"'}
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-4">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                {language === 'zh'
                  ? '当前工作区暂无邀请码'
                  : 'No invite code available for this workspace'}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowInviteDialog(false)}>
              {language === 'zh' ? '关闭' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
