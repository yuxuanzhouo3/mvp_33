'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { User } from '@/lib/types'
import { Search, UserPlus, Users, Star, Building2, MessageSquare, Phone, Video, ChevronUp, ChevronDown, Trash2, Ban, Flag, QrCode, Scan } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { AddContactDialog } from './add-contact-dialog'
import { ContactRequestsPanel } from './contact-requests-panel'
import { ContactSkeleton } from './contact-skeleton'
import { BlockUserDialog } from './block-user-dialog'
import { ReportUserDialog } from './report-user-dialog'
import { QRCodeDialog } from './qr-code-dialog'
import { ScanQRDialog } from './scan-qr-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ManualContactData {
  full_name: string
  email: string
  phone?: string
  company?: string
  notes?: string
}

interface ContactsPanelProps {
  users: User[]
  currentUser: User
  onStartChat: (userId: string) => void
  onAddContact?: (userId: string, message?: string) => void
  onAddManualContact?: (contactData: ManualContactData) => void
  onDeleteContact?: (userId: string) => void
  allUsers?: User[] // All available users for adding contacts
  onContactAccepted?: () => void
  isLoading?: boolean // Loading state
  initialUserId?: string | null // Initial user ID to select
}

export function ContactsPanel({ 
  users, 
  currentUser, 
  onStartChat,
  onAddContact,
  onAddManualContact,
  onDeleteContact,
  allUsers = [],
  onContactAccepted,
  isLoading = false,
  initialUserId = null
}: ContactsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [favoriteStatuses, setFavoriteStatuses] = useState<Map<string, boolean>>(new Map())
  
  // Auto-select user if initialUserId is provided
  useEffect(() => {
    if (!initialUserId || selectedUser) return

    // 1) 优先用从 sessionStorage 里带过来的完整用户对象（聊天页点击头像时写入）
    if (typeof window !== 'undefined') {
      const raw = window.sessionStorage.getItem('pending_contact_user')
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          if (parsed && parsed.id === initialUserId) {
            setSelectedUser({
              ...parsed,
            } as User)
            // 用完就清掉，避免下次误用
            window.sessionStorage.removeItem('pending_contact_user')
            return
          }
        } catch {
          // ignore JSON parse error
        }
      }
    }

    // 2) fallback: 从当前 contacts 列表里找
    if (users.length > 0) {
      const userToSelect = users.find(u => u.id === initialUserId)
      if (userToSelect) {
        setSelectedUser(userToSelect)
      }
    }
  }, [initialUserId, users, selectedUser])
  const [showAddContactDialog, setShowAddContactDialog] = useState(false)
  const [showQRCodeDialog, setShowQRCodeDialog] = useState(false)
  const [showScanQRDialog, setShowScanQRDialog] = useState(false)
  const [showBlockDialog, setShowBlockDialog] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [showScrollDownButton, setShowScrollDownButton] = useState(false)
  const [showScrollUpButton, setShowScrollUpButton] = useState(false)
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  // Get the scroll container
  const getScrollContainer = (): HTMLDivElement | null => {
    if (viewportRef.current) return viewportRef.current
    
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement ||
                       scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement
      
      if (viewport) {
        viewportRef.current = viewport
        return viewport
      }
      
      // Fallback: find any scrollable div child
      const children = scrollAreaRef.current.querySelectorAll('div')
      for (const child of children) {
        const style = window.getComputedStyle(child)
        if (style.overflowY === 'auto' || style.overflowY === 'scroll' || 
            style.overflow === 'auto' || style.overflow === 'scroll') {
          viewportRef.current = child as HTMLDivElement
          return child as HTMLDivElement
        }
      }
    }
    return null
  }

  useEffect(() => {
    let scrollContainer: HTMLDivElement | null = null
    let resizeObserver: ResizeObserver | null = null
    let retryTimer: NodeJS.Timeout | null = null
    let checkTimer: NodeJS.Timeout | null = null
    let handleScroll: (() => void) | null = null

    const findAndSetupScroll = () => {
      scrollContainer = getScrollContainer()
      
      if (!scrollContainer) {
        retryTimer = setTimeout(findAndSetupScroll, 100)
        return
      }

      handleScroll = () => {
        if (!scrollContainer) return
        
        const scrollTop = scrollContainer.scrollTop
        const scrollHeight = scrollContainer.scrollHeight
        const clientHeight = scrollContainer.clientHeight
        
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
        const isNearTop = scrollTop < 100
        const isScrollable = scrollHeight > clientHeight
        
        setShowScrollDownButton(!isNearBottom && isScrollable)
        setShowScrollUpButton(!isNearTop && isScrollable)
      }

      scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
      checkTimer = setTimeout(handleScroll, 200)
      
      resizeObserver = new ResizeObserver(() => {
        if (handleScroll) {
          setTimeout(handleScroll, 100)
        }
      })
      resizeObserver.observe(scrollContainer)
    }

    const timer = setTimeout(findAndSetupScroll, 100)
    
    return () => {
      clearTimeout(timer)
      if (retryTimer) clearTimeout(retryTimer)
      if (checkTimer) clearTimeout(checkTimer)
      if (scrollContainer && handleScroll) {
        scrollContainer.removeEventListener('scroll', handleScroll)
      }
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
    }
  }, [users, searchQuery])

  // 一进联系人页就预加载一下待处理请求数量，用于 Requests 标签上的红点
  // 使用本地缓存 + 后台刷新，减少首屏延迟；定期刷新保持最新
  useEffect(() => {
    let cancelled = false

    const loadInitialPendingCount = async () => {
      try {
        // 1) 尝试读取缓存，立即展示
        const cacheKey = `pending_requests_${currentUser.id}`
        const cacheTsKey = `${cacheKey}_ts`
        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem(cacheKey)
          const cachedTs = localStorage.getItem(cacheTsKey)
          const ttl = 1000
          if (cached && cachedTs && Date.now() - parseInt(cachedTs, 10) < ttl) {
            const count = parseInt(cached, 10)
            if (!Number.isNaN(count)) {
              setPendingRequestsCount(count)
            }
          }
        }

        // 2) 后台请求最新数据
        const response = await fetch('/api/contact-requests?type=received')
        if (!response.ok) return

        const data = await response.json()
        if (cancelled) return

        const count = Array.isArray(data.requests) ? data.requests.length : 0
        setPendingRequestsCount(count)

        // 写入缓存
        if (typeof window !== 'undefined') {
          const cacheKey = `pending_requests_${currentUser.id}`
          const cacheTsKey = `${cacheKey}_ts`
          localStorage.setItem(cacheKey, count.toString())
          localStorage.setItem(cacheTsKey, Date.now().toString())
        }
      } catch {
        // 静默失败，不影响联系人主列表
      }
    }

    // 立即加载一次
    loadInitialPendingCount()
    
    // 页面可见时秒级刷新，保证新的好友申请尽快可见。
    let interval: NodeJS.Timeout
    
    const setupInterval = () => {
      const isVisible = document.visibilityState === 'visible'
      const refreshInterval = isVisible ? 2000 : 10000
      
      if (interval) {
        clearInterval(interval)
      }
      
      interval = setInterval(() => {
        if (document.visibilityState === 'visible' && !cancelled) {
          loadInitialPendingCount()
        }
      }, refreshInterval)
    }
    
    setupInterval()
    
    // 监听页面可见性变化
    const handleVisibilityChange = () => {
      setupInterval()
      if (document.visibilityState === 'visible' && !cancelled) {
        loadInitialPendingCount()
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      if (interval) {
        clearInterval(interval)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const scrollToBottom = () => {
    const scrollContainer = getScrollContainer()
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth'
      })
      setShowScrollDownButton(false)
      setShowScrollUpButton(true)
    }
  }

  const scrollToTop = () => {
    const scrollContainer = getScrollContainer()
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: 0,
        behavior: 'smooth'
      })
      setShowScrollUpButton(false)
      setShowScrollDownButton(true)
    }
  }

  const scrollAreaCallbackRef = (node: HTMLDivElement | null) => {
    if (node) {
      scrollAreaRef.current = node
      setTimeout(() => {
        const viewport = node.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement
        if (viewport) {
          viewportRef.current = viewport
        }
      }, 50)
    }
  }

  // Initialize favorite statuses from users
  useEffect(() => {
    const statuses = new Map<string, boolean>()
    users.forEach(user => {
      const isFavorite = (user as any)._is_favorite || false
      statuses.set(user.id, isFavorite)
    })
    setFavoriteStatuses(statuses)
  }, [users])

  // Include current user as a special "self" contact at the top.
  // We don't store self-contact in the database, just inject it into the list for UI.
  const baseUsersWithSelf: User[] = [
    {
      ...currentUser,
    },
    ...users.filter(u => u.id !== currentUser.id),
  ]

  const filteredUsers = baseUsersWithSelf
    .filter(u => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      return (
        u.full_name.toLowerCase().includes(query) ||
        u.username.toLowerCase().includes(query) ||
        u.department?.toLowerCase().includes(query) ||
        u.title?.toLowerCase().includes(query)
      )
    })

  const favoriteUsers = baseUsersWithSelf.filter(u => favoriteStatuses.get(u.id) === true)

  const usersByDepartment = filteredUsers.reduce((acc, user) => {
    const dept = user.department || 'Other'
    if (!acc[dept]) acc[dept] = []
    acc[dept].push(user)
    return acc
  }, {} as Record<string, User[]>)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'away': return 'bg-yellow-500'
      case 'busy': return 'bg-red-500'
      default: return 'bg-gray-400'
    }
  }

  const getStatusText = (status: string) => {
    const statusKey = status as 'online' | 'away' | 'busy' | 'offline'
    return t(statusKey)
  }

  return (
    <div className="flex h-full">
      {/* Contacts list */}
      <div className="w-[480px] border-r flex flex-col">
        <div className="border-b p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('contacts')}</h2>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowQRCodeDialog(true)}
                title={t('myQRCode')}
              >
                <QrCode className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowScanQRDialog(true)}
                title={t('scanQRCode')}
              >
                <Scan className="h-5 w-5" />
              </Button>
              {(onAddContact || onAddManualContact) && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowAddContactDialog(true)}
                  title="Add Contact"
                >
                  <UserPlus className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('searchContacts')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Tabs defaultValue="all" className="flex-1 flex flex-col">
          <div className="px-4 mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="all" className="flex-1">
                <Users className="h-4 w-4 mr-2" />
                {t('all')}
              </TabsTrigger>
              <TabsTrigger value="favorites" className="flex-1">
                <Star className="h-4 w-4 mr-2" />
                {t('favorites')}
              </TabsTrigger>
              <TabsTrigger value="requests" className="flex-1 relative">
                <UserPlus className="h-4 w-4 mr-2" />
                {t('requests')}
                {pendingRequestsCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-500 text-[10px] leading-none text-white px-1.5 py-0.5">
                    {pendingRequestsCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>
          
          {/* Full-width separator line */}
          <div className="border-b w-full mt-2"></div>

          <div className="flex-1 relative overflow-hidden min-h-0">
            <ScrollArea className="h-full" ref={scrollAreaCallbackRef}>
              <TabsContent value="requests" className="m-0">
                <ContactRequestsPanel
                  currentUser={currentUser}
                  onAccept={() => {
                    if (onContactAccepted) onContactAccepted()
                  }}
                  onMessage={onStartChat}
                  onPendingCountChange={(count) => {
                    setPendingRequestsCount(count)
                    // 同步更新缓存，确保红点状态一致
                    if (typeof window !== 'undefined' && currentUser) {
                      const cacheKey = `pending_requests_${currentUser.id}`
                      const cacheTsKey = `${cacheKey}_ts`
                      localStorage.setItem(cacheKey, count.toString())
                      localStorage.setItem(cacheTsKey, Date.now().toString())
                    }
                  }}
                />
              </TabsContent>
              <TabsContent value="all" className="m-0">
                {isLoading ? (
                  <div className="p-2">
                    <ContactSkeleton count={8} showDepartments={true} />
                  </div>
                ) : Object.entries(usersByDepartment).length === 0 ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-muted-foreground">No contacts found</div>
                  </div>
                ) : (
                  Object.entries(usersByDepartment).map(([department, deptUsers]) => (
                    <div key={department} className="p-2">
                      <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-muted-foreground">
                        <Building2 className="h-4 w-4" />
                        {department}
                        <Badge variant="secondary" className="ml-auto">
                          {deptUsers.length}
                        </Badge>
                      </div>
                      {deptUsers.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => setSelectedUser(user)}
                        className={cn(
                          'w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent',
                          selectedUser?.id === user.id && 'bg-accent'
                        )}
                      >
                        <div className="relative">
                          <Avatar className="h-10 w-10" userId={user.id} showOnlineStatus={true}>
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback name={user.full_name}>
                              {user.full_name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{user.full_name}</div>
                          <p className="text-sm text-muted-foreground truncate">
                            {user.title}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ))
                )}
              </TabsContent>

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
                        <div className="relative">
                          <Avatar className="h-10 w-10" userId={user.id} showOnlineStatus={true}>
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback name={user.full_name}>
                              {user.full_name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{user.full_name}</div>
                          <p className="text-sm text-muted-foreground truncate">
                            {user.title}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </TabsContent>
            </ScrollArea>

            {showScrollUpButton && (
              <Button
                onClick={scrollToTop}
                size="icon"
                variant="default"
                className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-lg z-20 bg-background border hover:bg-accent"
                aria-label="Scroll to top"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
            )}
            {showScrollDownButton && (
              <Button
                onClick={scrollToBottom}
                size="icon"
                variant="default"
                className="absolute bottom-2 right-2 h-8 w-8 rounded-full shadow-lg z-20 bg-background border hover:bg-accent"
                aria-label="Scroll to bottom"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            )}
          </div>
        </Tabs>
      </div>

      {/* Contact details */}
      <div className="flex-1 flex flex-col">
        {selectedUser ? (
          <>
            <div className="border-b p-6">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <Avatar className="h-20 w-20" userId={selectedUser.id} showOnlineStatus={true}>
                    <AvatarImage src={selectedUser.avatar_url || undefined} />
                    <AvatarFallback name={selectedUser.full_name} className="text-2xl">
                      {selectedUser.full_name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-semibold mb-1">
                    {selectedUser.full_name}
                  </h2>
                  <p className="text-muted-foreground mb-2">{selectedUser.title}</p>
                  <Badge variant="secondary">
                    {getStatusText(selectedUser.status)}
                  </Badge>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <Button 
                  className="flex-1"
                  onClick={() => onStartChat(selectedUser.id)}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  {t('message')}
                </Button>
                {selectedUser.id !== currentUser.id && (
                  <Button
                    variant={favoriteStatuses.get(selectedUser.id) ? "default" : "outline"}
                    onClick={async () => {
                      const newFavoriteStatus = !favoriteStatuses.get(selectedUser.id)
                      try {
                        const response = await fetch(`/api/contacts?contactUserId=${encodeURIComponent(selectedUser.id)}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ is_favorite: newFavoriteStatus }),
                        })
                        const data = await response.json()
                        if (data.success) {
                          setFavoriteStatuses(prev => {
                            const next = new Map(prev)
                            next.set(selectedUser.id, newFavoriteStatus)
                            return next
                          })
                          // Update user object
                          setSelectedUser(prev => prev ? { ...prev, _is_favorite: newFavoriteStatus } : null)
                        }
                      } catch (error) {
                        console.error('Failed to update favorite status:', error)
                      }
                    }}
                    title={favoriteStatuses.get(selectedUser.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star className={cn("h-4 w-4", favoriteStatuses.get(selectedUser.id) && "fill-current")} />
                  </Button>
                )}
                <Button 
                  variant="outline"
                  onClick={() => {
                    // TODO: Implement call functionality
                    alert('Call feature coming soon!')
                  }}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  {t('call')}
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    // TODO: Implement video call functionality
                    alert('Video call feature coming soon!')
                  }}
                >
                  <Video className="h-4 w-4 mr-2" />
                  {t('video')}
                </Button>
                {onDeleteContact && selectedUser.id !== currentUser.id && (
                  <Button
                    variant="outline"
                    className="text-foreground border-border hover:bg-muted hover:text-foreground"
                    onClick={() => {
                      setUserToDelete(selectedUser)
                      setShowDeleteDialog(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                )}
                {/* Slack Mode: Block and Report buttons */}
                {selectedUser.id !== currentUser.id && (
                  <>
                    <Button
                      variant="outline"
                      className="text-foreground border-border hover:bg-muted hover:text-foreground"
                      onClick={() => setShowBlockDialog(true)}
                    >
                      <Ban className="h-4 w-4 mr-2" />
                      {t('blockUser')}
                    </Button>
                    <Button
                      variant="outline"
                      className="text-foreground border-border hover:bg-muted hover:text-foreground"
                      onClick={() => setShowReportDialog(true)}
                    >
                      <Flag className="h-4 w-4 mr-2" />
                      {t('reportUser')}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h3 className="text-sm font-semibold mb-3">{t('contactInformation')}</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-muted-foreground">{t('email')}</label>
                      <p className="font-medium">{selectedUser.email}</p>
                    </div>
                    {selectedUser.phone && (
                      <div>
                        <label className="text-sm text-muted-foreground">{t('phone')}</label>
                        <p className="font-medium">{selectedUser.phone}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-sm text-muted-foreground">{t('username')}</label>
                      <p className="font-medium">@{selectedUser.username}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-3">{t('workInformation')}</h3>
                  <div className="space-y-3">
                    {selectedUser.department && (
                      <div>
                        <label className="text-sm text-muted-foreground">{t('department')}</label>
                        <p className="font-medium">{selectedUser.department}</p>
                      </div>
                    )}
                    {selectedUser.title && (
                      <div>
                        <label className="text-sm text-muted-foreground">{t('title')}</label>
                        <p className="font-medium">{selectedUser.title}</p>
                      </div>
                    )}
                  </div>
                </div>

                {selectedUser.status_message && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3">{t('status')}</h3>
                    <p className="text-muted-foreground">{selectedUser.status_message}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Users className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <h3 className="text-lg font-semibold mb-2">{t('noContactSelected')}</h3>
              <p>{t('selectContactToViewDetails')}</p>
            </div>
          </div>
        )}
      </div>

      {(onAddContact || onAddManualContact) && (
        <AddContactDialog
          open={showAddContactDialog}
          onOpenChange={setShowAddContactDialog}
          allUsers={allUsers.length > 0 ? allUsers : users}
          currentUser={currentUser}
          onAddContact={onAddContact || (() => {})}
          onAddManualContact={onAddManualContact}
        />
      )}

      {/* Delete contact confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteContact')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteContactDescription').replace('{name}', userToDelete?.full_name || userToDelete?.username || 'this contact')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDeleteDialog(false)
              setUserToDelete(null)
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (userToDelete && onDeleteContact) {
                  await onDeleteContact(userToDelete.id)
                  setShowDeleteDialog(false)
                  setUserToDelete(null)
                  setSelectedUser(null)
                }
              }}
              className="bg-gray-900 text-white hover:bg-gray-800"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Slack Mode: Block User Dialog */}
      {selectedUser && (
        <BlockUserDialog
          open={showBlockDialog}
          onOpenChange={setShowBlockDialog}
          userId={selectedUser.id}
          userName={selectedUser.full_name || selectedUser.username || 'User'}
          onBlocked={() => {
            setShowBlockDialog(false)
            // Optionally refresh or update UI
          }}
        />
      )}

      {/* Slack Mode: Report User Dialog */}
      {selectedUser && (
        <ReportUserDialog
          open={showReportDialog}
          onOpenChange={setShowReportDialog}
          userId={selectedUser.id}
          userName={selectedUser.full_name || selectedUser.username || 'User'}
          onReported={() => {
            setShowReportDialog(false)
            // Optionally refresh or update UI
          }}
        />
      )}

      <QRCodeDialog
        open={showQRCodeDialog}
        onOpenChange={setShowQRCodeDialog}
        currentUser={currentUser}
      />

      <ScanQRDialog
        open={showScanQRDialog}
        onOpenChange={setShowScanQRDialog}
        onAddContact={(userId) => {
          if (onAddContact) {
            onAddContact(userId)
          }
        }}
      />
    </div>
  )
}
