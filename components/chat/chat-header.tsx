'use client'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ConversationWithDetails, User } from '@/lib/types'
import { Hash, Lock, Users, Phone, Video, Info, MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useState } from 'react'
import { VoiceCallDialog } from './voice-call-dialog'
import { VideoCallDialog } from './video-call-dialog'

interface ChatHeaderProps {
  conversation: ConversationWithDetails
  currentUser: User
}

export function ChatHeader({ conversation, currentUser }: ChatHeaderProps) {
  const [showVoiceCall, setShowVoiceCall] = useState(false)
  const [showVideoCall, setShowVideoCall] = useState(false)

  const getConversationDisplay = () => {
    if (conversation.type === 'direct') {
      const otherUser = conversation.members.find(m => m.id !== currentUser.id)
      return {
        name: otherUser?.full_name || 'Unknown User',
        subtitle: otherUser?.title || otherUser?.status || '',
        avatar: otherUser?.avatar_url,
        status: otherUser?.status,
        user: otherUser,
      }
    }
    return {
      name: conversation.name || 'Unnamed',
      subtitle: `${conversation.members.length} members`,
      avatar: conversation.avatar_url,
    }
  }

  const display = getConversationDisplay()

  const getConversationIcon = () => {
    if (conversation.type === 'direct') return null
    if (conversation.type === 'group') return <Users className="h-5 w-5" />
    return conversation.is_private ? <Lock className="h-5 w-5" /> : <Hash className="h-5 w-5" />
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'away': return 'bg-yellow-500'
      case 'busy': return 'bg-red-500'
      default: return 'bg-gray-400'
    }
  }

  const isGroupCall = conversation.type === 'group' || conversation.type === 'channel'
  const callRecipient = display.user || currentUser

  return (
    <>
      <div className="border-b bg-background px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {conversation.type === 'direct' ? (
              <div className="relative">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={display.avatar || "/placeholder.svg"} />
                  <AvatarFallback>
                    {display.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                {display.status && (
                  <span className={cn('absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background', getStatusColor(display.status))} />
                )}
              </div>
            ) : (
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                {getConversationIcon()}
              </div>
            )}
            <div>
              <h2 className="font-semibold text-base">{display.name}</h2>
              <p className="text-sm text-muted-foreground">{display.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              size="icon" 
              variant="ghost"
              onClick={() => setShowVoiceCall(true)}
            >
              <Phone className="h-5 w-5" />
            </Button>
            <Button 
              size="icon" 
              variant="ghost"
              onClick={() => setShowVideoCall(true)}
            >
              <Video className="h-5 w-5" />
            </Button>
            <Button size="icon" variant="ghost">
              <Info className="h-5 w-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Mute notifications</DropdownMenuItem>
                <DropdownMenuItem>Pin conversation</DropdownMenuItem>
                <DropdownMenuItem>View details</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive">
                  Leave conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <VoiceCallDialog
        open={showVoiceCall}
        onOpenChange={setShowVoiceCall}
        recipient={callRecipient}
        isGroup={isGroupCall}
        groupName={conversation.name}
        groupMembers={conversation.members}
      />

      <VideoCallDialog
        open={showVideoCall}
        onOpenChange={setShowVideoCall}
        recipient={callRecipient}
        isGroup={isGroupCall}
        groupName={conversation.name}
        groupMembers={conversation.members}
      />
    </>
  )
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
