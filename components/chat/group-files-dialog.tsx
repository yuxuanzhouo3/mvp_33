'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Loader2, FileIcon, Trash2, Download, Upload } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

interface GroupFile {
  id: string
  file_name: string
  file_size: number
  file_type: string
  file_url: string
  created_at: string
  uploader: {
    id: string
    full_name: string
    avatar_url: string | null
  }
}

interface GroupFilesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId: string
  currentUserId: string
  isAdmin: boolean
}

export function GroupFilesDialog({
  open,
  onOpenChange,
  conversationId,
  currentUserId,
  isAdmin
}: GroupFilesDialogProps) {
  const [files, setFiles] = useState<GroupFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      loadFiles()
    }
  }, [open, conversationId])

  const loadFiles = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/groups/${conversationId}/files`)
      if (response.ok) {
        const data = await response.json()
        setFiles(data.files || [])
      }
    } catch (error) {
      console.error('加载文件失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 100 * 1024 * 1024) {
      alert('文件大小不能超过100MB')
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/groups/${conversationId}/files`, {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        await loadFiles()
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      } else {
        const data = await response.json()
        alert(`上传失败: ${data.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('上传文件失败:', error)
      alert('上传失败，请重试')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (fileId: string) => {
    if (!confirm('确定要删除这个文件吗？')) return

    try {
      const response = await fetch(`/api/groups/${conversationId}/files/${fileId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await loadFiles()
      } else {
        const data = await response.json()
        alert(`删除失败: ${data.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('删除文件失败:', error)
      alert('删除失败，请重试')
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileIcon className="h-5 w-5" />
            群文件
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleUpload}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              size="sm"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  上传中...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  上传文件
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">最大100MB</p>
          </div>

          <ScrollArea className="h-[500px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无文件
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((file) => (
                  <div key={file.id} className="border rounded-lg p-3 flex items-center gap-3">
                    <FileIcon className="h-8 w-8 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.file_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(file.file_size)}</span>
                        <span>•</span>
                        <span>{file.uploader.full_name}</span>
                        <span>•</span>
                        <span>
                          {formatDistanceToNow(new Date(file.created_at), {
                            addSuffix: true,
                            locale: zhCN
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => window.open(file.file_url, '_blank')}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {(isAdmin || file.uploader.id === currentUserId) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDelete(file.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
