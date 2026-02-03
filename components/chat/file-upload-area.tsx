'use client'

import { useCallback, useState } from 'react'
import { Upload, X, FileIcon, ImageIcon, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface FileUploadAreaProps {
  files: File[]
  onFilesChange: (files: File[]) => void
  onRemove: (index: number) => void
  uploadProgress?: { [key: string]: number }
  disabled?: boolean
  maxFiles?: number
  maxSize?: number // in bytes
}

export function FileUploadArea({
  files,
  onFilesChange,
  onRemove,
  uploadProgress = {},
  disabled = false,
  maxFiles = 10,
  maxSize = 100 * 1024 * 1024, // 100MB default
}: FileUploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragging(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (disabled) return

    const droppedFiles = Array.from(e.dataTransfer.files)
    const validFiles = droppedFiles.filter(file => {
      if (file.size > maxSize) {
        alert(`文件 ${file.name} 超过最大大小限制 (${(maxSize / 1024 / 1024).toFixed(0)}MB)`)
        return false
      }
      return true
    })

    if (files.length + validFiles.length > maxFiles) {
      alert(`最多只能上传 ${maxFiles} 个文件`)
      return
    }

    onFilesChange([...files, ...validFiles])
  }, [files, onFilesChange, maxFiles, maxSize, disabled])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    const validFiles = selectedFiles.filter(file => {
      if (file.size > maxSize) {
        alert(`文件 ${file.name} 超过最大大小限制 (${(maxSize / 1024 / 1024).toFixed(0)}MB)`)
        return false
      }
      return true
    })

    if (files.length + validFiles.length > maxFiles) {
      alert(`最多只能上传 ${maxFiles} 个文件`)
      return
    }

    onFilesChange([...files, ...validFiles])
    // Reset input
    if (e.target) {
      e.target.value = ''
    }
  }, [files, onFilesChange, maxFiles, maxSize])

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <ImageIcon className="h-5 w-5" />
    }
    if (file.type.startsWith('video/')) {
      return <Video className="h-5 w-5" />
    }
    return <FileIcon className="h-5 w-5" />
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-4 transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <Upload className={cn('h-8 w-8 text-muted-foreground', isDragging && 'text-primary')} />
          <div>
            <p className="text-sm font-medium">
              {isDragging ? '松开以上传文件' : '拖拽文件到此处或点击选择'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              支持多文件上传，最大 {maxFiles} 个文件，单个文件最大 {(maxSize / 1024 / 1024).toFixed(0)}MB
            </p>
          </div>
          <input
            type="file"
            multiple
            onChange={handleFileSelect}
            disabled={disabled}
            className="hidden"
            id="file-upload-input"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => document.getElementById('file-upload-input')?.click()}
            disabled={disabled}
          >
            选择文件
          </Button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => {
            const progress = uploadProgress[file.name] || 0
            const isUploading = progress > 0 && progress < 100

            return (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 p-3 bg-muted rounded-lg"
              >
                <div className="h-10 w-10 rounded bg-background flex items-center justify-center shrink-0">
                  {getFileIcon(file)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                  {isUploading && (
                    <Progress value={progress} className="h-1 mt-1" />
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onRemove(index)}
                  disabled={disabled && isUploading}
                  className="shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


























































































































































