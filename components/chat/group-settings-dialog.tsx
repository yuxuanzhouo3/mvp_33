'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConversationWithDetails } from '@/lib/types'
import { Loader2, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface GroupSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversation: ConversationWithDetails
  isOwner: boolean
  onUpdate?: () => void
}

export function GroupSettingsDialog({
  open,
  onOpenChange,
  conversation,
  isOwner,
  onUpdate
}: GroupSettingsDialogProps) {
  const router = useRouter()
  const [name, setName] = useState(conversation.name || '')
  const [description, setDescription] = useState(conversation.description || '')
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleUpdate = async () => {
    if (!name.trim()) {
      alert('群名称不能为空')
      return
    }

    setIsUpdating(true)
    try {
      const response = await fetch(`/api/groups/${conversation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim()
        })
      })

      if (response.ok) {
        onUpdate?.()
        onOpenChange(false)
      } else {
        const data = await response.json()
        alert(`更新失败: ${data.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('更新群设置失败:', error)
      alert('更新失败，请重试')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('确定要删除这个群聊吗？此操作无法撤销，所有消息和数据都将被永久删除。')) {
      return
    }

    if (!confirm('再次确认：删除后无法恢复，确定要继续吗？')) {
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/groups/${conversation.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        onOpenChange(false)
        router.push('/chat')
      } else {
        const data = await response.json()
        alert(`删除失败: ${data.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('删除群聊失败:', error)
      alert('删除失败，请重试')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>群聊设置</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">群名称</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入群名称"
              maxLength={50}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="group-description">群描述</Label>
            <Textarea
              id="group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="输入群描述（可选）"
              rows={3}
              maxLength={200}
            />
          </div>

          {isOwner && (
            <>
              <div className="border-t pt-4 mt-6">
                <div className="space-y-2">
                  <Label className="text-destructive">危险操作</Label>
                  <p className="text-sm text-muted-foreground">
                    删除群聊后，所有消息和数据都将被永久删除，此操作无法撤销。
                  </p>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        删除中...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        删除群聊
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleUpdate} disabled={isUpdating}>
            {isUpdating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              '保存'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
