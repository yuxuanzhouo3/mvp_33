'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User } from '@/lib/types'
import { Search, Loader2, Users, ImageIcon } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'

interface CreateGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contacts: User[]
  workspaceId: string
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  contacts,
  workspaceId
}: CreateGroupDialogProps) {
  const router = useRouter()
  const { language } = useSettings()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)
  const [selectedUsers, setSelectedUsers] = useState<User[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [groupName, setGroupName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [availableContacts, setAvailableContacts] = useState<User[]>([])
  const [isLoadingContacts, setIsLoadingContacts] = useState(false)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setGroupName('')
      setSelectedUsers([])
      setSearchQuery('')
      loadContacts()
    }
  }, [open])

  const loadContacts = async () => {
    setIsLoadingContacts(true)
    try {
      const response = await fetch('/api/contacts')
      const data = await response.json()

      if (data.success && data.contacts) {
        const contactUsers = (data.contacts || []).map((c: any) => c.user).filter(Boolean)
        setAvailableContacts(contactUsers)
      }
    } catch (error) {
      console.error('[CreateGroupDialog] Failed to load contacts:', error)
    } finally {
      setIsLoadingContacts(false)
    }
  }

  const filteredContacts = availableContacts.filter(c => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      c.full_name?.toLowerCase().includes(query) ||
      c.username?.toLowerCase().includes(query) ||
      c.email?.toLowerCase().includes(query)
    )
  })

  const toggleUser = (user: User) => {
    setSelectedUsers(prev =>
      prev.find(u => u.id === user.id)
        ? prev.filter(u => u.id !== user.id)
        : [...prev, user]
    )
  }

  const handleCreate = async () => {
    setIsCreating(true)
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: selectedUsers.map(u => u.id),
          workspaceId,
          groupName: groupName.trim() || undefined
        })
      })

      const data = await response.json()

      if (data.success) {
        onOpenChange(false)
        router.push(`/chat?conversation=${data.groupId}`)
      } else {
        alert(tr(`创建群聊失败: ${data.error || '未知错误'}`, `Failed to create group: ${data.error || 'Unknown error'}`))
      }
    } catch (error) {
      alert(tr(`创建群聊失败: ${error instanceof Error ? error.message : '网络错误'}`, `Failed to create group: ${error instanceof Error ? error.message : 'Network error'}`))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] h-[75vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b space-y-4">
          <DialogTitle className="text-lg font-semibold">{tr('创建群聊', 'Create Group Chat')}</DialogTitle>

          {/* Group name input - Feishu style */}
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <Input
                placeholder={tr('输入群名称', 'Enter group name')}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="h-10 text-base border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Search contacts */}
        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={tr('搜索联系人', 'Search contacts')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        {/* Selected users chips */}
        {selectedUsers.length > 0 && (
          <div className="px-6 py-2 border-b bg-muted/30">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground shrink-0">
                {tr(`已选 ${selectedUsers.length} 人`, `${selectedUsers.length} selected`)}
              </span>
              {selectedUsers.map(user => (
                <button
                  key={user.id}
                  onClick={() => toggleUser(user)}
                  className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs hover:bg-primary/20 transition-colors"
                >
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback className="text-[8px]">{(user.full_name || 'U')[0]}</AvatarFallback>
                  </Avatar>
                  <span className="max-w-[80px] truncate">{user.full_name}</span>
                  <span className="text-[10px] opacity-60">×</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Contact list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-0.5">
            {isLoadingContacts ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 mb-3 animate-spin opacity-50" />
                <span className="text-sm">{tr('加载中...', 'Loading...')}</span>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Users className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-sm font-medium mb-1">
                  {searchQuery ? tr('没有找到匹配的联系人', 'No matching contacts') : tr('暂无联系人', 'No contacts yet')}
                </p>
                <p className="text-xs opacity-75">
                  {tr('你可以直接创建群聊，之后再邀请成员加入', 'You can create group first, invite members later')}
                </p>
              </div>
            ) : (
              filteredContacts.map(contact => (
                <div
                  key={contact.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                  onClick={() => toggleUser(contact)}
                >
                  <Checkbox
                    checked={selectedUsers.some(u => u.id === contact.id)}
                    onCheckedChange={() => toggleUser(contact)}
                    onClick={(event) => event.stopPropagation()}
                    className="shrink-0"
                  />
                  <Avatar className="h-9 w-9 rounded-lg">
                    <AvatarImage src={contact.avatar_url || undefined} />
                    <AvatarFallback className="rounded-lg">{(contact.full_name || 'U')[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{contact.full_name}</p>
                    {contact.title && <p className="text-xs text-muted-foreground truncate">{contact.title}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Footer - always visible */}
        <div className="border-t px-6 py-4 flex items-center justify-between bg-background">
          <p className="text-xs text-muted-foreground">
            {selectedUsers.length > 0
              ? tr(`将包含你和其他 ${selectedUsers.length} 名成员`, `You + ${selectedUsers.length} member(s)`)
              : tr('创建后你将成为群主', 'You will be the group owner')}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {tr('取消', 'Cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={isCreating}
              className="min-w-[80px]"
            >
              {isCreating ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />{tr('创建中', 'Creating')}</>
              ) : (
                tr('创建群聊', 'Create Group')
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
