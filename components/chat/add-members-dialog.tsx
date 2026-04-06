'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User } from '@/lib/types'
import { Search, Loader2, Link2, Copy, Check, RotateCcw, X, UserPlus } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { toast } from 'sonner'

interface AddMembersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId: string
  conversationName?: string
  existingMemberIds: string[]
  onUpdate?: () => void
  /** Show the invite-link section (default: true) */
  showInviteLink?: boolean
  /** Whether current user is admin (for reset link) */
  isAdmin?: boolean
}

export function AddMembersDialog({
  open,
  onOpenChange,
  conversationId,
  conversationName,
  existingMemberIds,
  onUpdate,
  showInviteLink = true,
  isAdmin = false,
}: AddMembersDialogProps) {
  const { language } = useSettings()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)
  const [contacts, setContacts] = useState<User[]>([])
  const [selectedUsers, setSelectedUsers] = useState<User[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)

  // Invite link state
  const [showLinkSection, setShowLinkSection] = useState(false)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteResetting, setInviteResetting] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      loadContacts()
      setSelectedUsers([])
      setSearchQuery('')
      setShowLinkSection(false)
      setInviteUrl(null)
      setCopied(false)
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
        toast.success(tr(`已邀请 ${selectedUsers.length} 人`, `Invited ${selectedUsers.length} people`))
        onUpdate?.()
        onOpenChange(false)
      } else {
        const data = await response.json()
        toast.error(tr(`添加成员失败: ${data.error || '未知错误'}`, `Failed to add members: ${data.error || 'Unknown error'}`))
      }
    } catch (error) {
      console.error('添加成员失败:', error)
      toast.error(tr('添加成员失败，请重试', 'Failed to add members, please try again'))
    } finally {
      setIsAdding(false)
    }
  }

  // ── Invite link helpers ──

  const handleLoadInviteLink = useCallback(async () => {
    setShowLinkSection(true)
    if (inviteUrl) return
    setInviteLoading(true)
    try {
      const res = await fetch(`/api/groups/${conversationId}/invite`)
      const data = await res.json()
      if (data.success) {
        setInviteUrl(data.invite_url)
      } else {
        toast.error(tr('获取邀请链接失败', 'Failed to get invite link'))
      }
    } catch {
      toast.error(tr('网络错误，请重试', 'Network error, please try again'))
    } finally {
      setInviteLoading(false)
    }
  }, [conversationId, inviteUrl, tr])

  const handleCopy = useCallback(async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      toast.success(tr('已复制邀请链接', 'Invite link copied'))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(tr('复制失败', 'Copy failed'))
    }
  }, [inviteUrl, tr])

  const handleResetInvite = useCallback(async () => {
    setInviteResetting(true)
    try {
      const res = await fetch(`/api/groups/${conversationId}/invite`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setInviteUrl(data.invite_url)
        setCopied(false)
        toast.success(tr('邀请链接已重置', 'Invite link reset'))
      } else {
        toast.error(data.error || tr('重置失败', 'Reset failed'))
      }
    } catch {
      toast.error(tr('网络错误', 'Network error'))
    } finally {
      setInviteResetting(false)
    }
  }, [conversationId, tr])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[500px] h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {tr('邀请好友进群', 'Invite to Group')}
          </DialogTitle>
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
          <div className="space-y-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                {tr('加载联系人中...', 'Loading contacts...')}
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {searchQuery
                  ? tr('没有找到匹配的联系人', 'No matching contacts found')
                  : tr('暂无可添加的联系人', 'No contacts available to add')}
              </div>
            ) : (
              filteredContacts.map(contact => (
                <div
                  key={contact.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent cursor-pointer transition-colors duration-200"
                  onClick={() => toggleUser(contact)}
                >
                  <Checkbox
                    checked={selectedUsers.some(u => u.id === contact.id)}
                    onCheckedChange={() => toggleUser(contact)}
                  />
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={contact.avatar_url || undefined} />
                    <AvatarFallback className="text-sm">
                      {(contact.full_name || '?').split(' ').map(n => n[0]).join('').toUpperCase()}
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

        {/* Selected users chips */}
        {selectedUsers.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-sm text-muted-foreground mb-2">
              {tr(`已选择 ${selectedUsers.length} 人`, `${selectedUsers.length} selected`)}
            </p>
            <div className="flex gap-2 flex-wrap">
              {selectedUsers.map(user => (
                <div
                  key={user.id}
                  className="flex items-center gap-1 bg-accent rounded-full pl-1 pr-2 py-0.5 cursor-pointer hover:bg-destructive/10 transition-colors"
                  onClick={() => toggleUser(user)}
                >
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback className="text-[10px]">
                      {(user.full_name || '?')[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs">{user.full_name}</span>
                  <X className="h-3 w-3 text-muted-foreground" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invite link section (toggled) */}
        {showInviteLink && (
          <div className="border-t pt-3">
            {!showLinkSection ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground hover:text-primary"
                onClick={handleLoadInviteLink}
              >
                <Link2 className="mr-2 h-4 w-4" />
                {tr('通过链接邀请', 'Invite via Link')}
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">
                  {tr('分享以下链接，7 天内有效', 'Share this link, valid for 7 days')}
                </p>
                {inviteLoading ? (
                  <div className="flex justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : inviteUrl ? (
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="flex-1 truncate text-xs font-mono select-all text-foreground">
                      {inviteUrl}
                    </span>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCopy}>
                      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                ) : (
                  <p className="text-center text-xs text-destructive">
                    {tr('获取链接失败', 'Failed to load link')}
                  </p>
                )}
                {isAdmin && inviteUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground hover:text-destructive"
                    onClick={handleResetInvite}
                    disabled={inviteResetting}
                  >
                    {inviteResetting ? (
                      <><Loader2 className="mr-1 h-3 w-3 animate-spin" />{tr('重置中...', 'Resetting...')}</>
                    ) : (
                      <><RotateCcw className="mr-1 h-3 w-3" />{tr('重置链接', 'Reset Link')}</>
                    )}
                  </Button>
                )}
              </div>
            )}
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
                {tr('邀请中...', 'Inviting...')}
              </>
            ) : (
              selectedUsers.length > 0
                ? tr(`邀请 (${selectedUsers.length})`, `Invite (${selectedUsers.length})`)
                : tr('邀请', 'Invite')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
