'use client'

import { useState, useEffect } from 'react'
import { User } from '@/lib/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Users, MessageSquare, Phone, Video, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'

interface WorkspaceMembersPanelProps {
  currentUser: User
  workspaceId?: string
  onStartChat: (userId: string) => void
}

export function WorkspaceMembersPanel({
  currentUser,
  workspaceId,
  onStartChat
}: WorkspaceMembersPanelProps) {
  const [members, setMembers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMember, setSelectedMember] = useState<User | null>(null)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  useEffect(() => {
    loadWorkspaceMembers()
  }, [workspaceId])

  const loadWorkspaceMembers = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (workspaceId) {
        params.set('workspaceId', workspaceId)
      }

      const response = await fetch(`/api/workspace-members?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setMembers(data.members || [])
      }
    } catch (error) {
      console.error('Failed to load workspace members:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredMembers = members.filter(member => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      member.full_name?.toLowerCase().includes(query) ||
      member.username?.toLowerCase().includes(query) ||
      member.title?.toLowerCase().includes(query)
    )
  })

  const getStatusText = (status: string) => {
    const statusKey = status as 'online' | 'away' | 'busy' | 'offline'
    return t(statusKey)
  }

  if (isLoading) {
    console.log('[WorkspaceMembersPanel] Loading...')
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  console.log('[WorkspaceMembersPanel] Render state:', {
    membersCount: members.length,
    selectedMember: selectedMember?.full_name,
    filteredCount: filteredMembers.length
  })

  if (members.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <Users className="h-16 w-16 mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-semibold mb-2">{t('noWorkspaceMembers')}</h3>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full" style={{ border: '2px solid red' }}>
      {/* DEBUG: 红色边框用于调试 */}
      {/* Members list - left panel */}
      <div className="w-[480px] border-r flex flex-col" style={{ border: '2px solid blue' }}>
        <div className="border-b p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('workspaceMembers')}</h2>
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

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {filteredMembers.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                {t('noWorkspaceMembers')}
              </div>
            ) : (
              <div className="p-2">
                {filteredMembers.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => {
                      console.log('[WorkspaceMembersPanel] Clicked member:', member.full_name)
                      setSelectedMember(member)
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent',
                      selectedMember?.id === member.id && 'bg-accent'
                    )}
                  >
                    <div className="relative">
                      <Avatar className="h-10 w-10" userId={member.id} showOnlineStatus={true}>
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback name={member.full_name}>
                          {member.full_name?.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{member.full_name}</div>
                      <p className="text-sm text-muted-foreground truncate">
                        {member.title}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Member details - right panel - DEBUG: 绿色边框 */}
      <div className="flex-1 flex flex-col" style={{ border: '2px solid green', minHeight: '100%' }}>
        {selectedMember ? (
          <>
            <div className="border-b p-6">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <Avatar className="h-20 w-20" userId={selectedMember.id} showOnlineStatus={true}>
                    <AvatarImage src={selectedMember.avatar_url || undefined} />
                    <AvatarFallback name={selectedMember.full_name} className="text-2xl">
                      {selectedMember.full_name?.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-semibold mb-1">
                    {selectedMember.full_name}
                  </h2>
                  <p className="text-muted-foreground mb-2">{selectedMember.title}</p>
                  <Badge variant="secondary">
                    {getStatusText(selectedMember.status)}
                  </Badge>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <Button
                  className="flex-1"
                  onClick={() => onStartChat(selectedMember.id)}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  {t('message')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    alert('Call feature coming soon!')
                  }}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  {t('call')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    alert('Video call feature coming soon!')
                  }}
                >
                  <Video className="h-4 w-4 mr-2" />
                  {t('video')}
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h3 className="text-sm font-semibold mb-3">{t('contactInformation')}</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-muted-foreground">{t('email')}</label>
                      <p className="font-medium">{selectedMember.email}</p>
                    </div>
                    {selectedMember.phone && (
                      <div>
                        <label className="text-sm text-muted-foreground">{t('phone')}</label>
                        <p className="font-medium">{selectedMember.phone}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-sm text-muted-foreground">{t('username')}</label>
                      <p className="font-medium">@{selectedMember.username}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-3">{t('workInformation')}</h3>
                  <div className="space-y-3">
                    {selectedMember.department && (
                      <div>
                        <label className="text-sm text-muted-foreground">{t('department')}</label>
                        <p className="font-medium">{selectedMember.department}</p>
                      </div>
                    )}
                    {selectedMember.title && (
                      <div>
                        <label className="text-sm text-muted-foreground">{t('title')}</label>
                        <p className="font-medium">{selectedMember.title}</p>
                      </div>
                    )}
                  </div>
                </div>

                {selectedMember.status_message && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3">{t('status')}</h3>
                    <p className="text-muted-foreground">{selectedMember.status_message}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Users className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <h3 className="text-lg font-semibold mb-2">{language === 'zh' ? '未选择成员' : 'No member selected'}</h3>
              <p>{language === 'zh' ? '从左侧列表中选择一个成员查看详情' : 'Select a member from the list to view details'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
