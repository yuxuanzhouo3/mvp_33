'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { User } from '@/lib/types'
import { Search, Users, MessageSquare } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'

interface NewConversationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  users: User[]
  currentUser: User
  onCreateDirect: (userId: string) => void
  onCreateGroup: (userIds: string[], name: string) => void
}

export function NewConversationDialog({
  open,
  onOpenChange,
  users,
  currentUser,
  onCreateDirect,
  onCreateGroup,
}: NewConversationDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [tab, setTab] = useState<'direct' | 'group'>('direct')
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const filteredUsers = users
    .filter(u => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      return (
        u.full_name.toLowerCase().includes(query) ||
        u.username.toLowerCase().includes(query)
      )
    })

  const handleUserToggle = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const handleCreate = () => {
    if (tab === 'direct' && selectedUsers.length === 1) {
      onCreateDirect(selectedUsers[0])
    } else if (tab === 'group' && selectedUsers.length >= 2 && groupName.trim()) {
      onCreateGroup(selectedUsers, groupName.trim())
    }
    handleClose()
  }

  const handleClose = () => {
    setSearchQuery('')
    setSelectedUsers([])
    setGroupName('')
    setTab('direct')
    onOpenChange(false)
  }

  const canCreate =
    (tab === 'direct' && selectedUsers.length === 1) ||
    (tab === 'group' && selectedUsers.length >= 0 && groupName.trim())

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[600px] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{t('newConversation')}</DialogTitle>
          <DialogDescription>
            {t('startDirectOrGroup')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col px-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="direct">
              <MessageSquare className="h-4 w-4 mr-2" />
              {t('directMessage')}
            </TabsTrigger>
            <TabsTrigger value="group">
              <Users className="h-4 w-4 mr-2" />
              {t('groupChat')}
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 mb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('searchUsers')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <TabsContent value="direct" className="flex-1 mt-0">
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => {
                      setSelectedUsers([user.id])
                    }}
                    className="w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent"
                  >
                    <Avatar className="h-10 w-10" userId={user.id} showOnlineStatus={true}>
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback name={user.full_name}>
                        {user.full_name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{user.full_name}</div>
                      <p className="text-sm text-muted-foreground truncate">
                        {user.title || user.username}
                      </p>
                    </div>
                    {selectedUsers.includes(user.id) && (
                      <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="group" className="flex-1 mt-0 flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">{t('groupName')}</Label>
              <Input
                id="group-name"
                placeholder={t('enterGroupName')}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </div>

            <div className="space-y-2 flex-1">
              <Label>{t('addMembers')} ({selectedUsers.length} {t('selected')})</Label>
              <ScrollArea className="h-[200px] pr-4">
                <div className="space-y-2">
                  {filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center gap-3 rounded-lg p-3 hover:bg-accent"
                    >
                      <Checkbox
                        checked={selectedUsers.includes(user.id)}
                        onCheckedChange={() => handleUserToggle(user.id)}
                      />
                      <Avatar className="h-8 w-8" userId={user.id} showOnlineStatus={true}>
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback name={user.full_name}>
                          {user.full_name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{user.full_name}</div>
                        <p className="text-xs text-muted-foreground truncate">
                          {user.title || user.username}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="px-6 pb-6">
          <Button variant="outline" onClick={handleClose}>
            {t('cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate}>
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
