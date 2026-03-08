'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User } from '@/lib/types'
import { Search, Loader2 } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'

interface AddMembersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId: string
  existingMemberIds: string[]
  onUpdate?: () => void
}

export function AddMembersDialog({
  open,
  onOpenChange,
  conversationId,
  existingMemberIds,
  onUpdate
}: AddMembersDialogProps) {
  const { language } = useSettings()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)
  const [contacts, setContacts] = useState<User[]>([])
  const [selectedUsers, setSelectedUsers] = useState<User[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    if (open) {
      loadContacts()
      setSelectedUsers([])
      setSearchQuery('')
    }
  }, [open])

  const loadContacts = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/contacts')
      const data = await response.json()

      if (data.success && data.contacts) {
        const contactUsers = (data.contacts || [])
          .map((c: any) => c.user)
          .filter((u: User) => u && !existingMemberIds.includes(u.id))
        setContacts(contactUsers)
      }
    } catch (error) {
      console.error('加载联系人失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredContacts = contacts.filter(c => {
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

  const handleAdd = async () => {
    if (selectedUsers.length === 0) return

    setIsAdding(true)
    try {
      const response = await fetch(`/api/groups/${conversationId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: selectedUsers.map(u => u.id)
        })
      })

      if (response.ok) {
        onUpdate?.()
        onOpenChange(false)
      } else {
        const data = await response.json()
        alert(tr(`添加成员失败: ${data.error || '未知错误'}`, `Failed to add members: ${data.error || 'Unknown error'}`))
      }
    } catch (error) {
      console.error('添加成员失败:', error)
      alert(tr('添加成员失败，请重试', 'Failed to add members, please try again'))
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[500px] h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>{tr('添加成员', 'Add Members')}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={tr('搜索联系人', 'Search contacts')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                {tr('加载联系人中...', 'Loading contacts...')}
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {searchQuery ? tr('没有找到匹配的联系人', 'No matching contacts found') : tr('暂无可添加的联系人', 'No contacts available to add')}
              </div>
            ) : (
              filteredContacts.map(contact => (
                <div
                  key={contact.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent cursor-pointer transition-colors duration-200"
                  onClick={() => toggleUser(contact)}
                >
                  <Checkbox
                    checked={selectedUsers.some(u => u.id === contact.id)}
                    onCheckedChange={() => toggleUser(contact)}
                  />
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={contact.avatar_url || undefined} />
                    <AvatarFallback className="text-sm">
                      {contact.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{contact.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {contact.title || contact.username}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {selectedUsers.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-sm text-muted-foreground mb-2">
              {tr(`已选择 ${selectedUsers.length} 人`, `${selectedUsers.length} selected`)}
            </p>
            <div className="flex gap-2 flex-wrap">
              {selectedUsers.map(user => (
                <div
                  key={user.id}
                  className="flex items-center gap-1 bg-accent rounded-full pl-1 pr-3 py-1"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {user.full_name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs">{user.full_name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tr('取消', 'Cancel')}
          </Button>
          <Button
            onClick={handleAdd}
            disabled={selectedUsers.length === 0 || isAdding}
          >
            {isAdding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tr('添加中...', 'Adding...')}
              </>
            ) : (
              tr(`添加 (${selectedUsers.length})`, `Add (${selectedUsers.length})`)
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
