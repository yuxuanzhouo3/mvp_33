'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Upload, FileText, ChevronDown, ChevronUp,
  MessageSquare, AlertCircle, Loader2, CheckCircle2, X, Sparkles, UserCheck
} from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { cn } from '@/lib/utils'
import {
  parseWechatMessages,
  parseFeishuMessages,
  parseCsvMessages,
  autoParseMessages,
  type ImportedMessage,
  type ParseResult,
} from '@/lib/chat-import-parser'

interface ChatImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId: string
  conversationType?: 'direct' | 'group' | 'channel'
  currentUserName?: string
  onImportComplete?: () => void
}

// ──────── Tutorial Steps ────────
const WECHAT_STEPS_ZH = [
  { step: 1, icon: '💻', text: '打开微信电脑版，进入目标聊天窗口' },
  { step: 2, icon: '☑️', text: '右键或长按消息 → 点击「多选」' },
  { step: 3, icon: '📦', text: '选中要导入的消息 → 点击底部「合并转发」→ 发送给「文件传输助手」' },
  { step: 4, icon: '📋', text: '在文件传输助手中打开合并消息 → 全选文本 → 复制' },
  { step: 5, icon: '📥', text: '回到此页面，粘贴到下方文本框' },
]
const WECHAT_STEPS_EN = [
  { step: 1, icon: '💻', text: 'Open WeChat desktop, go to the target chat' },
  { step: 2, icon: '☑️', text: 'Right-click a message → "Select Multiple"' },
  { step: 3, icon: '📦', text: 'Select messages → "Merge & Forward" → send to "File Transfer"' },
  { step: 4, icon: '📋', text: 'Open the merged message → Select All → Copy' },
  { step: 5, icon: '📥', text: 'Come back here and paste into the text box below' },
]

const FEISHU_STEPS_ZH = [
  { step: 1, icon: '💻', text: '打开飞书电脑版，进入目标聊天窗口' },
  { step: 2, icon: '☑️', text: '按住 Shift 多选消息，或右键 →「多选」' },
  { step: 3, icon: '📦', text: '点击「合并转发」→ 发送给自己' },
  { step: 4, icon: '📥', text: '打开合并消息 → 全选复制 → 粘贴到下方' },
]
const FEISHU_STEPS_EN = [
  { step: 1, icon: '💻', text: 'Open Feishu desktop, go to the target chat' },
  { step: 2, icon: '☑️', text: 'Hold Shift to multi-select, or right-click → "Select Multiple"' },
  { step: 3, icon: '📦', text: '"Merge & Forward" → send to yourself' },
  { step: 4, icon: '📥', text: 'Open the merged message → Select All → Copy → Paste below' },
]

const FILE_STEPS_ZH = [
  { step: 1, icon: '📄', text: '准备 .txt 或 .csv 格式的聊天记录文件' },
  { step: 2, icon: '📝', text: 'TXT 格式：每条消息以「发送者 时间」开头，内容换行跟随' },
  { step: 3, icon: '📊', text: 'CSV 格式：发送者,时间,内容（首行为表头）' },
  { step: 4, icon: '⬆️', text: '点击下方上传按钮选择文件' },
]
const FILE_STEPS_EN = [
  { step: 1, icon: '📄', text: 'Prepare a .txt or .csv chat history file' },
  { step: 2, icon: '📝', text: 'TXT format: each message starts with "Sender Timestamp", content on next line' },
  { step: 3, icon: '📊', text: 'CSV format: sender,time,content (first row is header)' },
  { step: 4, icon: '⬆️', text: 'Click the upload button below to select your file' },
]

// ──────── Component ────────
export function ChatImportDialog({
  open,
  onOpenChange,
  conversationId,
  conversationType,
  currentUserName,
  onImportComplete,
}: ChatImportDialogProps) {
  const { language } = useSettings()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)

  const [activeTab, setActiveTab] = useState<'wechat' | 'feishu' | 'file'>('wechat')
  const [pasteText, setPasteText] = useState('')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [tutorialOpen, setTutorialOpen] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mySenderName, setMySenderName] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Unique sender names from parsed messages
  const senderNames = useMemo(() => {
    if (!parseResult) return []
    const names = Array.from(new Set(parseResult.messages.map(m => m.senderName)))
    return names
  }, [parseResult])

  // Auto-select sender name if it matches currentUserName
  const autoSelectSender = useCallback((names: string[]) => {
    if (!currentUserName) return
    const match = names.find(n =>
      n === currentUserName ||
      n.toLowerCase() === currentUserName.toLowerCase() ||
      currentUserName.includes(n) ||
      n.includes(currentUserName)
    )
    if (match) setMySenderName(match)
  }, [currentUserName])

  const resetState = () => {
    setPasteText('')
    setParseResult(null)
    setTutorialOpen(true)
    setImporting(false)
    setImportSuccess(false)
    setError(null)
    setMySenderName('')
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) resetState()
    onOpenChange(open)
  }

  // Parse on text change
  const handleTextChange = useCallback((text: string) => {
    setPasteText(text)
    setError(null)
    setImportSuccess(false)

    if (!text.trim()) {
      setParseResult(null)
      setMySenderName('')
      return
    }

    let result: ParseResult
    if (activeTab === 'wechat') {
      result = parseWechatMessages(text)
    } else if (activeTab === 'feishu') {
      result = parseFeishuMessages(text)
    } else {
      result = autoParseMessages(text)
    }

    setParseResult(result)
    if (result.messages.length > 0) {
      setTutorialOpen(false)
      // Auto-select sender
      const names = Array.from(new Set(result.messages.map(m => m.senderName)))
      if (currentUserName) {
        const match = names.find(n =>
          n === currentUserName ||
          n.toLowerCase() === currentUserName.toLowerCase() ||
          currentUserName.includes(n) ||
          n.includes(currentUserName)
        )
        if (match) setMySenderName(match)
        else setMySenderName('')
      } else {
        setMySenderName('')
      }
    }
  }, [activeTab, currentUserName])

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (!text) return

      let result: ParseResult
      if (file.name.endsWith('.csv')) {
        result = parseCsvMessages(text)
      } else {
        result = autoParseMessages(text)
      }

      setPasteText(text)
      setParseResult(result)
      setTutorialOpen(false)

      const names = Array.from(new Set(result.messages.map(m => m.senderName)))
      if (currentUserName) {
        const match = names.find(n =>
          n === currentUserName || n.toLowerCase() === currentUserName.toLowerCase()
        )
        if (match) setMySenderName(match)
      }
    }
    reader.readAsText(file)
  }

  // Import messages
  const handleImport = async () => {
    if (!parseResult || parseResult.messages.length === 0) return

    // Validate: sender identity is required when multiple senders
    if (senderNames.length >= 2 && !mySenderName) {
      setError(tr(
        '请先选择你的身份（点击上方发送者姓名）',
        'Please select which sender is you (click a name above)'
      ))
      return
    }

    // Validate: direct chat should have at most 2 senders
    if (conversationType === 'direct' && senderNames.length > 2) {
      setError(tr(
        `检测到 ${senderNames.length} 个发送者（${senderNames.join('、')}），但当前是私聊对话（仅两人）。请检查粘贴的内容是否正确，或在群聊中导入。`,
        `Detected ${senderNames.length} senders (${senderNames.join(', ')}), but this is a direct chat (2 people only). Please verify the pasted content or import in a group chat.`
      ))
      return
    }

    setImporting(true)
    setError(null)

    try {
      const res = await fetch('/api/messages/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          messages: parseResult.messages,
          source: activeTab,
          mySenderName: mySenderName || null,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setImportSuccess(true)
        setTimeout(() => {
          onImportComplete?.()
          handleOpenChange(false)
        }, 1500)
      } else {
        setError(data.error || tr('导入失败', 'Import failed'))
      }
    } catch (err) {
      setError(tr('网络错误，请重试', 'Network error, please retry'))
    } finally {
      setImporting(false)
    }
  }

  const getTutorialSteps = () => {
    if (activeTab === 'wechat') return language === 'zh' ? WECHAT_STEPS_ZH : WECHAT_STEPS_EN
    if (activeTab === 'feishu') return language === 'zh' ? FEISHU_STEPS_ZH : FEISHU_STEPS_EN
    return language === 'zh' ? FILE_STEPS_ZH : FILE_STEPS_EN
  }

  const getTabIcon = (tab: string) => {
    switch (tab) {
      case 'wechat': return '💬'
      case 'feishu': return '🐦'
      case 'file': return '📁'
      default: return '📥'
    }
  }

  const msgCount = parseResult?.messages.length || 0
  const myMsgCount = mySenderName ? parseResult?.messages.filter(m => m.senderName === mySenderName).length || 0 : 0
  const otherMsgCount = msgCount - myMsgCount

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] p-0 gap-0 overflow-hidden rounded-2xl border-0 shadow-2xl flex flex-col">
        {/* ─── Header ─── */}
        <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
          </div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-1">
              <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-white">
                  {tr('导入聊天记录', 'Import Chat History')}
                </DialogTitle>
                <p className="text-white/70 text-xs mt-0.5">
                  {tr('从微信或飞书导入历史消息', 'Import messages from WeChat or Feishu')}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => handleOpenChange(false)}
            className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        {/* ─── Tabs ─── */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setPasteText(''); setParseResult(null); setError(null); setMySenderName('') }} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="px-6 pt-4 pb-0">
            <TabsList className="w-full grid grid-cols-3 h-11 rounded-xl bg-muted/60 p-1">
              {(['wechat', 'feishu', 'file'] as const).map(tab => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="rounded-lg text-xs font-medium gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-foreground transition-all"
                >
                  <span>{getTabIcon(tab)}</span>
                  {tab === 'wechat' ? tr('微信', 'WeChat') : tab === 'feishu' ? tr('飞书', 'Feishu') : tr('文件上传', 'File Upload')}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ─── Tab Content (shared layout) ─── */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
            {/* Tutorial Card */}
            <div className="rounded-xl border bg-gradient-to-b from-blue-50/50 to-white dark:from-blue-950/20 dark:to-background overflow-hidden">
              <button
                onClick={() => setTutorialOpen(!tutorialOpen)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">
                    {tr('操作教程', 'How to Export')}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-medium">
                    {getTutorialSteps().length} {tr('步', 'steps')}
                  </span>
                </div>
                {tutorialOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
              </button>

              {tutorialOpen && (
                <div className="px-4 pb-4 space-y-2">
                  {getTutorialSteps().map(s => (
                    <div key={s.step} className="flex items-start gap-3 group">
                      <div className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center text-xs font-bold shadow-sm">
                        {s.step}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="text-sm text-foreground/80 leading-relaxed">
                          <span className="mr-1.5">{s.icon}</span>
                          {s.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─── Input Area ─── */}
            {activeTab !== 'file' ? (
              <div className="relative">
                <textarea
                  value={pasteText}
                  onChange={e => handleTextChange(e.target.value)}
                  placeholder={tr(
                    '将复制的聊天记录粘贴到这里...\n\n示例格式：\n张三 2025-03-30 10:00\n你好，明天开会吗？\n\n李四 2025-03-30 10:01\n是的，下午两点',
                    'Paste copied chat history here...\n\nExample format:\nJohn 2025-03-30 10:00\nHi, meeting tomorrow?\n\nJane 2025-03-30 10:01\nYes, at 2pm'
                  )}
                  className="w-full min-h-[160px] rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/20 p-4 text-sm resize-none focus:outline-none focus:border-blue-400 focus:bg-background transition-colors placeholder:text-muted-foreground/40"
                />
                {pasteText && (
                  <button
                    onClick={() => { setPasteText(''); setParseResult(null); setMySenderName('') }}
                    className="absolute top-3 right-3 h-6 w-6 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ) : (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv,.text"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[140px] rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/20 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all flex flex-col items-center justify-center gap-3 group"
                >
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                    <Upload className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">{tr('点击上传文件', 'Click to upload file')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{tr('支持 .txt, .csv 格式', 'Supports .txt, .csv')}</p>
                  </div>
                </button>
                {pasteText && (
                  <div className="mt-3 rounded-xl border p-3 bg-muted/20">
                    <p className="text-xs text-muted-foreground mb-1">{tr('已读取文件内容', 'File content loaded')}</p>
                    <p className="text-xs font-mono truncate">{pasteText.slice(0, 100)}...</p>
                  </div>
                )}
              </div>
            )}

            {/* ─── Errors ─── */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
            {parseResult?.errors && parseResult.errors.length > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-600 dark:text-amber-400">{parseResult.errors.join('; ')}</p>
              </div>
            )}

            {/* ─── Sender Mapping (shows after parsing) ─── */}
            {senderNames.length >= 2 && (
              <div className="rounded-xl border overflow-hidden bg-gradient-to-b from-violet-50/50 to-white dark:from-violet-950/20 dark:to-background">
                <div className="px-4 py-3 flex items-center gap-2 border-b bg-violet-50/30 dark:bg-violet-950/10">
                  <UserCheck className="h-4 w-4 text-violet-500" />
                  <span className="text-sm font-medium">{tr('选择你的身份', 'Select which sender is YOU')}</span>
                </div>
                <div className="p-3 flex flex-wrap gap-2">
                  {senderNames.map(name => (
                    <button
                      key={name}
                      onClick={() => setMySenderName(name === mySenderName ? '' : name)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                        name === mySenderName
                          ? 'bg-violet-500 text-white border-violet-500 shadow-sm'
                          : 'bg-white dark:bg-background text-foreground border-muted-foreground/20 hover:border-violet-300'
                      )}
                    >
                      {name}
                      {name === mySenderName && (
                        <span className="ml-1.5 text-xs opacity-80">= {tr('我', 'Me')}</span>
                      )}
                    </button>
                  ))}
                </div>
                {mySenderName && (
                  <div className="px-4 pb-3 text-xs text-muted-foreground">
                    ✨ {tr(
                      `"${mySenderName}" 的 ${myMsgCount} 条消息显示在右侧（我），其余 ${otherMsgCount} 条显示在左侧（对方）`,
                      `"${mySenderName}"'s ${myMsgCount} messages on right (me), ${otherMsgCount} on left (them)`
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ─── Preview ─── */}
            {parseResult && parseResult.messages.length > 0 && (
              <div className="rounded-xl border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20 border-b">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      {tr('解析成功', 'Parsed successfully')}
                    </span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold">
                    {msgCount} {tr('条消息', 'messages')}
                  </span>
                </div>
                <div className="max-h-[180px] overflow-y-auto divide-y">
                  {parseResult.messages.slice(0, 30).map((msg, i) => {
                    const isMe = mySenderName && msg.senderName === mySenderName
                    return (
                      <div key={i} className={cn("px-4 py-2 flex items-start gap-3 transition-colors", isMe ? "bg-blue-50/30 dark:bg-blue-950/10" : "hover:bg-muted/30")}>
                        <div className={cn(
                          "shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold",
                          isMe ? "bg-gradient-to-br from-violet-400 to-purple-500" : "bg-gradient-to-br from-blue-400 to-cyan-500"
                        )}>
                          {msg.senderName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-medium truncate">
                              {msg.senderName}
                              {isMe && <span className="ml-1 text-[10px] text-violet-500">({tr('我', 'Me')})</span>}
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0">{msg.rawTimestamp}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 break-all">{msg.content}</p>
                        </div>
                      </div>
                    )
                  })}
                  {parseResult.messages.length > 30 && (
                    <div className="px-4 py-2 text-center text-xs text-muted-foreground">
                      {tr(`还有 ${parseResult.messages.length - 30} 条未显示...`, `${parseResult.messages.length - 30} more not shown...`)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── Success State ─── */}
            {importSuccess && (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center animate-in zoom-in-50 duration-300">
                  <CheckCircle2 className="h-8 w-8 text-white" />
                </div>
                <p className="text-base font-medium text-emerald-600 dark:text-emerald-400">
                  {tr(`成功导入 ${msgCount} 条消息！`, `Successfully imported ${msgCount} messages!`)}
                </p>
              </div>
            )}
          </div>

          {/* ─── Footer ─── */}
          {!importSuccess && (
            <div className="border-t px-6 py-4 flex items-center justify-between bg-muted/20">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3 w-3" />
                {tr('导入的消息将标记为「历史记录」', 'Imported messages will be tagged as "history"')}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)} className="rounded-lg h-9">
                  {tr('取消', 'Cancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleImport}
                  disabled={!parseResult || parseResult.messages.length === 0 || importing}
                  className="rounded-lg h-9 gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md"
                >
                  {importing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageSquare className="h-3.5 w-3.5" />
                  )}
                  {importing
                    ? tr('导入中...', 'Importing...')
                    : msgCount > 0
                      ? tr(`导入 ${msgCount} 条`, `Import ${msgCount}`)
                      : tr('导入', 'Import')
                  }
                </Button>
              </div>
            </div>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
