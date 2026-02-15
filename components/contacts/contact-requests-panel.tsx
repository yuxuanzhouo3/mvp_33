'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { User } from '@/lib/types'
import { Check, X, MessageSquare, UserPlus } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { RequestSkeleton } from './request-skeleton'

interface ContactRequest {
  id: string
  requester_id: string
  recipient_id: string
  message?: string
  status: string
  created_at: string
  requester?: User
  recipient?: User
}

interface ContactRequestsPanelProps {
  currentUser: User
  onAccept?: (requestId: string) => void
  onReject?: (requestId: string) => void
  onMessage?: (userId: string) => void
  onPendingCountChange?: (count: number) => void
}

export function ContactRequestsPanel({
  currentUser,
  onAccept,
  onReject,
  onMessage,
  onPendingCountChange,
}: ContactRequestsPanelProps) {
  const [requests, setRequests] = useState<ContactRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [pendingCount, setPendingCount] = useState(0)
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const cacheKey = currentUser ? `pending_requests_${currentUser.id}` : null
  const cacheTsKey = cacheKey ? `${cacheKey}_ts` : null
  const requestsCacheKey = cacheKey ? `${cacheKey}_list` : null
  const requestsCacheTsKey = cacheKey ? `${cacheKey}_list_ts` : null

  const syncPending = (count: number) => {
    setPendingCount(count)
    // Update cache immediately
    if (cacheKey && cacheTsKey && typeof window !== 'undefined') {
      localStorage.setItem(cacheKey, count.toString())
      localStorage.setItem(cacheTsKey, Date.now().toString())
    }
    // Don't call onPendingCountChange here - it will be called in useEffect
    // This prevents "Cannot update a component while rendering a different component" error
  }

  const loadRequests = async (showLoading = false) => {
    try {
      // 只在首次加载或明确要求时显示 loading
      if (showLoading || !hasInitiallyLoaded) {
        setIsLoading(true)
      }

      // 1) 先用缓存的 pending 数量，尽快让红点显示
      if (cacheKey && cacheTsKey && typeof window !== 'undefined') {
        const cached = localStorage.getItem(cacheKey)
        const cachedTs = localStorage.getItem(cacheTsKey)
        const ttl = 5 * 60 * 1000 // 5 分钟
        if (cached && cachedTs && Date.now() - parseInt(cachedTs, 10) < ttl) {
          const count = parseInt(cached, 10)
          if (!Number.isNaN(count)) {
            setPendingCount(count)
          }
        }
      }

      // 2) 检查是否有缓存的请求列表（扩展缓存，不仅缓存数量）
      let hasCachedRequests = false
      
      if (requestsCacheKey && requestsCacheTsKey && typeof window !== 'undefined' && !showLoading) {
        const cachedRequests = localStorage.getItem(requestsCacheKey)
        const cachedRequestsTs = localStorage.getItem(requestsCacheTsKey)
        const ttl = 2 * 60 * 1000 // 2 分钟缓存请求列表
        if (cachedRequests && cachedRequestsTs && Date.now() - parseInt(cachedRequestsTs, 10) < ttl) {
          try {
            const parsedRequests = JSON.parse(cachedRequests)
            if (parsedRequests && Array.isArray(parsedRequests) && parsedRequests.length > 0) {
              // CRITICAL: Filter out accepted requests from cache
              const pendingRequests = parsedRequests.filter((req: any) => req.status === 'pending')
              setRequests(pendingRequests)
              setIsLoading(false) // Hide loading immediately
              hasCachedRequests = true
              console.log('✅ Loaded requests from cache, will refresh in background:', pendingRequests.length, '(filtered from', parsedRequests.length, 'total)')
            }
          } catch (e) {
            console.warn('Failed to parse cached requests:', e)
          }
        }
      }

      // 3) 再请求最新数据（即使有缓存也刷新）
      const response = await fetch('/api/contact-requests?type=received')
      const data = await response.json()

      if (response.ok) {
        // CRITICAL: Filter out accepted requests to prevent them from reappearing
        const allRequests = data.requests || []
        const nextRequests = allRequests.filter((req: any) => req.status === 'pending')
        console.log(`[Contact Requests Panel] Loaded ${nextRequests.length} pending requests (filtered from ${allRequests.length} total)`)
        
        // CRITICAL: Only update if we're showing loading OR if requests actually changed
        // This prevents flickering when background refresh happens after accepting a request
        if (showLoading || !hasCachedRequests) {
          setRequests(nextRequests)
        } else {
          // Background refresh - only update if there are actual changes
          setRequests(prev => {
            const prevIds = new Set(prev.map(r => r.id))
            const nextIds = new Set(nextRequests.map((r: any) => r.id))
            
            // Check if there are actual changes
            const hasChanges = prev.length !== nextRequests.length || 
              prev.some(r => !nextIds.has(r.id)) ||
              nextRequests.some((r: any) => !prevIds.has(r.id))
            
            if (hasChanges) {
              console.log('📊 Background refresh detected changes, updating requests list')
              return nextRequests
            }
            // No changes, keep previous state to avoid flickering
            return prev
          })
        }
        
        syncPending(nextRequests.length)

        // 写入缓存（数量和列表）
        if (cacheKey && cacheTsKey && typeof window !== 'undefined') {
          localStorage.setItem(cacheKey, nextRequests.length.toString())
          localStorage.setItem(cacheTsKey, Date.now().toString())
          
          // 也缓存请求列表
          if (requestsCacheKey && requestsCacheTsKey) {
            localStorage.setItem(requestsCacheKey, JSON.stringify(nextRequests))
            localStorage.setItem(requestsCacheTsKey, Date.now().toString())
          }
        }
        
        // 标记已首次加载完成
        if (!hasInitiallyLoaded) {
          setHasInitiallyLoaded(true)
        }
      } else {
        // If unauthorized, log it
        if (response.status === 401) {
          console.error('Unauthorized - user needs to login')
        } else {
          console.error('Failed to load requests:', data.error || 'Unknown error')
        }
        // If table doesn't exist, show empty state
        setRequests([])
        
        // 即使失败也标记为已加载，避免一直显示 loading
        if (!hasInitiallyLoaded) {
          setHasInitiallyLoaded(true)
        }
      }
    } catch (error) {
      console.error('Load requests error:', error)
      setRequests([])
      
      // 即使出错也标记为已加载，避免一直显示 loading
      if (!hasInitiallyLoaded) {
        setHasInitiallyLoaded(true)
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Check cache immediately on mount to show cached requests instantly
  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') return
    if (requests.length > 0) return // Already have requests, skip
    
    const requestsCacheKey = `pending_requests_${currentUser.id}_list`
    const requestsCacheTsKey = `${requestsCacheKey}_ts`
    const ttl = 2 * 60 * 1000 // 2 minutes cache
    
    try {
      const cachedRequests = localStorage.getItem(requestsCacheKey)
      const cachedRequestsTs = localStorage.getItem(requestsCacheTsKey)
      
      if (cachedRequests && cachedRequestsTs) {
        const age = Date.now() - parseInt(cachedRequestsTs, 10)
        if (age < ttl) {
          try {
            const parsedRequests = JSON.parse(cachedRequests)
            if (parsedRequests && Array.isArray(parsedRequests) && parsedRequests.length > 0) {
              // CRITICAL: Filter out accepted requests from cache
              const pendingRequests = parsedRequests.filter((req: any) => req.status === 'pending')
              // Immediately show cached requests, no loading screen
              console.log('📦 Found cached requests on mount, displaying immediately:', pendingRequests.length, '(filtered from', parsedRequests.length, 'total)')
              setRequests(pendingRequests)
              setIsLoading(false) // Hide loading immediately
              setHasInitiallyLoaded(true) // Mark as loaded to prevent skeleton
              console.log('✅ Displayed cached requests immediately on mount')
            }
          } catch (e) {
            console.warn('Failed to parse cached requests on mount:', e)
          }
        }
      }
    } catch (error) {
      console.error('Error checking cache on mount:', error)
    }
  }, [currentUser])

  useEffect(() => {
    // 立即加载一次
    loadRequests()
    
    // 页面可见时，每 30 秒刷新；不可见时 60 秒，避免频繁刷新带来观感问题
    let interval: NodeJS.Timeout
    
    const setupInterval = () => {
      const isVisible = document.visibilityState === 'visible'
      const refreshInterval = isVisible ? 30000 : 60000
      
      if (interval) {
        clearInterval(interval)
      }
      
      interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          // 后台刷新时不显示 loading
          loadRequests(false)
        }
      }, refreshInterval)
    }
    
    // 初始设置
    setupInterval()
    
    // 监听页面可见性变化
    const handleVisibilityChange = () => {
      setupInterval()
      // 页面变为可见时立即刷新（不显示 loading）
      if (document.visibilityState === 'visible') {
        loadRequests(false)
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      if (interval) {
        clearInterval(interval)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // 通知父组件当前待处理请求数量（避免在 render / setState 回调里直接改父组件状态）
  // 使用 useEffect 确保在渲染完成后才更新父组件状态
  // 只在完成首次加载之后再同步，避免初始 0 覆盖父级红点
  useEffect(() => {
    // Use queueMicrotask to ensure this runs after the current render cycle
    // This prevents "Cannot update a component while rendering a different component" error
    queueMicrotask(() => {
      if (onPendingCountChange) {
        onPendingCountChange(pendingCount)
      }
    })
  }, [pendingCount, onPendingCountChange])

  const handleAccept = async (requestId: string, requesterId: string) => {
    // Prevent duplicate clicks
    if (processingIds.has(requestId)) {
      return
    }

    // Store the request being processed for potential rollback
    let requestToRestore: ContactRequest | null = null

    try {
      setProcessingIds(prev => new Set(prev).add(requestId))
      
      // CRITICAL: Clear loading state immediately to prevent UI from staying gray
      setIsLoading(false)
      
      // OPTIMISTIC UPDATE: Remove from list immediately and update count
      setRequests(prev => {
        const request = prev.find(r => r.id === requestId)
        if (request) {
          requestToRestore = request
        }
        const next = prev.filter(r => r.id !== requestId)
        // Update pending count (will notify parent via useEffect)
        syncPending(next.length)
        
        // CRITICAL: Update cache immediately to prevent request from reappearing on refresh
        if (requestsCacheKey && requestsCacheTsKey && typeof window !== 'undefined') {
          localStorage.setItem(requestsCacheKey, JSON.stringify(next))
          localStorage.setItem(requestsCacheTsKey, Date.now().toString())
        }
        if (cacheKey && cacheTsKey && typeof window !== 'undefined') {
          localStorage.setItem(cacheKey, next.length.toString())
          localStorage.setItem(cacheTsKey, Date.now().toString())
        }
        
        return next
      })

      const response = await fetch(`/api/contact-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        // 把 requesterId 一起带给后端，方便 CloudBase 分支在旧数据上恢复出正确的双方关系
        body: JSON.stringify({ action: 'accept', requester_id: requesterId }),
      })

      const data = await response.json()

      if (!response.ok) {
        const errorMsg = data.error || ''
        const errorType = data.errorType || ''
        
        // Only treat as "already processed" if explicitly marked as such
        // In this case, the optimistic update was correct, don't restore
        if (errorType === 'already_processed') {
          console.log('Request already processed, optimistic update was correct')
          return // Don't restore, optimistic update was correct
        }
        
        // For other errors, restore the request (rollback optimistic update)
        console.error('Failed to accept request:', {
          status: response.status,
          error: data.error,
          errorType: errorType,
          details: data.details
        })
        
        // ROLLBACK: Restore the request if it was removed
        if (requestToRestore) {
          setRequests(prev => {
            // Check if already exists (avoid duplicates)
            const exists = prev.some(r => r.id === requestToRestore!.id)
            if (exists) return prev
            const restored = [...prev, requestToRestore!].sort((a, b) => 
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )
            // Update pending count (will notify parent via useEffect)
            syncPending(restored.length)
            return restored
          })
        }
        
        throw new Error(data.error || data.details || 'Failed to accept request')
      }

      // Success! Request status is now 'accepted'
      // The optimistic update already removed it from the list and updated the count
      
      // CRITICAL: Update cache immediately to prevent the request from reappearing on refresh
      if (requestsCacheKey && requestsCacheTsKey && typeof window !== 'undefined') {
        const currentRequests = requests.filter(r => r.id !== requestId)
        localStorage.setItem(requestsCacheKey, JSON.stringify(currentRequests))
        localStorage.setItem(requestsCacheTsKey, Date.now().toString())
        console.log('✅ Updated cache after accepting request, removed:', requestId)
      }
      
      // Update pending count cache
      if (cacheKey && cacheTsKey && typeof window !== 'undefined') {
        const newCount = requests.filter(r => r.id !== requestId).length
        localStorage.setItem(cacheKey, newCount.toString())
        localStorage.setItem(cacheTsKey, Date.now().toString())
      }
      
      // Just trigger parent callback to refresh contacts list (this will add the contact to All tab)
      if (onAccept) {
        onAccept(requestId)
      }
      
      // Don't reload requests immediately - optimistic update already handled it
      // Schedule a background refresh after a short delay to sync with server
      // This prevents flickering when the page refreshes
      // CRITICAL: Use a longer delay to ensure server has processed the acceptance
      // and the cache has been properly updated
      setTimeout(() => {
        loadRequests(false) // Background refresh, no loading indicator
      }, 2000) // Wait 2 seconds to let server process the acceptance and update cache

      // Automatically create a direct conversation with the new contact
      // and send a welcome message "We are now friends." (works for both Supabase & CloudBase via API routing)
      try {
        let conversationId: string | null = null

        // 1) 尝试创建会话（如果已存在，后端可能返回错误或无 id）
        try {
          const convResponse = await fetch('/api/conversations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'direct',
              member_ids: [requesterId],
              // From contacts / friends context, we can skip contact check
              skip_contact_check: true,
            }),
          })

          const convData = await convResponse.json()

          if (convResponse.ok && convData.conversation?.id) {
            conversationId = convData.conversation.id as string
          } else {
            console.warn('Create conversation failed or no id returned, will fallback to existing conversation search:', convData)
          }
        } catch (createErr) {
          console.warn('Create conversation threw error, will fallback to existing conversation search:', createErr)
        }

        // 2) 如果没有拿到 conversationId，尝试从现有会话里寻找与 requester 的 direct 对话
        if (!conversationId) {
          try {
            const listResp = await fetch('/api/conversations')
            const listData = await listResp.json()
            if (listResp.ok && Array.isArray(listData.conversations)) {
              const existing = listData.conversations.find((conv: any) => {
                if (conv.type !== 'direct') return false
                if (!Array.isArray(conv.members)) return false
                const memberIds = conv.members.map((m: any) => m.id || m)
                return memberIds.length === 2 && memberIds.includes(requesterId) && memberIds.includes(currentUser?.id)
              })
              if (existing?.id) {
                conversationId = existing.id as string
              }
            } else {
              console.warn('Failed to fetch conversations when searching for existing direct conversation:', listData)
            }
          } catch (listErr) {
            console.warn('Error fetching conversations for fallback search:', listErr)
          }
        }

        // 3) 如果拿到 conversationId，则发送欢迎消息
        if (conversationId) {
          try {
            const messageResponse = await fetch('/api/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                conversationId,
                content: t('weAreNowFriends'),
                type: 'text',
                metadata: {
                  is_welcome_message: true, // Mark as welcome message to skip in realtime
                },
              }),
            })

            if (!messageResponse.ok) {
              const messageError = await messageResponse.json()
              console.error('Failed to send welcome message:', messageError)
            } else {
              console.log('✅ Welcome message sent: "We are now friends."', { conversationId })
            }
          } catch (msgErr) {
            console.error('Error sending welcome message:', msgErr)
          }
        } else {
          console.warn('No conversation found or created; welcome message not sent')
        }
      } catch (convError) {
        console.error('Error creating conversation / welcome message after accepting contact request:', convError)
      }
    } catch (error: any) {
      console.error('Accept request error:', error)
      // Request was already restored in the error handling above if needed
      // Only show error message, don't reload (which would cause flickering)
      
      // Show error message to user
      alert(`Failed to accept request: ${error.message || 'Unknown error'}\n\nPlease check the browser console for more details and try again.`)
    } finally {
      // CRITICAL: Clear processing state immediately to prevent UI from staying gray
      setProcessingIds(prev => {
        const next = new Set(prev)
        next.delete(requestId)
        return next
      })
      // Ensure loading state is cleared
      setIsLoading(false)
    }
  }

  const handleReject = async (requestId: string) => {
    // Prevent duplicate clicks
    if (processingIds.has(requestId)) {
      return
    }

    // Store the request being processed for potential rollback
    let requestToRestore: ContactRequest | null = null

    try {
      setProcessingIds(prev => new Set(prev).add(requestId))
      
      // OPTIMISTIC UPDATE: Remove from list immediately and update count
      setRequests(prev => {
        const request = prev.find(r => r.id === requestId)
        if (request) {
          requestToRestore = request
        }
        const next = prev.filter(r => r.id !== requestId)
        // Update pending count (will notify parent via useEffect)
        syncPending(next.length)
        return next
      })

      const response = await fetch(`/api/contact-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'reject' }),
      })

      const data = await response.json()

      if (!response.ok) {
        // If request was already processed or not found, optimistic update was correct
        const errorMsg = data.error || ''
        if (
          errorMsg.includes('already processed') || 
          errorMsg.includes('not found') ||
          errorMsg.includes('Request not found') ||
          response.status === 404
        ) {
          console.log('Request already processed or not found, optimistic update was correct')
          return // Don't restore, optimistic update was correct
        }
        
        // For other errors, restore the request (rollback optimistic update)
        console.error('Failed to reject request:', {
          status: response.status,
          error: data.error,
          details: data.details
        })
        
        // ROLLBACK: Restore the request if it was removed
        if (requestToRestore) {
          setRequests(prev => {
            const exists = prev.some(r => r.id === requestToRestore!.id)
            if (exists) return prev
            const restored = [...prev, requestToRestore!].sort((a, b) => 
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )
            // Update pending count (will notify parent via useEffect)
            syncPending(restored.length)
            return restored
          })
        }
        
        throw new Error(data.error || data.details || 'Failed to reject request')
      }

      // Success! Request status is now 'rejected'
      // The optimistic update already removed it from the list and updated the count
      // Don't refresh contacts list - rejection doesn't add contacts
      if (onReject) {
        onReject(requestId)
      }

      // Don't show alert, just silently remove (better UX)
      // Don't reload requests - optimistic update already handled it
    } catch (error: any) {
      console.error('Reject request error:', error)
      // Request was already restored in the error handling above if needed
      // Only show error message, don't reload (which would cause flickering)
      
      const errorMsg = error.message || ''
      if (
        !errorMsg.includes('already processed') && 
        !errorMsg.includes('not found') &&
        !errorMsg.includes('Request not found')
      ) {
        alert(error.message || 'Failed to reject request')
      }
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev)
        next.delete(requestId)
        return next
      })
    }
  }

  const showInitialLoading = !hasInitiallyLoaded && isLoading

  if (showInitialLoading) {
    return <RequestSkeleton count={3} />
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <UserPlus className="h-12 w-12 mb-4 opacity-50" />
        <p>{t('noPendingContactRequests')}</p>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-3">
        {requests.map((request) => {
          const requester = request.requester
          if (!requester) return null

          return (
            <div
              key={request.id}
              className="flex items-start gap-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <Avatar className="h-10 w-10 shrink-0" userId={requester.id} showOnlineStatus={true}>
                <AvatarImage src={requester.avatar_url || undefined} />
                <AvatarFallback name={requester.full_name}>
                  {requester.full_name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0 pr-3">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-base whitespace-nowrap">{requester.full_name}</p>
                  <Badge variant="outline" className="text-xs shrink-0">
                    Pending
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {requester.email}
                </p>
                {request.message && (
                  <p className="text-sm mt-2 text-muted-foreground" style={{ wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: '1.5' }}>
                    {request.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 shrink-0 ml-auto">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleAccept(request.id, requester.id)}
                  className="h-8 whitespace-nowrap"
                  disabled={processingIds.has(request.id)}
                >
                  <Check className="h-4 w-4 mr-1" />
                  {t('accept')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReject(request.id)}
                  className="h-8 shrink-0"
                  disabled={processingIds.has(request.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
                {onMessage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onMessage(requester.id)}
                    className="h-8 shrink-0"
                    title={t('sendMessage')}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

