'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Loader2, Trash2, Edit2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

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

interface AnnouncementsViewProps {
  conversationId: string
  isAdmin: boolean
}

export function AnnouncementsView({
  conversationId,
  isAdmin
}: AnnouncementsViewProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [content, setContent] = useState('')

  useEffect(() => {
    loadAnnouncements()
  }, [conversationId])

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
        alert(`发布失败: ${data.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('发布公告失败:', error)
      alert('发布失败，请重试')
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
        alert(`更新失败: ${data.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('更新公告失败:', error)
      alert('更新失败，请重试')
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这条公告吗？')) return

    try {
      const response = await fetch(`/api/groups/${conversationId}/announcements/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await loadAnnouncements()
      } else {
        const data = await response.json()
        alert(`删除失败: ${data.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('删除公告失败:', error)
      alert('删除失败，请重试')
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
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col gap-4 p-4 overflow-hidden">
        {isAdmin && (
          <div className="space-y-2">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={editingId ? "编辑公告内容..." : "发布新公告..."}
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
                    {editingId ? '更新中...' : '发布中...'}
                  </>
                ) : (
                  editingId ? '更新公告' : '发布公告'
                )}
              </Button>
              {editingId && (
                <Button onClick={cancelEdit} variant="outline" size="sm">
                  取消
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
              暂无公告
            </div>
          ) : (
            <div className="space-y-4 pr-4">
              {announcements.map((announcement) => (
                <div key={announcement.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={announcement.creator.avatar_url || undefined} />
                        <AvatarFallback>
                          {announcement.creator.full_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{announcement.creator.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(announcement.created_at), {
                            addSuffix: true,
                            locale: zhCN
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
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
