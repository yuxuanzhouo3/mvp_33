'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EyeOff, Send, ShieldAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'

interface Message {
  id: number
  user: string
  text: string
  time: string
  type: 'system' | 'blind'
}

// 模拟数据
const INITIAL_MESSAGES: Message[] = [
  { id: 1, user: 'System', text: '欢迎进入盲区。这里信息实时流动，沟通无阻。', time: '10:00', type: 'system' },
  { id: 2, user: 'ID:8829', text: '那个新模块的接口文档谁有？', time: '10:01', type: 'blind' },
  { id: 3, user: 'ID:1102', text: '我有，稍后发在开发部工作区。', time: '10:02', type: 'blind' },
]

interface BlindZoneChatProps {
  isOpen: boolean
  onClose: () => void
}

export function BlindZoneChat({ isOpen, onClose }: BlindZoneChatProps) {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES)
  const [inputText, setInputText] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = () => {
    if (!inputText.trim()) return

    const newMessage: Message = {
      id: Date.now(),
      user: `ID:${Math.floor(1000 + Math.random() * 9000)}`,
      text: inputText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'blind'
    }

    setMessages([...messages, newMessage])
    setInputText('')
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
              {t('blindZone')}
              <span className="ml-2 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 text-[10px] rounded uppercase font-bold animate-pulse">
                {t('live')}
              </span>
            </div>
            <div className="text-xs text-gray-400">{t('blindZoneDesc')}</div>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <button className="p-2 hover:bg-red-900/50 rounded-full text-red-400 transition-colors" title="举报违规">
            <ShieldAlert size={20} />
          </button>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full text-gray-400 transition-colors">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-6 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.type === 'system' ? (
              <div className="w-full flex justify-center my-4">
                <span className="text-[10px] px-3 py-1 rounded-full bg-gray-800 text-gray-400">
                  {msg.text}
                </span>
              </div>
            ) : (
              <div className="py-1 border-l-2 border-indigo-500/30 pl-3">
                <div className="flex items-baseline space-x-2">
                  <span className="text-indigo-400 font-mono text-[11px] font-bold">{msg.user}</span>
                  <span className="text-gray-500 text-[10px]">{msg.time}</span>
                </div>
                <div className="text-gray-100 text-[15px] mt-0.5 leading-relaxed">{msg.text}</div>
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-gray-800 bg-gray-900">
        <div className="relative flex items-center space-x-2 max-w-5xl mx-auto rounded-2xl p-2 border border-gray-700 bg-gray-800 focus-within:border-indigo-500 transition-all">
          <Input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder={t('typeAnonymousMessage')}
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 text-white placeholder:text-gray-500"
          />
          <Button
            onClick={handleSendMessage}
            size="icon"
            className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Send size={18} />
          </Button>
        </div>
      </div>
    </div>
  )
}
