'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { EyeOff, Send, X, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { generateBlindZoneAvatar, formatBlindZoneTime, getAnonymousName } from '@/lib/blind-zone-utils'
import { BlindZoneMessageDisplay } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'

interface BlindZoneChatProps {
  isOpen: boolean
  onClose: () => void
  workspaceId: string
  isWorkspaceAdmin?: boolean
}

export function BlindZoneChat({
  isOpen,
  onClose,
  workspaceId,
  isWorkspaceAdmin = false
}: BlindZoneChatProps) {
  const [messages, setMessages] = useState<BlindZoneMessageDisplay[]>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)
  const { toast } = useToast()

  // 加载消息
  const loadMessages = useCallback(async () => {
    if (!workspaceId) {
      console.log('[盲区调试] loadMessages: workspaceId 为空')
      return
    }

    console.log('[盲区调试] loadMessages: 开始加载消息, workspaceId =', workspaceId)
    setIsLoading(true)
    try {
      const url = `/api/blind-zone?workspaceId=${workspaceId}`
      console.log('[盲区调试] loadMessages: 请求 URL =', url)

      const response = await fetch(url)
      console.log('[盲区调试] loadMessages: 响应状态 =', response.status)

      const data = await response.json()
      console.log('[盲区调试] loadMessages: 响应数据 =', JSON.stringify(data, null, 2))

      if (data.success) {
        console.log('[盲区调试] loadMessages: 成功，消息数量 =', data.messages?.length || 0)
        setMessages(data.messages || [])
      } else {
        console.log('[盲区调试] loadMessages: 失败，错误 =', data.error)
        // 显示错误提示
        const errorMsg = data.error === 'Workspace not found. Please select a valid workspace.'
          ? (language === 'zh' ? '工作区不存在，请重新选择工作区' : 'Workspace not found. Please select a valid workspace.')
          : (language === 'zh' ? '加载消息失败' : 'Failed to load messages')
        toast({
          title: language === 'zh' ? '错误' : 'Error',
          description: errorMsg,
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('[盲区调试] loadMessages: 异常错误 =', error)
      toast({
        title: language === 'zh' ? '错误' : 'Error',
        description: language === 'zh' ? '加载消息失败，请重试' : 'Failed to load messages. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    if (isOpen && workspaceId) {
      loadMessages()
    }
  }, [isOpen, workspaceId, loadMessages])

  // 滚动到底部
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 发送消息
  const handleSendMessage = async () => {
    if (!inputText.trim() || isSending) {
      console.log('[盲区调试] handleSendMessage: 跳过发送, inputText.trim() =', inputText.trim(), 'isSending =', isSending)
      return
    }

    const content = inputText.trim()
    console.log('[盲区调试] handleSendMessage: 准备发送消息, content =', content)
    setInputText('')
    setIsSending(true)

    try {
      const requestBody = {
        workspaceId,
        content,
        type: 'text',
      }
      console.log('[盲区调试] handleSendMessage: 请求体 =', JSON.stringify(requestBody, null, 2))

      const response = await fetch('/api/blind-zone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      console.log('[盲区调试] handleSendMessage: 响应状态 =', response.status)
      console.log('[盲区调试] handleSendMessage: 响应 OK =', response.ok)

      const data = await response.json()
      console.log('[盲区调试] handleSendMessage: 响应数据 =', JSON.stringify(data, null, 2))

      if (data.success && data.message) {
        console.log('[盲区调试] handleSendMessage: 发送成功，添加消息到列表')
        setMessages(prev => {
          const newMessages = [...prev, data.message]
          console.log('[盲区调试] handleSendMessage: 新消息列表长度 =', newMessages.length)
          return newMessages
        })
      } else {
        console.log('[盲区调试] handleSendMessage: 发送失败, success =', data.success, 'error =', data.error)
        // 显示错误提示
        let errorMsg = data.error || (language === 'zh' ? '发送失败' : 'Failed to send message')
        if (data.error === 'Workspace not found. Please select a valid workspace.') {
          errorMsg = language === 'zh' ? '工作区不存在，请重新选择工作区' : 'Workspace not found. Please select a valid workspace.'
        } else if (data.error === 'Not a member of this workspace') {
          errorMsg = language === 'zh' ? '你不是该工作区的成员' : 'You are not a member of this workspace.'
        }
        toast({
          title: language === 'zh' ? '发送失败' : 'Send Failed',
          description: errorMsg,
          variant: 'destructive',
        })
        // 恢复输入内容
        setInputText(content)
      }
    } catch (error) {
      console.error('[盲区调试] handleSendMessage: 异常错误 =', error)
      toast({
        title: language === 'zh' ? '发送失败' : 'Send Failed',
        description: language === 'zh' ? '网络错误，请重试' : 'Network error. Please try again.',
        variant: 'destructive',
      })
      // 恢复输入内容
      setInputText(content)
    } finally {
      setIsSending(false)
      console.log('[盲区调试] handleSendMessage: 发送流程结束')
    }
  }

  // 删除消息（管理员）
  const handleDeleteMessage = async (messageId: string) => {
    if (!isWorkspaceAdmin) return

    setDeletingId(messageId)
    try {
      const response = await fetch(
        `/api/blind-zone/${messageId}?workspaceId=${workspaceId}`,
        { method: 'DELETE' }
      )

      const data = await response.json()

      if (data.success) {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === messageId
              ? { ...msg, is_deleted: true, content: t('blindZoneMessageDeleted') }
              : msg
          )
        )
      }
    } catch (error) {
      console.error('Failed to delete blind zone message:', error)
    } finally {
      setDeletingId(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-900/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-600 rounded-lg text-white">
            <EyeOff size={20} />
          </div>
          <div>
            <div className="font-bold flex items-center text-white">
              {t('blindZoneTitle')}
              <span className="ml-2 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 text-[10px] rounded uppercase font-bold">
                {language === 'zh' ? '匿名' : 'ANON'}
              </span>
            </div>
            <div className="text-xs text-gray-400">{t('blindZoneSubtitle')}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-800 rounded-full text-gray-400 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-gray-400">
            <EyeOff className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm">{t('noBlindZoneMessages')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "group py-2 border-l-2 border-indigo-500/30 pl-3 transition-colors",
                  msg.is_deleted && "opacity-50"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* DiceBear 匿名头像 */}
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage
                      src={msg.is_deleted ? undefined : generateBlindZoneAvatar(msg.id)}
                    />
                    <AvatarFallback className="bg-gray-700 text-gray-400 text-xs">
                      ?
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-indigo-400 font-mono text-xs font-bold">
                        {getAnonymousName(language as 'en' | 'zh')}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-[10px]">
                          {formatBlindZoneTime(msg.created_at, language as 'en' | 'zh')}
                        </span>
                        {/* 管理员删除按钮 */}
                        {isWorkspaceAdmin && !msg.is_deleted && (
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            disabled={deletingId === msg.id}
                            className={cn(
                              "opacity-0 group-hover:opacity-100 transition-opacity p-1",
                              "hover:bg-red-900/50 rounded text-red-400",
                              deletingId === msg.id && "opacity-100"
                            )}
                            title={t('blindZoneAdminDelete')}
                          >
                            {deletingId === msg.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className={cn(
                      "text-gray-100 text-sm mt-1 leading-relaxed",
                      msg.is_deleted && "text-gray-500 italic"
                    )}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-gray-800 bg-gray-900">
        <div className="relative flex items-center space-x-2 max-w-5xl mx-auto rounded-2xl p-2 border border-gray-700 bg-gray-800 focus-within:border-indigo-500 transition-all">
          <Input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
            placeholder={t('typeAnonymousMessage')}
            disabled={isSending}
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 text-white placeholder:text-gray-500"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputText.trim() || isSending}
            size="icon"
            className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </Button>
        </div>
        <div className="text-center mt-2 text-[10px] text-gray-500">
          {language === 'zh'
            ? '🔒 完全匿名 · 每条消息都是独立身份'
            : '🔒 Fully anonymous · Each message is independent'}
        </div>
      </div>
    </div>
  )
}
