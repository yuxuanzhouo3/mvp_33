'use client'

import { useState, useRef, KeyboardEvent, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Paperclip, Smile, Mic, ImageIcon, AtSign, X, FileIcon, Code2 } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { VoiceMessageRecorder } from './voice-message-recorder'
import { CodeInputDialog } from './code-input-dialog'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

type ChatPrefillEventDetail =
  | { kind: 'text'; text: string }
  | { kind: 'file'; file: File; previewUrl?: string | null }

interface MessageInputProps {
  onSendMessage: (content: string, type?: string, file?: File, metadata?: any) => void | Promise<void>
  disabled?: boolean
  replyingToMessageId?: string | null
  messages?: any[]
  onCancelReply?: () => void
}

export function MessageInput({ 
  onSendMessage, 
  disabled = false,
  replyingToMessageId = null,
  messages = [],
  onCancelReply
}: MessageInputProps) {
  const [message, setMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false)
  const [showCodeDialog, setShowCodeDialog] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const { language } = useSettings()
  const isMobile = useIsMobile()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)
  const pendingBlobReaderRef = useRef<FileReader | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePrefill = (event: Event) => {
      const detail = (event as CustomEvent<ChatPrefillEventDetail>).detail
      if (!detail) return

      if (detail.kind === 'text') {
        setMessage(prev => {
          const prefix = prev && !prev.endsWith('\n') && prev.trim() ? `${prev}\n` : prev || ''
          const nextValue = `${prefix || ''}${detail.text}`
          return nextValue
        })
        setIsTyping(true)
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.focus()
            textareaRef.current.style.height = 'auto'
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
          }
        })
        return
      }

      if (detail.kind === 'file') {
        setSelectedFile(detail.file)

        if (detail.previewUrl !== undefined) {
          setPreviewUrl(detail.previewUrl)
        } else if (detail.file.type.startsWith('image/')) {
          const reader = new FileReader()
          pendingBlobReaderRef.current = reader
          reader.onloadend = () => {
            if (pendingBlobReaderRef.current === reader) {
              setPreviewUrl(reader.result as string)
              pendingBlobReaderRef.current = null
            }
          }
          reader.readAsDataURL(detail.file)
        } else {
          setPreviewUrl(null)
        }

        requestAnimationFrame(() => {
          textareaRef.current?.focus()
        })

        setIsTyping(true)
      }
    }

    window.addEventListener('chat-prefill', handlePrefill as EventListener)
    return () => {
      window.removeEventListener('chat-prefill', handlePrefill as EventListener)
      if (pendingBlobReaderRef.current) {
        pendingBlobReaderRef.current.abort()
        pendingBlobReaderRef.current = null
      }
    }
  }, [])

  const handleSend = async () => {
    if ((message.trim() || selectedFile) && !disabled && !isSending) {
      setIsSending(true) // Set sending state before async operation
      const contentToSend = message.trim()
      const fileToSend = selectedFile
      
      // Clear input immediately for instant feedback
      setMessage('')
      setIsTyping(false)
      clearFilePreview()
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      
      try {
        // Send message immediately (optimistic update)
        if (fileToSend) {
          const fileType = fileToSend.type.startsWith('image/') ? 'image' : 
                          fileToSend.type.startsWith('video/') ? 'video' : 'file'
          await onSendMessage(contentToSend, fileType, fileToSend)
        } else {
          await onSendMessage(contentToSend)
        }
      } catch (error) {
        console.error('Failed to send message:', error)
      } finally {
        // Always reset sending state after operation completes
        setIsSending(false)
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)
    setIsTyping(e.target.value.length > 0)
    
    // Auto-resize textarea
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    // Check if clipboard contains image
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      
      // Check if it's an image
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault() // Prevent default paste behavior
        
        const file = item.getAsFile()
        if (file) {
          setSelectedFile(file)
          
          // Create preview for images
          const reader = new FileReader()
          reader.onloadend = () => {
            setPreviewUrl(reader.result as string)
          }
          reader.readAsDataURL(file)
        }
        return
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setPreviewUrl(reader.result as string)
        }
        reader.readAsDataURL(file)
      } else {
        setPreviewUrl(null)
      }
    }
  }

  const clearFilePreview = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const handleSendVoiceMessage = (audioBlob: Blob, duration: number) => {
    const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
    onSendMessage(`Voice message (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')})`, 'file', audioFile)
  }

  const handleSendCode = (code: string, language: string) => {
    onSendMessage(code, 'code', undefined, {
      code_language: language,
      code_content: code,
    })
  }

  const emojis = ['😀', '😂', '😍', '🎉', '👍', '❤️', '🔥', '✨', '👀', '🙌', '💯', '🚀']

  return (
    <>
      <div className="border-t bg-background p-4">
        <div className="max-w-4xl mx-auto space-y-3">
          {selectedFile && (
            <div className={cn("flex items-start gap-3 bg-muted rounded-lg", isMobile ? "p-2 gap-2" : "p-3")}>
              {previewUrl ? (
                <img 
                  src={previewUrl || "/placeholder.svg"} 
                  alt="Preview" 
                  className="w-20 h-20 rounded object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded bg-background flex items-center justify-center">
                  <FileIcon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={clearFilePreview}
                className="shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              accept="*/*"
            />
            <Button 
              size="icon" 
              variant="ghost" 
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className={cn(isMobile && "h-8 w-8")}
            >
              <Paperclip className={cn(isMobile ? "h-4 w-4" : "h-5 w-5")} />
            </Button>

            <input
              ref={imageInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              accept="image/*,video/*"
            />
            <Button 
              size="icon" 
              variant="ghost" 
              disabled={disabled}
              onClick={() => imageInputRef.current?.click()}
              className={cn(isMobile && "h-8 w-8")}
            >
              <ImageIcon className={cn(isMobile ? "h-4 w-4" : "h-5 w-5")} />
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" disabled={disabled} className={cn(isMobile && "h-8 w-8")}>
                  <Smile className={cn(isMobile ? "h-4 w-4" : "h-5 w-5")} />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2">
                <div className="grid grid-cols-6 gap-2">
                  {emojis.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => setMessage(prev => prev + emoji)}
                      className="text-2xl hover:bg-accent rounded p-1 transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            {!isMobile && (
              <>
                <Button size="icon" variant="ghost" disabled={disabled}>
                  <AtSign className="h-5 w-5" />
                </Button>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  disabled={disabled}
                  onClick={() => setShowCodeDialog(true)}
                  title="分享代码"
                >
                  <Code2 className="h-5 w-5" />
                </Button>
              </>
            )}
            <div className="flex-1" />
            <Button 
              size="icon" 
              variant="ghost" 
              disabled={disabled}
              onClick={() => setShowVoiceRecorder(true)}
              className={cn(isMobile && "h-8 w-8")}
            >
              <Mic className={cn(isMobile ? "h-4 w-4" : "h-5 w-5")} />
            </Button>
          </div>

          {/* Message input */}
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={t('typeMessage')}
              disabled={disabled}
              className={cn("min-h-[44px] max-h-[200px] resize-none", isMobile && "text-base")}
              rows={1}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={(!message.trim() && !selectedFile) || disabled || isSending}
              className="shrink-0 h-11 w-11"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>

          {!isMobile && (
            <p className="text-xs text-muted-foreground">
              {t('pressEnterToSend')},{' '}
              {t('shiftEnterForNewLine')}
            </p>
          )}
        </div>
      </div>

      <VoiceMessageRecorder
        open={showVoiceRecorder}
        onOpenChange={setShowVoiceRecorder}
        onSend={handleSendVoiceMessage}
      />
      
      <CodeInputDialog
        open={showCodeDialog}
        onOpenChange={setShowCodeDialog}
        onSend={handleSendCode}
      />
    </>
  )
}
