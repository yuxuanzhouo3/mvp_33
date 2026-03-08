'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Loader2, Megaphone, Trash2, Edit2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useSettings } from '@/lib/settings-context'

interface Announcement {
  id: string
  content: string
  created_at: string
  updated_at: string
  creator: {
    id: string
    full_name: string
    avatar_url: string | null
  }
}

interface AnnouncementDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId: string
  isAdmin: boolean
}

export function AnnouncementDrawer({
  open,
  onOpenChange,
  conversationId,
  isAdmin
}: AnnouncementDrawerProps) {
  const { language } = useSettings()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [content, setContent] = useState('')

  useEffect(() => {
    if (open) {
      loadAnnouncements()
    }
  }, [open, conversationId])

  const loadAnnouncements = async () => {
    setIsLoading(true)
    setAnnouncements([])
    try {
      const response = await fetch(`/api/groups/${conversationId}/announcements`)
      if (response.ok) {
        const data = await response.json()
        setAnnouncements(data.announcements || [])
      }
    } catch (error) {
      console.error('加载公告失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!content.trim()) return

    setIsCreating(true)
    try {
      const response = await fetch(`/api/groups/${conversationId}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() })
      })

      if (response.ok) {
        setContent('')
        await loadAnnouncements()
      } else {
        const data = await response.json()
        alert(tr(`发布失败: ${data.error || '未知错误'}`, `Publish failed: ${data.error || 'Unknown error'}`))
      }
    } catch (error) {
      console.error('发布公告失败:', error)
      alert(tr('发布失败，请重试', 'Publish failed, please try again'))
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpdate = async (id: string) => {
    if (!content.trim()) return

    setIsCreating(true)
    try {
      const response = await fetch(`/api/groups/${conversationId}/announcements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() })
      })

      if (response.ok) {
        setContent('')
        setEditingId(null)
        await loadAnnouncements()
      } else {
        const data = await response.json()
        alert(tr(`更新失败: ${data.error || '未知错误'}`, `Update failed: ${data.error || 'Unknown error'}`))
      }
    } catch (error) {
      console.error('更新公告失败:', error)
      alert(tr('更新失败，请重试', 'Update failed, please try again'))
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(tr('确定要删除这条公告吗？', 'Are you sure you want to delete this announcement?'))) return

    try {
      const response = await fetch(`/api/groups/${conversationId}/announcements/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await loadAnnouncements()
      } else {
        const data = await response.json()
        alert(tr(`删除失败: ${data.error || '未知错误'}`, `Delete failed: ${data.error || 'Unknown error'}`))
      }
    } catch (error) {
      console.error('删除公告失败:', error)
      alert(tr('删除失败，请重试', 'Delete failed, please try again'))
    }
  }

  const startEdit = (announcement: Announcement) => {
    setEditingId(announcement.id)
    setContent(announcement.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setContent('')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[540px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            {tr('群公告', 'Announcements')}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden mt-4">
          {isAdmin && (
            <div className="space-y-2">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={editingId ? tr('编辑公告内容...', 'Edit announcement...') : tr('发布新公告...', 'Post a new announcement...')}
                  rows={3}
                  maxLength={500}
                />
              <div className="flex gap-2">
                <Button
                  onClick={editingId ? () => handleUpdate(editingId) : handleCreate}
                  disabled={isCreating || !content.trim()}
                  size="sm"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {editingId ? tr('更新中...', 'Updating...') : tr('发布中...', 'Publishing...')}
                    </>
                  ) : (
                    editingId ? tr('更新公告', 'Update') : tr('发布公告', 'Publish')
                  )}
                </Button>
                {editingId && (
                  <Button onClick={cancelEdit} variant="outline" size="sm">
                    {tr('取消', 'Cancel')}
                  </Button>
                )}
              </div>
            </div>
          )}

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : announcements.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {tr('暂无公告', 'No announcements')}
              </div>
            ) : (
              <div className="space-y-4 pr-4">
                {announcements.map((announcement) => (
                  (() => {
                    const creatorName = announcement.creator?.full_name || 'User'
                    const creatorInitial = creatorName.charAt(0).toUpperCase()
                    return (
                  <div key={announcement.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={announcement.creator?.avatar_url || undefined} />
                          <AvatarFallback>
                            {creatorInitial}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{creatorName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(announcement.created_at), {
                              addSuffix: true,
                              locale: language === 'zh' ? zhCN : undefined
                            })}
                          </p>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => startEdit(announcement)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(announcement.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{announcement.content}</p>
                  </div>
                    )
                  })()
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  )
}
