'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { mockAuth } from '@/lib/mock-auth'
import { ContactsPanel } from '@/components/contacts/contacts-panel'
import { WorkspaceHeader } from '@/components/chat/workspace-header'
import { AppNavigation } from '@/components/layout/app-navigation'
import { useToast } from '@/components/ui/use-toast'
import { User, Workspace } from '@/lib/types'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { useIsMobile } from '@/hooks/use-mobile'
import { IS_DOMESTIC_VERSION } from '@/config'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

function ContactsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentUser, setCurrentUser] = useState<User | null>(() => mockAuth.getCurrentUser())
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(() => mockAuth.getCurrentWorkspace())
  const [isAuthLoading, setIsAuthLoading] = useState(() => !(mockAuth.getCurrentUser() && mockAuth.getCurrentWorkspace()))
  const [contacts, setContacts] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [initialUserId, setInitialUserId] = useState<string | null>(null)
  const [hasLoadedContacts, setHasLoadedContacts] = useState(false)
  const { toast } = useToast()
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [totalUnreadCount, setTotalUnreadCount] = useState(0)
  const isLoadingContactsRef = useRef(false)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)
  const isMobile = useIsMobile()

  const loadContacts = useCallback(async (forceRefresh = false, showLoading = true) => {
    if (!currentUser) return

    // Prevent duplicate concurrent requests
    if (isLoadingContactsRef.current && !forceRefresh) {
      console.log('Contacts already loading, skipping...')
      return
    }

    // OPTIMIZED: Use cache to avoid frequent API calls
    const cacheKey = `contacts_${currentUser.id}`
    const cacheTsKey = `contacts_timestamp_${currentUser.id}`
    const CACHE_DURATION = 2 * 60 * 1000 // 2 minutes cache

    // Check cache first (unless force refresh)
    if (!forceRefresh && typeof window !== 'undefined') {
      const cachedContacts = localStorage.getItem(cacheKey)
      const cachedTs = localStorage.getItem(cacheTsKey)
      
      if (cachedContacts && cachedTs) {
        const age = Date.now() - parseInt(cachedTs, 10)
        if (age < CACHE_DURATION) {
            try {
            const contactUsers = JSON.parse(cachedContacts)
            // Ensure _is_favorite is preserved from cache
            setContacts(contactUsers.map((u: any) => ({ ...u, _is_favorite: u._is_favorite || false })))
            setHasLoadedContacts(true)
            setIsLoading(false)
            console.log('✅ Loaded contacts from cache')
            return
          } catch (e) {
            console.warn('⚠️ Failed to parse cached contacts, fetching fresh')
          }
        }
      }
    }

    // Avoid duplicate requests (but allow if we only have cached data and want fresh)
    if (hasLoadedContacts && !forceRefresh && contacts.length > 0) {
      return
    }

    isLoadingContactsRef.current = true

    // Add timeout to prevent hanging (defined outside try block so finally can access it)
    let timeoutId: NodeJS.Timeout | null = null

    try {
      // Set loading state BEFORE starting the request (only if showLoading is true)
      if (showLoading) {
        setIsLoading(true)
      }
      // Clear contacts immediately to prevent showing stale data
      if (forceRefresh) {
        setContacts([])
      }
      
      // Set timeout warning after 10 seconds
      timeoutId = setTimeout(() => {
        console.warn('⚠️ Contacts API request taking too long (>10s)')
        toast({
          title: 'Loading contacts',
          description: 'This is taking longer than expected. Please wait...',
          variant: 'default',
        })
      }, 10000)
      
      let response: Response
      try {
        const startTime = Date.now()
        response = await fetch('/api/contacts')
        const duration = Date.now() - startTime
        console.log(`⏱️ Contacts API request took ${duration}ms`)
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = null
      } catch (networkError) {
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = null
        // 纯网络错误（dev 服务器重启、临时断网等），不要再往外抛，让页面保持可用
        console.warn('Load contacts network error (will skip quietly):', networkError)
        setIsLoading(false)
        isLoadingContactsRef.current = false
        toast({
          title: 'Network error',
          description: 'Failed to load contacts. Please try again.',
          variant: 'destructive',
        })
        return
      }

      let data: any = {}
      try {
        data = await response.json()
      } catch {
        // 非 JSON 响应，尽量不让它变成大红错
        data = {}
      }

      if (!response.ok) {
        // If unauthorized, redirect to login
        if (response.status === 401) {
          console.error('Unauthorized - redirecting to login')
          router.push('/login')
          return
        }
        throw new Error(data.error || 'Failed to load contacts')
      }

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
      
      // 默认把"自己"也放进联系人里，方便从联系人页给自己发消息
      if (currentUser) {
        const exists = contactUsers.some((u: any) => u.id === currentUser.id)
        if (!exists) contactUsers = [{ ...currentUser, _is_favorite: false }, ...contactUsers]
      }
      
      // Update cache
      if (typeof window !== 'undefined') {
        localStorage.setItem(cacheKey, JSON.stringify(contactUsers))
        localStorage.setItem(cacheTsKey, Date.now().toString())
      }
      
      // Set contacts and loading state together to prevent flickering
      setContacts(contactUsers)
      setHasLoadedContacts(true)
      setIsLoading(false)
      console.log('✅ Loaded contacts from API and updated cache')
    } catch (error) {
      console.error('Load contacts error:', error)
      // If unauthorized error, redirect to login
      if (error instanceof Error && error.message.includes('Unauthorized')) {
        router.push('/login')
        return
      }
      setContacts([])
      setIsLoading(false)
    } finally {
      // Always clear timeout and reset loading flag
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      isLoadingContactsRef.current = false
    }
  }, [router, currentUser, hasLoadedContacts])

  useEffect(() => {
    let isMounted = true
    
    const checkAuth = async () => {
      const deploymentRegion = IS_DOMESTIC_VERSION ? 'CN' : 'INTL'

      console.log('🔍 [CONTACTS PAGE] checkAuth - Deployment region:', deploymentRegion)

      // For China region, skip Supabase session check
      if (deploymentRegion === 'CN') {
        console.log('🔍 [CONTACTS PAGE] CN region - skipping Supabase session check')
        // Check localStorage for user and workspace
        const user = mockAuth.getCurrentUser()
        const workspace = mockAuth.getCurrentWorkspace()

        console.log('🔍 [CONTACTS PAGE] CN region - User and workspace check:', {
          hasUser: !!user,
          userId: user?.id,
          hasWorkspace: !!workspace,
          workspaceId: workspace?.id
        })

        if (!isMounted) return

        if (!user || !workspace) {
          console.error('❌ [CONTACTS PAGE] CN region - Missing user or workspace, redirecting to login')
          setIsAuthLoading(false)
          router.push('/login')
          return
        }

        console.log('✅ [CONTACTS PAGE] CN region - User and workspace verified')
        setCurrentUser(user)
        setCurrentWorkspace(workspace)
        setIsAuthLoading(false)

        // Get userId from URL parameter
        const userId = searchParams.get('userId')
        if (userId) {
          setInitialUserId(userId)
        }
      } else {
        // For international region, check Supabase session
        console.log('🔍 [CONTACTS PAGE] International region - checking Supabase session')
        const { hasValidSession } = await import('@/lib/supabase/auth-check')
        const hasSession = await hasValidSession()

        if (!isMounted) return

        if (!hasSession) {
          console.error('❌ [CONTACTS PAGE] No valid Supabase session - redirecting to login')
          setIsAuthLoading(false)
          router.push('/login')
          return
        }

        console.log('✅ [CONTACTS PAGE] Valid Supabase session found')

        // Check localStorage for user and workspace
        const user = mockAuth.getCurrentUser()
        const workspace = mockAuth.getCurrentWorkspace()

        if (!isMounted) return

        if (!user || !workspace) {
          console.error('❌ [CONTACTS PAGE] Missing user or workspace, redirecting to login')
          setIsAuthLoading(false)
          router.push('/login')
          return
        }

        console.log('✅ [CONTACTS PAGE] User and workspace verified')
        setCurrentUser(user)
        setCurrentWorkspace(workspace)
        setIsAuthLoading(false)

        // Get userId from URL parameter
        const userId = searchParams.get('userId')
        if (userId) {
          setInitialUserId(userId)
        }
      }
    }
    
    checkAuth()
    
    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  // Check cache immediately on mount to show cached contacts instantly
  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') return
    // Only run once on mount, don't re-run when contacts change
    if (contacts.length > 0) return // Already have contacts, skip
    
    const cacheKey = `contacts_${currentUser.id}`
    const cacheTsKey = `contacts_timestamp_${currentUser.id}`
    const CACHE_DURATION = 2 * 60 * 1000 // 2 minutes cache
    
    try {
      const cachedContacts = localStorage.getItem(cacheKey)
      const cachedTs = localStorage.getItem(cacheTsKey)
      
      if (cachedContacts && cachedTs) {
        const age = Date.now() - parseInt(cachedTs, 10)
        if (age < CACHE_DURATION) {
          try {
            const contactUsers = JSON.parse(cachedContacts)
            if (contactUsers && contactUsers.length > 0) {
              // Immediately show cached contacts, no loading screen
              console.log('📦 Found cached contacts on mount, displaying immediately:', contactUsers.length)
              setContacts(contactUsers.map((u: any) => ({ ...u, _is_favorite: u._is_favorite || false })))
              setHasLoadedContacts(true)
              setIsLoading(false) // Hide loading immediately
              console.log('✅ Displayed cached contacts immediately on mount')
            }
          } catch (e) {
            console.warn('Failed to parse cached contacts on mount:', e)
          }
        }
      }
    } catch (error) {
      console.error('Error checking cache on mount:', error)
    }
  }, [currentUser])

  // Load contacts when currentUser is available
  useEffect(() => {
    if (currentUser && !hasLoadedContacts && !isLoadingContactsRef.current) {
      loadContacts()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]) // Load when currentUser is set

  // 确保"自己"一定在联系人列表里（处理第一次加载时 currentUser 还没注入的情况）
  useEffect(() => {
    if (!currentUser || contacts.length === 0) return
    const exists = contacts.some(u => u.id === currentUser.id)
    if (!exists) {
      setContacts(prev => {
        // 再检查一次，避免竞态条件
        const alreadyExists = prev.some(u => u.id === currentUser.id)
        return alreadyExists ? prev : [currentUser, ...prev]
      })
    }
  }, [currentUser, contacts])

  // Calculate total unread count from all conversations (including direct messages)
  useEffect(() => {
    if (!currentUser || !currentWorkspace || typeof window === 'undefined') {
      setTotalUnreadCount(0)
      return
    }

    const calculateUnreadCount = () => {
      try {
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
      } catch (e) {
        console.warn('Failed to read cached conversations for unread count:', e)
      }
    }

    // Initial calculation
    calculateUnreadCount()

    // Poll for updates every 5 seconds
    const interval = setInterval(() => {
      calculateUnreadCount()
    }, 5000)

    // Listen to storage events and custom events
    const handleStorageChange = (e: StorageEvent) => {
      const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
      if (e.key === cacheKey && e.newValue) {
        calculateUnreadCount()
      }
    }

    const handleCustomStorage = () => {
      setTimeout(() => {
        calculateUnreadCount()
      }, 0)
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('conversationsUpdated', handleCustomStorage)

    return () => {
      clearInterval(interval)
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('conversationsUpdated', handleCustomStorage)
    }
  }, [currentUser, currentWorkspace])

  if (isAuthLoading || !currentUser || !currentWorkspace) {
    return (
      <div className="flex items-center justify-center h-screen text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

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

  const handleStartChat = async (userId: string, callType?: 'voice' | 'video') => {
    if (!currentUser || !currentWorkspace) return
    
    try {
      // 自己给自己发消息：特殊处理，避免误跳到“和别人”的对话
      if (userId === currentUser.id) {
        console.log('👤 Starting self-chat...')
        const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
        const cachedData = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null

        if (cachedData) {
          try {
            const cachedConversations = JSON.parse(cachedData)
            // 优先找“只包含自己一个人的 direct 会话”（真正的自聊）
            const selfConv = cachedConversations.find((conv: any) => {
              if (conv.type !== 'direct' || !conv.members) return false
              const memberIds = conv.members.map((m: any) => m.id || m)
              return memberIds.length === 1 && memberIds[0] === currentUser.id
            })

            if (selfConv) {
              console.log('✅ Self conversation found in cache, jumping immediately:', selfConv.id)
              router.push(buildChatUrl({ conversationId: selfConv.id, callType }))
              return
            }
          } catch (error) {
            console.error('Error reading cache for self conversation:', error)
          }
        }

        // 没有自聊会话，就创建一个只包含自己的 direct 会话
        console.log('📤 Creating new self conversation for userId:', userId)
        const response = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'direct',
            member_ids: [currentUser.id],
            skip_contact_check: true,
          }),
        })

        const data = await response.json()
        if (data.success && data.conversation) {
          console.log('✅ Self conversation created successfully:', data.conversation.id)

          // 更新缓存，保证刷新后还能看到
          if (typeof window !== 'undefined') {
            const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
            const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`
            const cachedData = localStorage.getItem(cacheKey)

            try {
              const cachedConversations = cachedData ? JSON.parse(cachedData) : []
              const exists = cachedConversations.some((c: any) => c.id === data.conversation.id)
              const updated = exists
                ? cachedConversations.map((c: any) =>
                    c.id === data.conversation.id ? data.conversation : c
                  )
                : [data.conversation, ...cachedConversations]

              localStorage.setItem(cacheKey, JSON.stringify(updated))
              localStorage.setItem(cacheTimestampKey, Date.now().toString())
            } catch (error) {
              console.error('Error updating cache for self conversation:', error)
              localStorage.setItem(cacheKey, JSON.stringify([data.conversation]))
              localStorage.setItem(
                cacheTimestampKey,
                Date.now().toString()
              )
            }
          }

          router.push(buildChatUrl({ conversationId: data.conversation.id, callType }))
          return
        } else {
          console.error('Failed to create self conversation:', data.error)
          alert(data.error || 'Failed to create self conversation')
          return
        }
      }

      // 普通联系人：先查缓存有没有现成的 direct 会话
      console.log('📤 Creating / reusing conversation for userId:', userId)
      const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
      const cachedData = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null
      
      if (cachedData) {
        try {
          const cachedConversations = JSON.parse(cachedData)
          // Find existing direct conversation with this user（两个人的私聊）
          const existingConv = cachedConversations.find((conv: any) => {
            if (conv.type !== 'direct' || !conv.members || conv.members.length !== 2) return false
            const memberIds = conv.members.map((m: any) => m.id || m)
            return memberIds.includes(currentUser.id) && memberIds.includes(userId)
          })
          
          if (existingConv) {
            // Conversation exists - jump immediately
            console.log('✅ Conversation found in cache, jumping immediately:', existingConv.id)
            // Pre-store conversation for instant display on chat page
            sessionStorage.setItem('pending_conversation', JSON.stringify(existingConv))
            router.push(buildChatUrl({ conversationId: existingConv.id, callType }))
            return
          }
        } catch (error) {
          console.error('Error reading cache:', error)
        }
      }
      
      // Conversation doesn't exist - jump immediately, let chat page create it
      console.log('📤 Jumping to chat page, will create conversation there for userId:', userId)
      
      // Store target user info for chat page to use
      const targetUser = contacts.find(c => c.id === userId)
      if (targetUser) {
        sessionStorage.setItem('pending_chat_user', JSON.stringify(targetUser))
      }
      
      // Jump immediately - chat page will handle conversation creation
      router.push(buildChatUrl({ userId, callType }))
      return
    } catch (error) {
      console.error('Error in handleStartChat:', error)
    }
  }

  const handleStartVoiceCall = useCallback((userId: string) => {
    void handleStartChat(userId, 'voice')
  }, [handleStartChat])

  const handleStartVideoCall = useCallback((userId: string) => {
    void handleStartChat(userId, 'video')
  }, [handleStartChat])

  // Legacy code - keeping for reference but not used anymore
  const _legacyCreateConversation = async (userId: string) => {
    if (!currentUser || !currentWorkspace) return
    
    const response = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'direct',
        member_ids: [userId],
        skip_contact_check: true,
      }),
    })

    const data = await response.json()
    if (data.success && data.conversation) {
      console.log('✅ Conversation created successfully:', data.conversation.id)
      
      if (typeof window !== 'undefined') {
        const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
        const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`
        const cachedData = localStorage.getItem(cacheKey)
        
        try {
          const cachedConversations = cachedData ? JSON.parse(cachedData) : []
          const exists = cachedConversations.some((c: any) => c.id === data.conversation.id)
          if (!exists) {
            const updated = [data.conversation, ...cachedConversations]
            localStorage.setItem(cacheKey, JSON.stringify(updated))
            localStorage.setItem(cacheTimestampKey, Date.now().toString())
          } else {
            const updated = cachedConversations.map((c: any) => 
              c.id === data.conversation.id ? data.conversation : c
            )
            localStorage.setItem(cacheKey, JSON.stringify(updated))
            localStorage.setItem(cacheTimestampKey, Date.now().toString())
          }
        } catch (error) {
          console.error('Error updating cache:', error)
          localStorage.setItem(cacheKey, JSON.stringify([data.conversation]))
          localStorage.setItem(cacheTimestampKey, Date.now().toString())
        }
      }
      router.push(`/chat?conversation=${data.conversation.id}`)
    }
  }

  const handleAddContact = async (userId: string, message?: string) => {
    if (!currentUser) {
      console.error('[好友请求] 用户未登录')
      return
    }

    console.log('[好友请求] 开始发送请求:', { userId, currentUser: currentUser.id })

    try {
      // Send contact request instead of directly adding
      const response = await fetch('/api/contact-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient_id: userId,
          message: message || `Hi! I'd like to add you as a contact.`,
        }),
      })

      console.log('[好友请求] 响应状态:', response.status, response.ok)
      
      let data: any = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }

      console.log('[AddContact] /api/contact-requests response:', {
        ok: response.ok,
        status: response.status,
        data,
      })
      console.log('[AddContact] 详细错误信息:', JSON.stringify(data, null, 2))

      if (!response.ok) {
        // Provide more user-friendly error messages（仅用页面内 toast 提示，不再使用浏览器 alert）
        let title = '发送好友请求失败'
        let description = data.error || '发送好友请求失败'

        if (data.error === 'Cannot send request to yourself') {
          description = '不能添加自己为好友，请扫描其他用户的二维码'
        } else if (data.errorType === 'sent_pending') {
          title = '好友请求已发送'
          description = '您已经向该用户发送过好友请求，请在"待处理"列表中查看请求状态。'
        } else if (data.errorType === 'received_pending') {
          title = '该用户已发送请求'
          description = '该用户已经向您发送了好友请求，请在"待处理"列表中接受请求。'
        } else if (data.error === 'Contact already exists') {
          title = '已是好友'
          description = '该用户已经在您的联系人列表中。'
        }

        console.log('[Toast] 准备显示toast:', { title, description, variant: data.errorType === 'sent_pending' || data.errorType === 'received_pending' ? 'default' : 'destructive' })

        // 临时使用alert确保用户能看到提示
        alert(`${title}\n\n${description}`)

        toast({
          title,
          description,
          variant: data.errorType === 'sent_pending' || data.errorType === 'received_pending' ? 'default' : 'destructive',
        })
        console.log('[Toast] toast已调用')
        return
      }

      toast({
        title: 'Contact request sent',
        description: 'Your contact request has been sent successfully.',
      })

      // 再给你一个居中大弹窗，和支付成功那种感觉一样明显
      setShowSuccessDialog(true)
    } catch (error: any) {
      console.error('Add contact error:', error)
      toast({
        title: 'Failed to send contact request',
        description: error.message || 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleAddManualContact = async (contactData: {
    full_name: string
    email: string
    phone?: string
    company?: string
    notes?: string
  }) => {
    if (!currentUser) return
    
    // For manual contacts, we need to search for the user by email first
    // or create a manual contact entry
    try {
      // Try to find user by email
      const searchResponse = await fetch(`/api/users/search?q=${encodeURIComponent(contactData.email)}`)
      const searchData = await searchResponse.json()

      if (searchResponse.ok && searchData.users && searchData.users.length > 0) {
        // User exists, add as contact
        const user = searchData.users[0]
        await handleAddContact(user.id)
      } else {
        // User doesn't exist, show error or create manual contact
        alert('User not found. Please search for existing users by email or username.')
      }
    } catch (error: any) {
      console.error('Add manual contact error:', error)
      alert(error.message || 'Failed to add contact')
    }
  }

  const handleDeleteContact = async (userId: string) => {
    if (!currentUser || !currentWorkspace) return
    
    // OPTIMISTIC UPDATE: Immediately remove contact from UI
    const contactToDelete = contacts.find(c => c.id === userId)
    setContacts(prev => prev.filter(c => c.id !== userId))
    
    // Also clear selected user if it's the one being deleted
    // (This will be handled by ContactsPanel, but we can also do it here for safety)
    
    try {
      const response = await fetch(`/api/contacts?contact_user_id=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      })
      
      let data: any = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }

      if (!response.ok) {
        // ROLLBACK: Restore contact if deletion failed
        if (contactToDelete) {
          setContacts(prev => {
            // Check if already exists (avoid duplicates)
            const exists = prev.some(c => c.id === contactToDelete.id)
            return exists ? prev : [...prev, contactToDelete]
          })
        }
        toast({
          title: 'Failed to delete contact',
          description: data.error || 'Unknown error',
          variant: 'destructive',
        })
        return
      }

      // Get conversation ID from API response (if available)
      const deletedConversationId = data.deletedConversationId

      // Also try to find conversation from cache as fallback
      let conversationIdToDelete = deletedConversationId
      if (!conversationIdToDelete) {
        try {
          const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
          const cachedData = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null
          
          if (cachedData) {
            const cachedConversations = JSON.parse(cachedData)
            const directConv = cachedConversations.find((conv: any) => {
              if (conv.type !== 'direct' || !conv.members || conv.members.length !== 2) return false
              const memberIds = conv.members.map((m: any) => m.id || m)
              return memberIds.includes(currentUser.id) && memberIds.includes(userId)
            })
            if (directConv) {
              conversationIdToDelete = directConv.id
            }
          }
        } catch (cacheError) {
          console.error('Error reading cached conversations:', cacheError)
        }
      }

      // Update cache and deleted list if we found a conversation
      if (conversationIdToDelete && typeof window !== 'undefined') {
        const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
        const cachedData = localStorage.getItem(cacheKey)
        
        if (cachedData) {
          try {
            const cachedConversations = JSON.parse(cachedData)
            const filtered = cachedConversations.filter((c: any) => c.id !== conversationIdToDelete)
            filtered.length
              ? localStorage.setItem(cacheKey, JSON.stringify(filtered))
              : localStorage.removeItem(cacheKey)
            const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`
            localStorage.setItem(cacheTimestampKey, Date.now().toString())
          } catch (e) {
            console.error('Error updating cache:', e)
          }
        }
        
        // CRITICAL: Add conversation ID to deleted_conversations list
        const deletedKey = `deleted_conversations_${currentUser.id}_${currentWorkspace.id}`
        const deletedConversations = JSON.parse(localStorage.getItem(deletedKey) || '[]')
        if (!deletedConversations.includes(conversationIdToDelete)) {
          deletedConversations.push(conversationIdToDelete)
          localStorage.setItem(deletedKey, JSON.stringify(deletedConversations))
          // Store deletion timestamp to prevent cleanup logic from removing it too soon
          const deletionTimestampKey = `deletion_timestamp_${conversationIdToDelete}_${currentUser.id}_${currentWorkspace.id}`
          localStorage.setItem(deletionTimestampKey, Date.now().toString())
          console.log(`✅ Added conversation ${conversationIdToDelete} to deleted_conversations list`)
        }
      }

      // Clear contacts cache
      if (typeof window !== 'undefined' && currentUser) {
        const cacheKey = `contacts_${currentUser.id}`
        const cacheTsKey = `contacts_timestamp_${currentUser.id}`
        localStorage.removeItem(cacheKey)
        localStorage.removeItem(cacheTsKey)
      }

      toast({
        title: 'Contact deleted',
        description: 'The contact and conversation have been removed.',
      })

      // Trigger a custom event to notify chat page to refresh conversations
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('contactDeleted', { 
          detail: { 
            contactUserId: userId,
            conversationId: conversationIdToDelete || null,
          } 
        }))
      }

      // Background refresh: Silently refresh contacts list to ensure consistency
      // Don't show loading state, just update in background
      // Use a separate function that doesn't trigger loading state
      const refreshContactsSilently = async () => {
        if (!currentUser) return
        
        // CRITICAL: Ensure loading state is NOT set during background refresh
        // The optimistic update already removed the contact from UI, so we don't want to show loading
        
        try {
          const response = await fetch('/api/contacts')
          if (response.ok) {
            const data = await response.json()
            let contactUsers = (data.contacts || []).map((contact: any) => contact.user).filter(Boolean)
            if (currentUser) {
              const exists = contactUsers.some((u: any) => u.id === currentUser.id)
              if (!exists) contactUsers = [currentUser, ...contactUsers]
            }
            // Update contacts silently without triggering loading state
            // Only update if we got valid data (don't overwrite with empty array if API fails)
            if (contactUsers.length >= 0) {
              setContacts(contactUsers)
              // Update cache
              if (typeof window !== 'undefined') {
                const cacheKey = `contacts_${currentUser.id}`
                const cacheTsKey = `contacts_timestamp_${currentUser.id}`
                localStorage.setItem(cacheKey, JSON.stringify(contactUsers))
                localStorage.setItem(cacheTsKey, Date.now().toString())
              }
            }
          }
        } catch (error) {
          console.error('Background refresh failed after contact deletion:', error)
          // Don't show error to user, optimistic update already succeeded
          // Don't rollback either - optimistic update is the source of truth
        }
      }
      
      // Run background refresh without showing loading
      refreshContactsSilently()
    } catch (error: any) {
      // ROLLBACK: Restore contact if deletion failed
      if (contactToDelete) {
        setContacts(prev => {
          const exists = prev.some(c => c.id === contactToDelete.id)
          return exists ? prev : [...prev, contactToDelete]
        })
      }
      console.error('Delete contact error:', error)
      toast({
        title: 'Failed to delete contact',
        description: error.message || 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <>
      <div className="flex h-screen flex-col">
        <WorkspaceHeader
          workspace={currentWorkspace}
          currentUser={currentUser}
          totalUnreadCount={totalUnreadCount}
        />
        <div className="relative flex flex-1 min-w-0 overflow-hidden">
          {/* 左侧导航栏（仅桌面端显示） */}
          {!isMobile && <AppNavigation totalUnreadCount={totalUnreadCount} />}
          <div className="min-w-0 flex-1 overflow-hidden">
            <ContactsPanel
              users={contacts}
              currentUser={currentUser}
              onStartChat={handleStartChat}
              onStartVoiceCall={handleStartVoiceCall}
              onStartVideoCall={handleStartVideoCall}
              onAddContact={handleAddContact}
              onAddManualContact={handleAddManualContact}
              onDeleteContact={handleDeleteContact}
              allUsers={[]}
              isLoading={isLoading}
              onContactAccepted={() => {
                // Clear cache when contact is accepted
                if (typeof window !== 'undefined' && currentUser) {
                  const cacheKey = `contacts_${currentUser.id}`
                  const cacheTsKey = `contacts_timestamp_${currentUser.id}`
                  localStorage.removeItem(cacheKey)
                  localStorage.removeItem(cacheTsKey)
                }
                // Don't set hasLoadedContacts to false - this would trigger full reload
                // Instead, do a background refresh without showing loading
                loadContacts(false, false) // forceRefresh = false, showLoading = false (silent refresh)
              }}
              initialUserId={initialUserId}
            />
          </div>
        </div>
        {isMobile && (
          <AppNavigation totalUnreadCount={totalUnreadCount} mobile />
        )}
      </div>

      {/* Add-contact success dialog，风格对齐支付成功弹窗 */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('contactRequestSent')}</DialogTitle>
            <DialogDescription>
              {t('contactRequestSentDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowSuccessDialog(false)}>{t('ok')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default ContactsPageContent
