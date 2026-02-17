'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Loader2, Download, Trash2, Upload, FileIcon, Image, Video, FileText } from 'lucide-react'
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

interface FilesViewProps {
  conversationId: string
  isAdmin: boolean
}

export function FilesView({
  conversationId,
  isAdmin
}: FilesViewProps) {
  const [files, setFiles] = useState<GroupFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    loadFiles()
  }, [conversationId])

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
      alert('文件大小不能超过 100MB')
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
      } else {
        const data = await response.json()
        alert(`上传失败: ${data.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('上传文件失败:', error)
      alert('上传失败，请重试')
    } finally {
      setIsUploading(false)
      e.target.value = ''
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

  const handleDownload = (file: GroupFile) => {
    window.open(file.file_url, '_blank')
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return Image
    if (fileType.startsWith('video/')) return Video
    if (fileType.includes('pdf') || fileType.includes('document')) return FileText
    return FileIcon
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col gap-4 p-4 overflow-hidden">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">群文件</h3>
          <div>
            <input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={handleUpload}
              disabled={isUploading}
            />
            <Button
              size="sm"
              onClick={() => document.getElementById('file-upload')?.click()}
              disabled={isUploading}
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
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              暂无文件
            </div>
          ) : (
            <div className="space-y-2 pr-4">
              {files.map((file) => {
                const FileIconComponent = getFileIcon(file.file_type)
                return (
                  <div key={file.id} className="border rounded-lg p-3 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <FileIconComponent className="h-8 w-8 text-muted-foreground shrink-0" />
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
                          onClick={() => handleDownload(file)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
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
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
