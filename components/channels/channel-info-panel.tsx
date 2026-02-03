'use client'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { ConversationWithDetails } from '@/lib/types'
import { Hash, Lock, Users, Bell, BellOff, Star, UserPlus, Settings, LogOut, Pin, Archive } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChannelInfoPanelProps {
  conversation: ConversationWithDetails
  isOpen: boolean
  onClose: () => void
}

export function ChannelInfoPanel({ conversation, isOpen, onClose }: ChannelInfoPanelProps) {
  const getConversationIcon = () => {
    if (conversation.type === 'group') return <Users className="h-5 w-5" />
    return conversation.is_private ? <Lock className="h-5 w-5" /> : <Hash className="h-5 w-5" />
  }

  const getConversationType = () => {
    if (conversation.type === 'channel') {
      return conversation.is_private ? 'Private Channel' : 'Public Channel'
    }
    return 'Group'
  }

  return (
    <div
      className={cn(
        'border-l bg-background transition-all duration-300',
        isOpen ? 'w-80' : 'w-0'
      )}
    >
      {isOpen && (
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="border-b p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Details</h2>
              <Button size="icon" variant="ghost" onClick={onClose}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                {getConversationIcon()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate">{conversation.name}</h3>
                <p className="text-sm text-muted-foreground">{getConversationType()}</p>
              </div>
            </div>

            {conversation.description && (
              <p className="text-sm text-muted-foreground mt-3">
                {conversation.description}
              </p>
            )}
          </div>

          {/* Actions */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div className="space-y-1">
                <Button variant="ghost" className="w-full justify-start">
                  <Bell className="mr-2 h-4 w-4" />
                  Notifications
                </Button>
                <Button variant="ghost" className="w-full justify-start">
                  <Pin className="mr-2 h-4 w-4" />
                  Pin conversation
                </Button>
                <Button variant="ghost" className="w-full justify-start">
                  <Star className="mr-2 h-4 w-4" />
                  Add to favorites
                </Button>
              </div>

              <Separator />

              {/* Members */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold">
                    Members ({conversation.members.length})
                  </h4>
                  <Button size="sm" variant="ghost">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {conversation.members.slice(0, 10).map((member) => (
                    <div key={member.id} className="flex items-center gap-2">
                      <div className="relative">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback name={member.full_name} className="text-xs">
                            {member.full_name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <span className={cn(
                          'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background',
                          member.status === 'online' ? 'bg-green-500' :
                          member.status === 'away' ? 'bg-yellow-500' :
                          member.status === 'busy' ? 'bg-red-500' : 'bg-gray-400'
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{member.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {member.title || member.username}
                        </p>
                      </div>
                    </div>
                  ))}
                  {conversation.members.length > 10 && (
                    <Button variant="ghost" size="sm" className="w-full">
                      View all {conversation.members.length} members
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              {/* Settings */}
              <div className="space-y-1">
                <Button variant="ghost" className="w-full justify-start">
                  <Settings className="mr-2 h-4 w-4" />
                  Channel settings
                </Button>
                <Button variant="ghost" className="w-full justify-start">
                  <Archive className="mr-2 h-4 w-4" />
                  Archive channel
                </Button>
                <Button variant="ghost" className="w-full justify-start text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Leave channel
                </Button>
              </div>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
