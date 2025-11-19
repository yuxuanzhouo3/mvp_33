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
}

export function ContactRequestsPanel({
  currentUser,
  onAccept,
  onReject,
  onMessage,
}: ContactRequestsPanelProps) {
  const [requests, setRequests] = useState<ContactRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const loadRequests = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/contact-requests?type=received')
      const data = await response.json()

      if (response.ok) {
        console.log(`[Contact Requests Panel] Loaded ${data.requests?.length || 0} requests`)
        setRequests(data.requests || [])
      } else {
        // If unauthorized, log it
        if (response.status === 401) {
          console.error('Unauthorized - user needs to login')
        } else {
          console.error('Failed to load requests:', data.error || 'Unknown error')
        }
        // If table doesn't exist, show empty state
        setRequests([])
      }
    } catch (error) {
      console.error('Load requests error:', error)
      setRequests([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
    // Refresh every 30 seconds
    const interval = setInterval(loadRequests, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleAccept = async (requestId: string, requesterId: string) => {
    try {
      const response = await fetch(`/api/contact-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'accept' }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to accept request')
      }

      // Remove from list
      setRequests(prev => prev.filter(r => r.id !== requestId))
      
      if (onAccept) {
        onAccept(requestId)
      }

      // Optionally send a welcome message
      if (onMessage) {
        onMessage(requesterId)
      }
    } catch (error: any) {
      console.error('Accept request error:', error)
      alert(error.message || 'Failed to accept request')
    }
  }

  const handleReject = async (requestId: string) => {
    try {
      const response = await fetch(`/api/contact-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'reject' }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject request')
      }

      // Remove from list
      setRequests(prev => prev.filter(r => r.id !== requestId))
      
      if (onReject) {
        onReject(requestId)
      }
    } catch (error: any) {
      console.error('Reject request error:', error)
      alert(error.message || 'Failed to reject request')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Loading requests...
      </div>
    )
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <UserPlus className="h-12 w-12 mb-4 opacity-50" />
        <p>No pending contact requests</p>
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
              <Avatar className="h-10 w-10">
                <AvatarImage src={requester.avatar_url || "/placeholder.svg"} />
                <AvatarFallback>
                  {requester.full_name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium truncate">{requester.full_name}</p>
                  <Badge variant="outline" className="text-xs">
                    {t('pending')}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  @{requester.username} • {requester.email}
                </p>
                {request.message && (
                  <p className="text-sm mt-2 text-muted-foreground">
                    "{request.message}"
                  </p>
                )}
              </div>

              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleAccept(request.id, requester.id)}
                  className="h-8"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReject(request.id)}
                  className="h-8"
                >
                  <X className="h-4 w-4" />
                </Button>
                {onMessage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onMessage(requester.id)}
                    className="h-8"
                    title="Send message"
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

