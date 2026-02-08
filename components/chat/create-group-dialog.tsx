'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User } from '@/lib/types'
import { Search } from 'lucide-react'

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
  const [selectedUsers, setSelectedUsers] = useState<User[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const filteredContacts = contacts.filter(c =>
    c.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const toggleUser = (user: User) => {
    setSelectedUsers(prev =>
      prev.find(u => u.id === user.id)
        ? prev.filter(u => u.id !== user.id)
        : [...prev, user]
    )
  }

  const handleCreate = async () => {
    if (selectedUsers.length < 2) return

    setIsCreating(true)
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: selectedUsers.map(u => u.id),
          workspaceId
        })
      })

      const data = await response.json()

      if (data.success) {
        onOpenChange(false)
        router.push(`/chat?conversation=${data.groupId}`)
      }
    } catch (error) {
      console.error('Failed to create group:', error)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>创建群聊</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索联系人"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-2">
            {filteredContacts.map(contact => (
              <div
                key={contact.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent cursor-pointer"
                onClick={() => toggleUser(contact)}
              >
                <Checkbox
                  checked={selectedUsers.some(u => u.id === contact.id)}
                  onCheckedChange={() => toggleUser(contact)}
                />
                <Avatar className="h-10 w-10">
                  <AvatarImage src={contact.avatar_url} />
                  <AvatarFallback>{contact.full_name[0]}</AvatarFallback>
                </Avatar>
                <span>{contact.full_name}</span>
              </div>
            ))}
          </div>
        </ScrollArea>

        {selectedUsers.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-sm text-muted-foreground mb-2">
              已选择 {selectedUsers.length} 人
            </p>
            <div className="flex gap-2 flex-wrap">
              {selectedUsers.map(user => (
                <Avatar key={user.id} className="h-8 w-8">
                  <AvatarImage src={user.avatar_url} />
                  <AvatarFallback>{user.full_name[0]}</AvatarFallback>
                </Avatar>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleCreate}
            disabled={selectedUsers.length < 2 || isCreating}
          >
            {isCreating ? '创建中...' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
