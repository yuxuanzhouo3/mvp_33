'use client'

import { useState, useRef, KeyboardEvent, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Paperclip, Smile, Mic, ImageIcon, AtSign, X, FileIcon, Code2, Plus } from 'lucide-react'
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

  const handleSend = () => {
    if ((!message.trim() && !selectedFile) || disabled) return

    const contentToSend = message.trim()
    const fileToSend = selectedFile

    // Clear input immediately for instant feedback and allow consecutive sends.
    setMessage('')
    setIsTyping(false)
    clearFilePreview()

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    const sendTask = async () => {
      if (fileToSend) {
        const fileType = fileToSend.type.startsWith('image/')
          ? 'image'
          : fileToSend.type.startsWith('video/')
            ? 'video'
            : 'file'
        await onSendMessage(contentToSend, fileType, fileToSend)
        return
      }
      await onSendMessage(contentToSend)
    }

    void sendTask().catch((error) => {
      console.error('Failed to send message:', error)
    })
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
    const safeDuration = Math.max(1, Math.round(duration || 0))
    const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: audioBlob.type || 'audio/webm' })
    onSendMessage('', 'voice', audioFile, { duration_seconds: safeDuration })
  }

  const handleSendCode = (code: string, language: string) => {
    onSendMessage(code, 'code', undefined, {
      code_language: language,
      code_content: code,
    })
  }

  const emojis = ['😀', '😂', '😍', '🎉', '👍', '❤️', '🔥', '✨', '👀', '🙌', '💯', '🚀']
  const canSend = !!(message.trim() || selectedFile)

  return (
    <>
      <div className={cn(
        "border-t bg-background",
        isMobile ? "px-2.5 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]" : "px-4 py-3"
      )}>
        <div className={cn("max-w-4xl mx-auto space-y-2", isMobile && "max-w-none space-y-1.5")}>
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
                className="touch-compact shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            accept="*/*"
          />
          <input
            ref={imageInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,video/*"
          />

          {isMobile ? (
            <div className="space-y-1.5">
              <div className="flex items-end gap-1">
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={t('typeMessage')}
                  disabled={disabled}
                  className="flex-1 h-[34px] min-h-[34px] max-h-[120px] resize-none rounded-[16px] border border-[#D6DEE6] bg-white px-3 py-1 text-[15px] leading-[1.35] shadow-none outline-none focus:border-[#C7CFD8]"
                  rows={1}
                />
                <Button
                  onClick={handleSend}
                  data-testid="chat-composer-send-button"
                  disabled={!canSend || disabled}
                  className={cn(
                    "touch-compact h-[34px] min-w-[68px] rounded-[16px] px-3 text-[13px] font-medium",
                    canSend && !disabled
                      ? "bg-[#1a9dff] text-white hover:bg-[#128de7]"
                      : "bg-[#b8dffa] text-white/90 hover:bg-[#b8dffa]"
                  )}
                >
                  {language === 'zh' ? '发送' : 'Send'}
                </Button>
              </div>

              <div className="flex items-center justify-between px-0.5 pt-0 pb-1">
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => setShowVoiceRecorder(true)}
                    className="touch-compact h-7 w-7 rounded-full text-muted-foreground"
                    aria-label={language === 'zh' ? '语音消息' : 'Voice message'}
                  >
                    <Mic className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => imageInputRef.current?.click()}
                    className="touch-compact h-7 w-7 rounded-full text-muted-foreground"
                    aria-label={language === 'zh' ? '发送图片' : 'Send image'}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => fileInputRef.current?.click()}
                    className="touch-compact h-7 w-7 rounded-full text-muted-foreground"
                    aria-label={language === 'zh' ? '发送文件' : 'Send file'}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                  </Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={disabled}
                        className="touch-compact h-7 w-7 rounded-full text-muted-foreground"
                        aria-label={language === 'zh' ? '表情' : 'Emoji'}
                      >
                        <Smile className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2">
                      <div className="grid grid-cols-6 gap-2">
                        {emojis.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => setMessage(prev => prev + emoji)}
                            className="touch-compact text-2xl hover:bg-accent rounded p-1 transition-colors"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => setShowCodeDialog(true)}
                  className="touch-compact h-7 w-7 rounded-full text-muted-foreground"
                  aria-label={language === 'zh' ? '更多功能' : 'More actions'}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={t('typeMessage')}
                disabled={disabled}
                className="flex-1 min-h-[44px] max-h-[200px] resize-none"
                rows={1}
              />

              <div className="flex items-center gap-0.5 shrink-0">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant="ghost" disabled={disabled} className="touch-compact h-8 w-8">
                      <Smile className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2">
                    <div className="grid grid-cols-6 gap-2">
                      {emojis.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => setMessage(prev => prev + emoji)}
                          className="touch-compact text-2xl hover:bg-accent rounded p-1 transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <Button size="icon" variant="ghost" disabled={disabled} className="touch-compact h-8 w-8">
                  <AtSign className="h-4 w-4" />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => fileInputRef.current?.click()}
                  className="touch-compact h-8 w-8"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => imageInputRef.current?.click()}
                  className="touch-compact h-8 w-8"
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => setShowCodeDialog(true)}
                  title="分享代码"
                  className="touch-compact h-8 w-8"
                >
                  <Code2 className="h-4 w-4" />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => setShowVoiceRecorder(true)}
                  className="touch-compact h-8 w-8"
                >
                  <Mic className="h-4 w-4" />
                </Button>

                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!canSend || disabled}
                  className="touch-compact shrink-0 ml-1 h-9 w-9"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

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

