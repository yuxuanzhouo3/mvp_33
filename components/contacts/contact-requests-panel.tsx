'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { User } from '@/lib/types'
import { Check, X, MessageSquare, UserPlus, Clock, CheckCircle2, XCircle } from 'lucide-react'
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
  updated_at?: string
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
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending')
  const [pendingRequests, setPendingRequests] = useState<ContactRequest[]>([])
  const [historyRequests, setHistoryRequests] = useState<ContactRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const loadRequests = async (status: 'pending' | 'all', showLoading = false) => {
    try {
      if (showLoading || !hasInitiallyLoaded) {
        setIsLoading(true)
      }

      const response = await fetch(`/api/contact-requests?type=received&status=${status}`)
      const data = await response.json()

      if (response.ok) {
        const requests = data.requests || []

        if (status === 'pending') {
          setPendingRequests(requests)
          if (onPendingCountChange) {
            onPendingCountChange(requests.length)
          }
        } else {
          // 过滤出已接受和已拒绝的请求
          const history = requests.filter((req: ContactRequest) =>
            req.status === 'accepted' || req.status === 'rejected'
          )
          setHistoryRequests(history)
        }

        if (!hasInitiallyLoaded) {
          setHasInitiallyLoaded(true)
        }
      }
    } catch (error) {
      console.error('Load requests error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadRequests('pending')
    loadRequests('all')

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadRequests('pending', false)
        if (activeTab === 'history') {
          loadRequests('all', false)
        }
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (activeTab === 'history' && historyRequests.length === 0) {
      loadRequests('all', false)
    }
  }, [activeTab])

  const handleAccept = async (requestId: string, requesterId: string) => {
    if (processingIds.has(requestId)) return

    try {
      setProcessingIds(prev => new Set(prev).add(requestId))

      setPendingRequests(prev => prev.filter(r => r.id !== requestId))

      const response = await fetch(`/api/contact-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', requester_id: requesterId }),
      })

      if (!response.ok) {
        const data = await response.json()
        if (data.errorType !== 'already_processed') {
          throw new Error(data.error || 'Failed to accept request')
        }
      }

      if (onAccept) {
        onAccept(requestId)
      }

      setTimeout(() => {
        loadRequests('pending', false)
        loadRequests('all', false)
      }, 1000)

      // 自动创建会话并发送欢迎消息
      try {
        const convResponse = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'direct',
            member_ids: [requesterId],
            skip_contact_check: true,
          }),
        })

        const convData = await convResponse.json()
        if (convResponse.ok && convData.conversation?.id) {
          await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId: convData.conversation.id,
              content: t('weAreNowFriends'),
              type: 'text',
              metadata: { is_welcome_message: true },
            }),
          })
        }
      } catch (error) {
        console.error('Error creating conversation:', error)
      }
    } catch (error: any) {
      console.error('Accept request error:', error)
      alert(`Failed to accept request: ${error.message}`)
      loadRequests('pending', false)
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev)
        next.delete(requestId)
        return next
      })
    }
  }

  const handleReject = async (requestId: string) => {
    if (processingIds.has(requestId)) return

    try {
      setProcessingIds(prev => new Set(prev).add(requestId))
      setPendingRequests(prev => prev.filter(r => r.id !== requestId))

      const response = await fetch(`/api/contact-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })

      if (!response.ok) {
        const data = await response.json()
        const errorMsg = data.error || ''
        if (!errorMsg.includes('already processed') && !errorMsg.includes('not found')) {
          throw new Error(data.error || 'Failed to reject request')
        }
      }

      if (onReject) {
        onReject(requestId)
      }

      setTimeout(() => {
        loadRequests('pending', false)
        loadRequests('all', false)
      }, 1000)
    } catch (error: any) {
      console.error('Reject request error:', error)
      loadRequests('pending', false)
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev)
        next.delete(requestId)
        return next
      })
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days}天前`
    if (days < 30) return `${Math.floor(days / 7)}周前`
    if (days < 365) return `${Math.floor(days / 30)}个月前`
    return `${Math.floor(days / 365)}年前`
  }

  const renderRequest = (request: ContactRequest, isPending: boolean) => {
    const requester = request.requester
    if (!requester) return null

    return (
      <div
        key={request.id}
        className="flex items-start gap-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
      >
        <Avatar className="h-10 w-10 shrink-0" userId={requester.id} showOnlineStatus={isPending}>
          <AvatarImage src={requester.avatar_url || undefined} />
          <AvatarFallback name={requester.full_name}>
            {requester.full_name.split(' ').map(n => n[0]).join('')}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium text-base">{requester.full_name}</p>
            {isPending ? (
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                待处理
              </Badge>
            ) : request.status === 'accepted' ? (
              <Badge variant="default" className="text-xs bg-green-500">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                已接受
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                <XCircle className="h-3 w-3 mr-1" />
                已拒绝
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{requester.email}</p>
          {request.message && (
            <p className="text-sm mt-2 text-muted-foreground break-words">
              {request.message}
            </p>
          )}
          {!isPending && request.updated_at && (
            <p className="text-xs text-muted-foreground mt-1">
              {formatDate(request.updated_at)}
            </p>
          )}
        </div>

        {isPending ? (
          <div className="flex flex-col gap-2 shrink-0">
            <Button
              size="sm"
              variant="default"
              onClick={() => handleAccept(request.id, requester.id)}
              disabled={processingIds.has(request.id)}
            >
              <Check className="h-4 w-4 mr-1" />
              {t('accept')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleReject(request.id)}
              disabled={processingIds.has(request.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          onMessage && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onMessage(requester.id)}
              title={t('sendMessage')}
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          )
        )}
      </div>
    )
  }

  if (!hasInitiallyLoaded && isLoading) {
    return <RequestSkeleton count={3} />
  }

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'history')} className="flex flex-col h-full">
      <TabsList className="grid w-full grid-cols-2 mx-4 mt-2">
        <TabsTrigger value="history">历史记录</TabsTrigger>
        <TabsTrigger value="pending" className="relative">
          待处理
          {pendingRequests.length > 0 && (
            <Badge variant="destructive" className="ml-2 h-5 min-w-5 px-1">
              {pendingRequests.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="flex-1 mt-0">
        {pendingRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <UserPlus className="h-12 w-12 mb-4 opacity-50" />
            <p>{t('noPendingContactRequests')}</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {pendingRequests.map((request) => renderRequest(request, true))}
            </div>
          </ScrollArea>
        )}
      </TabsContent>

      <TabsContent value="history" className="flex-1 mt-0">
        {historyRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <Clock className="h-12 w-12 mb-4 opacity-50" />
            <p>暂无历史记录</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {historyRequests.map((request) => renderRequest(request, false))}
            </div>
          </ScrollArea>
        )}
      </TabsContent>
    </Tabs>
  )
}
