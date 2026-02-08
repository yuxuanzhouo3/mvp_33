'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User, Workspace } from '@/lib/types'
import { Building2, ChevronDown, Settings, LogOut, Bell, Hash, UsersIcon, MessageSquare } from 'lucide-react'
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

interface WorkspaceHeaderProps {
  workspace: Workspace
  currentUser: User
  totalUnreadCount?: number
}

export function WorkspaceHeader({ workspace, currentUser, totalUnreadCount: propTotalUnreadCount = 0 }: WorkspaceHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useSettings()
  const { subscription } = useSubscription()
  // Initialize with prop value, but real-time updates will override it
  const [realTimeUnreadCount, setRealTimeUnreadCount] = useState<number | undefined>(propTotalUnreadCount)

  // Calculate unread count from cache (for pages that don't pass it, or as fallback)
  // This ensures real-time updates work even if prop is not provided
  useEffect(() => {
    if (!currentUser || !workspace || typeof window === 'undefined') return

    const calculateFromCache = () => {
      try {
        const cacheKey = `conversations_${currentUser.id}_${workspace.id}`
        const cachedData = localStorage.getItem(cacheKey)
        if (cachedData) {
          const cachedConversations = JSON.parse(cachedData)
          
          // CRITICAL: When on /chat page, only count unread for conversations that are NOT currently selected
          // This ensures that clicking message icon doesn't clear unread count
          // Only when user clicks a specific conversation should that conversation's unread count be cleared
          // BUT: When NOT on chat page (contacts, channels), count ALL unread messages
          const isChatPage = typeof window !== 'undefined' && window.location.pathname === '/chat'
          
          // CRITICAL: Only exclude a conversation's unread_count if it's explicitly selected in the URL
          // We should NOT use localStorage as a fallback here, because:
          // 1. When user switches from contacts/channels to chat page, localStorage may have old values
          // 2. User hasn't clicked any conversation yet, so we should count ALL unread messages
          // 3. Only when URL has conversation parameter should we exclude it from unread count
          let selectedConvId: string | null = null
          if (isChatPage && typeof window !== 'undefined') {
            // ONLY check URL - don't use localStorage as fallback
            // This ensures that when user first enters chat page, all unread messages are counted
            // Only after user explicitly clicks a conversation (URL updates) should we exclude it
            selectedConvId = new URLSearchParams(window.location.search).get('conversation')
          }
          
          // Count only direct messages, exclude channels and groups
          // If on chat page, exclude the currently selected conversation from unread count
          // If NOT on chat page, count ALL unread messages (user hasn't selected any conversation yet)
          const count = cachedConversations
            .filter((conv: any) => conv.type === 'direct')
            .filter((conv: any) => {
              // If on chat page and a conversation is selected, exclude it from unread count
              // Otherwise (not on chat page or no conversation selected), count all unread messages
              if (isChatPage && selectedConvId && conv.id === selectedConvId) {
                return false // Don't count selected conversation
              }
              return true // Count all other conversations
            })
            .reduce((sum: number, conv: any) => sum + (conv.unread_count || 0), 0)
          
          // Update from cache - this will be used if prop is not provided or is stale
          // CRITICAL: Always update realTimeUnreadCount to ensure it's up-to-date
          // This ensures the count is always up-to-date on all pages
          // Only update if count actually changed to avoid unnecessary re-renders and flickering
          setRealTimeUnreadCount(prev => {
            if (prev !== count) {
              console.log('📊 WorkspaceHeader: Updated unread count from cache:', count, '(was:', prev, ')', {
                isChatPage,
                selectedConvId,
                totalConversations: cachedConversations.length
              })
              return count
            }
            return prev // Keep previous value to avoid flickering
          })
        }
      } catch (e) {
        console.warn('Failed to read cached conversations for unread count:', e)
      }
    }

    // Calculate immediately
    calculateFromCache()

    // Listen for storage changes (when chat page updates cache)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith(`conversations_${currentUser.id}_${workspace.id}`)) {
        setTimeout(() => {
          calculateFromCache()
        }, 0)
      }
    }

    window.addEventListener('storage', handleStorageChange)

    // Also listen for custom events (for same-tab updates)
    // Use setTimeout to defer state updates to avoid "Cannot update component while rendering" error
    const handleCustomStorage = () => {
      // Defer the state update to the next event loop to avoid updating during render
      // Use a small delay to ensure cache is updated before reading
      setTimeout(() => {
        calculateFromCache()
      }, 50) // Small delay to ensure cache is updated
    }
    window.addEventListener('conversationsUpdated', handleCustomStorage)
    
    // CRITICAL: On all pages, sync periodically to catch updates
    // On chat page: sync from cache (chat page's realtime updates the cache)
    // On other pages: sync from cache (workspace-header's realtime updates the cache)
    // This ensures the header badge stays in sync on all pages
    // Use shorter interval on non-chat pages to ensure real-time updates are visible immediately
    const isChatPage = typeof window !== 'undefined' && window.location.pathname === '/chat'
    // CRITICAL: On non-chat pages, sync more frequently to catch real-time updates
    // The realtime subscription should handle most updates, but this is a backup
    const syncInterval = setInterval(() => {
      calculateFromCache()
    }, isChatPage ? 1000 : 200) // Sync very frequently on non-chat pages (200ms) to catch updates immediately

    return () => {
      if (syncInterval) {
        clearInterval(syncInterval)
      }
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('conversationsUpdated', handleCustomStorage)
    }
  }, [currentUser, workspace])

  // Use prop value as initial state, but real-time updates will override it
  // CRITICAL: Always sync from prop when it changes, but real-time updates take precedence
  useEffect(() => {
    // If realTimeUnreadCount hasn't been set yet (initial load), use prop
    // Otherwise, only update if prop is significantly different (to avoid flickering)
    if (realTimeUnreadCount === undefined) {
      setRealTimeUnreadCount(propTotalUnreadCount)
    } else if (propTotalUnreadCount !== realTimeUnreadCount) {
      // If prop is different, it might be from a page refresh or cache update
      // Only update if the difference is significant (more than 1) to avoid flickering
      // Or if prop is 0 and realTime is not 0 (might be stale)
      const diff = Math.abs(propTotalUnreadCount - realTimeUnreadCount)
      if (diff > 1 || (propTotalUnreadCount === 0 && realTimeUnreadCount > 0)) {
        console.log('📊 WorkspaceHeader: Syncing from prop due to significant difference:', {
          prop: propTotalUnreadCount,
          realTime: realTimeUnreadCount,
          diff
        })
        setRealTimeUnreadCount(propTotalUnreadCount)
      }
    }
  }, [propTotalUnreadCount, realTimeUnreadCount])

  // Real-time subscription for new messages (Supabase only)
  useEffect(() => {
    if (!currentUser || !workspace) return

    // Only subscribe if we're using Supabase (check if we can create a client)
    let supabase: ReturnType<typeof createClient> | null = null
    try {
      supabase = createClient()
      if (!supabase) {
        console.warn('⚠️ WorkspaceHeader: Failed to create Supabase client')
        return
      }
    } catch (e) {
      // CloudBase region or Supabase not configured, skip real-time subscription
      console.warn('⚠️ WorkspaceHeader: Cannot create Supabase client, skipping realtime subscription:', e)
      return
    }

    console.log('🔔 Setting up real-time unread count subscription in WorkspaceHeader')
    
    // CRITICAL: This subscription works on ALL pages (contacts, channels, chat, etc.)
    // It listens to new messages and updates the unread count badge in real-time

    // CRITICAL: Use a unique channel name with timestamp to avoid conflicts
    // Also add presence to keep the connection alive
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
          // CRITICAL: Don't filter at database level - filter in callback instead
          // Database-level filters might not work correctly in all Supabase versions
          // and can cause messages to be missed
        },
        async (payload) => {
          const newMessage = payload.new as any
          
          console.log('📨 WorkspaceHeader: Received realtime message event:', {
            messageId: newMessage.id,
            conversationId: newMessage.conversation_id,
            senderId: newMessage.sender_id,
            currentUserId: currentUser.id,
            content: newMessage.content?.substring(0, 50),
            pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
            channelName
          })
          
          // Only count messages not from current user
          if (newMessage.sender_id === currentUser.id) {
            console.log('⏭️ WorkspaceHeader: Skipping self-sent message')
            return
          }
          
          // CRITICAL: Don't skip welcome messages - they should show unread notifications
          // Welcome messages ("We are now friends.") are sent by the system/other user
          // and should be counted as unread messages, especially on non-chat pages
          
          // Check if user is a member of this conversation
          // Note: Even if membership check fails, we should still try to update the unread count
          // because the message was sent to a conversation the user might be part of
          // CRITICAL: For welcome messages (when friend request is accepted), the conversation might be newly created
          // and membership check might fail initially, but we should still process the message
          let isMember = false
          try {
            const { data: membership, error: membershipError } = await supabase!
              .from('conversation_members')
              .select('conversation_id')
              .eq('conversation_id', newMessage.conversation_id)
              .eq('user_id', currentUser.id)
              .is('deleted_at', null)
              .maybeSingle()
            
            if (membershipError) {
              console.warn('⚠️ WorkspaceHeader: Failed to check membership, proceeding anyway:', membershipError)
            }
            
            isMember = !!membership
          } catch (membershipCheckError) {
            console.warn('⚠️ WorkspaceHeader: Error checking membership, proceeding anyway:', membershipCheckError)
            // Continue processing - membership check failure shouldn't block unread count updates
            // This is especially important for welcome messages when friend request is accepted
          }
          
          // CRITICAL: For welcome messages or newly created conversations, always process the message
          // even if membership check failed, because the message exists and should be counted
          const isWelcomeMessage = newMessage.content === 'We are now friends.' || 
            (newMessage.metadata && newMessage.metadata.is_welcome_message)
          
          if (isWelcomeMessage && !isMember) {
            console.log('📊 WorkspaceHeader: Welcome message detected, processing even if membership check failed:', newMessage.id)
            // Force process welcome messages even if membership check failed
            // This ensures that when friend request is accepted, the unread notification is shown
          }

          // CRITICAL: On chat page, don't process here - let chat page handle it
          // We'll sync from cache instead to avoid double counting
          // BUT: On other pages (contacts, channels), we MUST process here to show real-time updates
          const isChatPage = typeof window !== 'undefined' && window.location.pathname === '/chat'
          
          console.log('📊 WorkspaceHeader: Processing message, isChatPage:', isChatPage, {
            messageId: newMessage.id,
            conversationId: newMessage.conversation_id,
            pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown'
          })
          
          if (isChatPage) {
            // On chat page, just sync from cache after a short delay
            // Chat page's realtime subscription will update the cache
            setTimeout(() => {
              const cacheKey = `conversations_${currentUser.id}_${workspace.id}`
              const cachedData = localStorage.getItem(cacheKey)
              if (cachedData) {
                try {
                  const cachedConversations = JSON.parse(cachedData)
                  
                  // CRITICAL: When on /chat page, only count unread for conversations that are NOT currently selected
                  // This ensures that clicking message icon doesn't clear unread count
                  // Only when user clicks a specific conversation should that conversation's unread count be cleared
                  const selectedConvId = typeof window !== 'undefined' 
                    ? new URLSearchParams(window.location.search).get('conversation') 
                    : null
                  
                  // Count only direct messages, exclude channels and groups
                  // Exclude the currently selected conversation from unread count
                  const count = cachedConversations
                    .filter((conv: any) => conv.type === 'direct')
                    .filter((conv: any) => {
                      // If a conversation is selected, exclude it from unread count
                      if (selectedConvId && conv.id === selectedConvId) {
                        return false // Don't count selected conversation
                      }
                      return true
                    })
                    .reduce((sum: number, conv: any) => sum + (conv.unread_count || 0), 0)
                  
                  setRealTimeUnreadCount(prev => {
                    if (prev !== count) {
                      console.log('📊 WorkspaceHeader: Synced unread count from cache (chat page active):', count, {
                        selectedConvId,
                        totalConversations: cachedConversations.length
                      })
                      return count
                    }
                    return prev
                  })
                } catch (e) {
                  console.warn('Failed to sync unread count from cache:', e)
                }
              }
            }, 100) // Wait 100ms for chat page to update cache
            return
          }
          
          // On other pages (contacts, channels), process the message normally
          // Update cache and recalculate
          // IMPORTANT: Process even if membership check failed - the message exists and should be counted
          // CRITICAL: This is the ONLY way to show real-time updates on non-chat pages
          console.log('📊 WorkspaceHeader: Processing message on non-chat page:', {
            messageId: newMessage.id,
            conversationId: newMessage.conversation_id,
            isMember,
            isWelcomeMessage: newMessage.content === 'We are now friends.' || 
              (newMessage.metadata && newMessage.metadata.is_welcome_message),
            pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown'
          })
          
          try {
            const cacheKey = `conversations_${currentUser.id}_${workspace.id}`
            let cachedData = localStorage.getItem(cacheKey)
            let cachedConversations: any[] = []
            
            // If cache doesn't exist, try to load conversations from API
            if (!cachedData) {
              console.log('📊 WorkspaceHeader: Cache not found on non-chat page, loading conversations from API...')
              try {
                const response = await fetch('/api/conversations')
                const data = await response.json()
                if (data.success && data.conversations) {
                  cachedConversations = data.conversations
                  // Save to cache for future use
                  localStorage.setItem(cacheKey, JSON.stringify(cachedConversations))
                  localStorage.setItem(`${cacheKey}_ts`, Date.now().toString())
                  console.log('✅ WorkspaceHeader: Loaded conversations from API and cached (non-chat page)')
                }
              } catch (apiError) {
                console.warn('Failed to load conversations from API:', apiError)
                // Continue with empty array - will create new conversation entry
              }
            } else {
              try {
                cachedConversations = JSON.parse(cachedData)
              } catch (parseError) {
                console.warn('Failed to parse cached conversations:', parseError)
                cachedConversations = []
              }
            }
            
            // Check if user is currently viewing this conversation
            // CRITICAL: Check multiple sources to determine if user is viewing this conversation:
            // 1. URL parameter (if on /chat page)
            // 2. localStorage (stored immediately when user clicks a conversation, even before URL updates)
            // This ensures that when user clicks a conversation from contacts/channels page,
            // the unread_count is immediately cleared, just like in chat page
            let isCurrentlyViewing = false
            if (typeof window !== 'undefined') {
              // Check URL first (for chat page)
              const isOnChatPage = window.location.pathname === '/chat'
              const urlSelectedConvId = isOnChatPage 
                ? new URLSearchParams(window.location.search).get('conversation')
                : null
              
              if (urlSelectedConvId === newMessage.conversation_id) {
                isCurrentlyViewing = true
              } else {
                // Check localStorage (stored immediately when user clicks conversation)
                // This is especially important when user is on contacts/channels page
                // and clicks message icon, then selects a conversation
                try {
                  const selectedConvKey = `selected_conversation_${currentUser.id}_${workspace.id}`
                  const storedSelectedConvId = localStorage.getItem(selectedConvKey)
                  if (storedSelectedConvId === newMessage.conversation_id) {
                    isCurrentlyViewing = true
                    console.log('📊 WorkspaceHeader: User is viewing this conversation (from localStorage):', newMessage.conversation_id)
                  }
                } catch (e) {
                  // Ignore errors reading from localStorage
                }
              }
            }
            
            // CRITICAL: If user is viewing this conversation (from any source), keep unread_count at 0
            // This matches the behavior in chat page where clicking a conversation immediately clears unread_count
            
            // Find or create conversation entry
            let conversationExists = false
            const updated = cachedConversations.map((conv: any) => {
              if (conv.id === newMessage.conversation_id) {
                conversationExists = true
                // If user is viewing this conversation, keep unread_count at 0
                // Otherwise, increase unread_count by 1
                if (isCurrentlyViewing) {
                  return {
                    ...conv,
                    unread_count: 0, // Keep at 0 if viewing
                    last_message: {
                      id: newMessage.id,
                      content: newMessage.content,
                      type: newMessage.type,
                      created_at: newMessage.created_at,
                    },
                    last_message_at: newMessage.created_at,
                  }
                }
                
                return {
                  ...conv,
                  unread_count: (conv.unread_count || 0) + 1,
                  last_message: {
                    id: newMessage.id,
                    content: newMessage.content,
                    type: newMessage.type,
                    created_at: newMessage.created_at,
                  },
                  last_message_at: newMessage.created_at,
                }
              }
              return conv
            })
            
            // If conversation doesn't exist in cache, add it
            // CRITICAL: Always add new conversations, especially for welcome messages
            // Even if membership check failed, the message exists and should be counted
            // This is especially important when friend request is accepted and welcome message is sent
            if (!conversationExists) {
              // Need to fetch conversation details - for now, create a minimal entry
              const newConv = {
                id: newMessage.conversation_id,
                type: 'direct', // Assume direct for now
                unread_count: isCurrentlyViewing ? 0 : 1,
                last_message: {
                  id: newMessage.id,
                  content: newMessage.content,
                  type: newMessage.type,
                  created_at: newMessage.created_at,
                },
                last_message_at: newMessage.created_at,
              }
              updated.push(newConv)
              console.log('📊 WorkspaceHeader: Added new conversation to cache:', newMessage.conversation_id, {
                isMember,
                isWelcomeMessage: newMessage.content === 'We are now friends.' || 
                  (newMessage.metadata && newMessage.metadata.is_welcome_message),
                unread_count: newConv.unread_count
              })
            }
            
            localStorage.setItem(cacheKey, JSON.stringify(updated))
            
            // Recalculate total and update state immediately (no setTimeout needed)
            // Count only direct messages, exclude channels and groups
            const count = updated
              .filter((conv: any) => conv.type === 'direct')
              .reduce((sum: number, conv: any) => sum + (conv.unread_count || 0), 0)
            
            // Update state immediately to show real-time updates on non-chat pages
            setRealTimeUnreadCount(prev => {
              if (prev !== count) {
                console.log('📊 WorkspaceHeader: Updated unread count from realtime (non-chat page):', count, 'for message:', newMessage.id, 'isMember:', isMember, '(was:', prev, ')')
                return count
              }
              return prev
            })
            
            // Trigger custom event so chat page and other listeners can update
            // CRITICAL: Dispatch event immediately to trigger cache recalculation
            // The conversationsUpdated event listener will call calculateFromCache
            window.dispatchEvent(new Event('conversationsUpdated'))
            
            // Note: calculateFromCache is defined in another useEffect, so we can't call it directly here
            // Instead, we rely on the conversationsUpdated event listener to trigger the recalculation
          } catch (e) {
            console.error('❌ WorkspaceHeader: Failed to update unread count from real-time message:', e)
          }
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ WorkspaceHeader: Successfully subscribed to real-time messages', {
            userId: currentUser.id,
            workspaceId: workspace.id,
            channelName,
            pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown'
          })
          
          // CRITICAL: Track presence to keep connection alive
          try {
            await channel.track({
              online_at: new Date().toISOString(),
              user_id: currentUser.id,
            })
            console.log('✅ WorkspaceHeader: Presence tracked to keep connection alive')
            
            // CRITICAL: Periodically update presence to keep connection alive
            // This prevents timeout issues
            const presenceInterval = setInterval(async () => {
              try {
                await channel.track({
                  online_at: new Date().toISOString(),
                  user_id: currentUser.id,
                })
              } catch (e) {
                console.warn('⚠️ WorkspaceHeader: Failed to update presence:', e)
                clearInterval(presenceInterval)
              }
            }, 30000) // Update presence every 30 seconds
            
            // Store interval ID for cleanup
            ;(channel as any)._presenceInterval = presenceInterval
          } catch (presenceError) {
            console.warn('⚠️ WorkspaceHeader: Failed to track presence:', presenceError)
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('❌ WorkspaceHeader: Realtime subscription error:', status, {
            userId: currentUser.id,
            workspaceId: workspace.id,
            channelName,
            pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown'
          })
          
          // CRITICAL: On timeout, the subscription will be recreated by useEffect
          // when dependencies change, but we can also try to manually resubscribe
          if (status === 'TIMED_OUT') {
            console.log('🔄 WorkspaceHeader: Subscription timed out, will resubscribe on next render')
            // The useEffect cleanup will remove the channel, and then recreate it
          }
        } else if (status === 'CLOSED') {
          console.log('🔕 WorkspaceHeader: Realtime subscription closed (normal cleanup)', {
            userId: currentUser.id,
            workspaceId: workspace.id,
            channelName
          })
        } else {
          console.log('🔔 WorkspaceHeader: Realtime subscription status:', status, {
            userId: currentUser.id,
            workspaceId: workspace.id,
            channelName,
            pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown'
          })
        }
      })

    return () => {
      console.log('🔕 WorkspaceHeader: Cleaning up realtime subscription')
      if (channel && supabase) {
        // Clear presence interval if it exists
        if ((channel as any)._presenceInterval) {
          clearInterval((channel as any)._presenceInterval)
          console.log('🔕 WorkspaceHeader: Cleared presence heartbeat interval')
        }
        supabase.removeChannel(channel)
      }
    }
  }, [currentUser, workspace])

  // CRITICAL: Always prioritize realTimeUnreadCount over prop
  // Real-time updates from Supabase subscription should always take precedence
  // This ensures that when you're on contacts/channels pages, you still see real-time message updates
  // Only fall back to prop if realTimeUnreadCount hasn't been set yet
  const totalUnreadCount = realTimeUnreadCount !== undefined && realTimeUnreadCount !== null 
    ? realTimeUnreadCount 
    : propTotalUnreadCount
  
  // Debug log to verify count is being calculated (only in development)
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('📊 WorkspaceHeader: totalUnreadCount =', totalUnreadCount, {
        realTime: realTimeUnreadCount,
        prop: propTotalUnreadCount,
        pathname: pathname
      })
    }
  }, [totalUnreadCount, realTimeUnreadCount, propTotalUnreadCount, pathname])

  const handleLogout = async () => {
    try {
      console.log('[LOGOUT] Calling logout API...')
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      const data = await response.json()
      console.log('[LOGOUT] Logout API response:', data)
    } catch (error) {
      console.error('[LOGOUT] Logout error:', error)
    } finally {
      // Clear local storage and redirect
      mockAuth.logout()
      router.push('/login')
    }
  }

  const navItems = [
    { label: t('messages'), icon: MessageSquare, path: '/chat' },
    { label: t('channels'), icon: Hash, path: '/channels' },
    { label: t('contacts'), icon: UsersIcon, path: '/contacts' },
  ]

  const goToPayment = () => {
    router.push('/payment')
  }

  return (
    <div className="border-b bg-background">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  {workspace.logo_url ? (
                    <img 
                      src={workspace.logo_url || "/placeholder.svg"} 
                      alt={workspace.name}
                      className="h-6 w-6 rounded"
                    />
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
            <DropdownMenuContent align="start" className="w-64">
              <div className="px-2 py-2">
                <div className="font-semibold">{workspace.name}</div>
                <div className="text-sm text-muted-foreground">
                  {workspace.domain}.chat
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                {t('workspaceSettings')}
              </DropdownMenuItem>
              <DropdownMenuItem>
                {t('invitePeople')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                {t('signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.path
              const showUnreadBadge = item.path === '/chat' && totalUnreadCount > 0
              return (
                <Button
                  key={item.path}
                  variant={isActive ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => router.push(item.path)}
                  className={cn('gap-2 relative', isActive && 'font-medium')}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {showUnreadBadge && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center px-1 text-xs"
                    >
                      {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                    </Badge>
                  )}
                </Button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {subscription.type === 'free' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={goToPayment}
              className="h-8 gap-1.5 px-2.5 hover:bg-accent/50"
            >
              <Crown className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Pro</span>
            </Button>
          )}
          {subscription.type !== 'free' && subscription.isActive && (
            <button
              type="button"
              onClick={goToPayment}
              className="rounded-full border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Manage subscription"
            >
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
                <div className="text-sm text-muted-foreground">
                  {currentUser.title}
                </div>
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
  )
}
