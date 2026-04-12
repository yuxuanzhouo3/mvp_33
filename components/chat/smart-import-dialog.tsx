'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  MessageSquare, X, Loader2, CheckCircle2, AlertCircle,
  Sparkles, Upload, ClipboardPaste, Image as ImageIcon,
  ArrowLeft, ArrowRight, Smartphone, Monitor,
} from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { cn } from '@/lib/utils'
import {
  parseWechatMessages,
  parseFeishuMessages,
  autoParseMessages,
  type ImportedMessage,
  type ParseResult,
} from '@/lib/chat-import-parser'

interface SmartImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId: string
  conversationType?: 'direct' | 'group' | 'channel'
  currentUserName?: string
  onImportComplete?: () => void
}

type ImportStep = 'select-platform' | 'connecting' | 'guide' | 'parsing' | 'preview' | 'importing' | 'success'
type Platform = 'wechat' | 'feishu' | 'dingtalk'

const PLATFORMS = [
  { id: 'wechat' as Platform, icon: '💬', name: { zh: '微信', en: 'WeChat' }, color: 'from-green-500 to-green-600' },
  { id: 'feishu' as Platform, icon: '🐦', name: { zh: '飞书', en: 'Feishu' }, color: 'from-blue-500 to-blue-600' },
  { id: 'dingtalk' as Platform, icon: '🔵', name: { zh: '钉钉', en: 'DingTalk' }, color: 'from-blue-600 to-indigo-600' },
]

export function SmartImportDialog({
  open,
  onOpenChange,
  conversationId,
  conversationType,
  currentUserName,
  onImportComplete,
}: SmartImportDialogProps) {
  const { language } = useSettings()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)

  const [step, setStep] = useState<ImportStep>('select-platform')
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [connectProgress, setConnectProgress] = useState(0)
  const [parsedMessages, setParsedMessages] = useState<ImportedMessage[]>([])
  const [mySenderName, setMySenderName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [ocrProcessing, setOcrProcessing] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pasteAreaRef = useRef<HTMLDivElement>(null)
  const clipboardCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const resetState = useCallback(() => {
    setStep('select-platform')
    setPlatform(null)
    setConnectProgress(0)
    setParsedMessages([])
    setMySenderName('')
    setError(null)
    setImporting(false)
    setIsDragOver(false)
    setOcrProcessing(false)
    if (clipboardCheckIntervalRef.current) {
      clearInterval(clipboardCheckIntervalRef.current)
      clipboardCheckIntervalRef.current = null
    }
  }, [])

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) resetState()
    onOpenChange(open)
  }, [onOpenChange, resetState])

  // ─── Platform Selection ───
  const handleSelectPlatform = useCallback((p: Platform) => {
    setPlatform(p)
    // Skip animation — go directly to AI scan mode
    setStep('guide')

    // Try to open desktop app via URL scheme (deep link)
    const urlSchemes: Record<Platform, string> = {
      wechat: 'weixin://',
      feishu: 'https://applink.feishu.cn/',
      dingtalk: 'dingtalk://'
    }
    const scheme = urlSchemes[p]
    if (scheme) {
      try {
        const iframe = document.createElement('iframe')
        iframe.style.display = 'none'
        iframe.src = scheme
        document.body.appendChild(iframe)
        setTimeout(() => {
          try { document.body.removeChild(iframe) } catch {}
        }, 2000)
      } catch {
        // Silently ignore if app not installed
      }
    }
  }, [])

  // ─── Try parse text content ───
  const tryParseText = useCallback((text: string) => {
    if (!text.trim()) return false

    let result: ParseResult
    if (platform === 'wechat') {
      result = parseWechatMessages(text)
    } else if (platform === 'feishu') {
      result = parseFeishuMessages(text)
    } else {
      result = autoParseMessages(text)
    }

    if (result.messages.length > 0) {
      setParsedMessages(result.messages)
      // Auto-match sender
      if (currentUserName) {
        const names = Array.from(new Set(result.messages.map(m => m.senderName)))
        const match = names.find(n =>
          n === currentUserName ||
          n.toLowerCase() === currentUserName.toLowerCase() ||
          currentUserName.includes(n) ||
          n.includes(currentUserName)
        )
        if (match) setMySenderName(match)
      }
      setStep('preview')
      return true
    }
    return false
  }, [platform, currentUserName])

  // ─── OCR Screenshot ───
  const handleOcrImage = useCallback(async (dataUrl: string) => {
    setOcrProcessing(true)
    setStep('parsing')
    setError(null)

    try {
      const res = await fetch('/api/messages/ocr-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      })
      const data = await res.json()

      if (data.success && data.messages?.length > 0) {
        setParsedMessages(data.messages)
        if (currentUserName) {
          const names: string[] = Array.from(new Set(data.messages.map((m: any) => String(m.senderName))))
          const match = names.find((n) =>
            n === currentUserName ||
            n.toLowerCase() === currentUserName.toLowerCase() ||
            currentUserName.includes(n) ||
            n.includes(currentUserName)
          )
          if (match) setMySenderName(match)
        }
        setStep('preview')
      } else {
        setError(data.error || tr('识别失败，请尝试更清晰的截图', 'Recognition failed, try a clearer screenshot'))
        setStep('guide')
      }
    } catch (err) {
      setError(tr('网络错误，请重试', 'Network error, please retry'))
      setStep('guide')
    } finally {
      setOcrProcessing(false)
    }
  }, [currentUserName, tr])

  // ─── Handle paste (text or image) ───
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    if (step !== 'guide') return

    const items = e.clipboardData?.items
    if (!items) return

    // Check for image first
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) continue

        const reader = new FileReader()
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string
          if (dataUrl) handleOcrImage(dataUrl)
        }
        reader.readAsDataURL(blob)
        return
      }
    }

    // Check for text
    const text = e.clipboardData?.getData('text/plain')
    if (text) {
      e.preventDefault()
      if (!tryParseText(text)) {
        setError(tr(
          '未能识别粘贴的文字内容，请确认是否为聊天记录格式',
          'Could not recognize the pasted text as chat messages'
        ))
      }
    }
  }, [step, handleOcrImage, tryParseText, tr])

  // ─── Clipboard monitoring (paste + auto-detect on focus) ───
  useEffect(() => {
    if (step !== 'guide' || typeof window === 'undefined') return

    // 1. Listen for manual paste events
    document.addEventListener('paste', handlePaste)

    // 2. Auto-detect clipboard images when user switches back to this window
    let lastClipHash = ''
    const checkClipboard = async () => {
      try {
        if (!navigator.clipboard?.read) return
        const items = await navigator.clipboard.read()
        for (const item of items) {
          // Check for images in clipboard
          const imgType = item.types.find(t => t.startsWith('image/'))
          if (imgType) {
            const blob = await item.getType(imgType)
            // Simple hash to avoid re-processing the same image
            const hash = `${blob.size}-${blob.type}`
            if (hash === lastClipHash) return
            lastClipHash = hash

            const reader = new FileReader()
            reader.onload = (ev) => {
              const dataUrl = ev.target?.result as string
              if (dataUrl) handleOcrImage(dataUrl)
            }
            reader.readAsDataURL(blob)
            return
          }
          // Check for text in clipboard
          if (item.types.includes('text/plain')) {
            const blob = await item.getType('text/plain')
            const text = await blob.text()
            const hash = `text-${text.length}-${text.slice(0, 20)}`
            if (hash === lastClipHash) return
            lastClipHash = hash
            if (text.trim().length > 10) {
              tryParseText(text)
            }
            return
          }
        }
      } catch {
        // Clipboard API may be denied — silently ignore
      }
    }

    // Check clipboard when window regains focus
    const onFocus = () => {
      // Small delay to ensure clipboard is updated
      setTimeout(checkClipboard, 300)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(checkClipboard, 300)
      }
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('paste', handlePaste)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [step, handlePaste, handleOcrImage, tryParseText])

  // ─── Drag and drop ───
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (step === 'guide') setIsDragOver(true)
  }, [step])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (step !== 'guide') return

    const files = e.dataTransfer.files
    if (files.length === 0) return

    const file = files[0]

    // Image file → OCR
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string
        if (dataUrl) handleOcrImage(dataUrl)
      }
      reader.readAsDataURL(file)
      return
    }

    // Text file → parse
    if (file.name.match(/\.(txt|csv|text)$/i)) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const text = ev.target?.result as string
        if (text && !tryParseText(text)) {
          setError(tr('未能解析文件内容', 'Could not parse file content'))
        }
      }
      reader.readAsText(file)
      return
    }

    setError(tr('不支持的文件格式，请使用图片或文本文件', 'Unsupported file format, please use image or text files'))
  }, [step, handleOcrImage, tryParseText, tr])

  // ─── File upload ───
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string
        if (dataUrl) handleOcrImage(dataUrl)
      }
      reader.readAsDataURL(file)
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const text = ev.target?.result as string
        if (text && !tryParseText(text)) {
          setError(tr('未能解析文件内容', 'Could not parse file content'))
        }
      }
      reader.readAsText(file)
    }
  }, [handleOcrImage, tryParseText, tr])

  // ─── Import messages ───
  const handleImport = useCallback(async () => {
    if (parsedMessages.length === 0) return

    setImporting(true)
    setError(null)

    try {
      const res = await fetch('/api/messages/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          messages: parsedMessages,
          source: platform || 'smart-import',
          mySenderName: mySenderName || null,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setStep('success')
        setTimeout(() => {
          onImportComplete?.()
          handleOpenChange(false)
        }, 2000)
      } else {
        setError(data.error || tr('导入失败', 'Import failed'))
      }
    } catch {
      setError(tr('网络错误，请重试', 'Network error, please retry'))
    } finally {
      setImporting(false)
    }
  }, [parsedMessages, conversationId, platform, mySenderName, onImportComplete, handleOpenChange, tr])

  const senderNames = Array.from(new Set(parsedMessages.map(m => m.senderName)))

  // ─── Render ───
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[580px] max-h-[88vh] p-0 gap-0 overflow-hidden rounded-2xl border-0 shadow-2xl flex flex-col"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-50 bg-blue-500/10 backdrop-blur-sm flex items-center justify-center rounded-2xl border-2 border-dashed border-blue-400">
            <div className="text-center animate-in zoom-in-95 duration-200">
              <div className="h-16 w-16 rounded-2xl bg-blue-500 flex items-center justify-center mx-auto mb-3">
                <Upload className="h-8 w-8 text-white" />
              </div>
              <p className="text-lg font-semibold text-blue-600">{tr('放开即可导入', 'Drop to import')}</p>
              <p className="text-sm text-blue-500/70 mt-1">{tr('支持截图或文本文件', 'Screenshots or text files')}</p>
            </div>
          </div>
        )}

        {/* ─── Header ─── */}
        <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 text-white">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
          </div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-1">
              {step !== 'select-platform' && step !== 'success' && (
                <button
                  onClick={() => {
                    if (step === 'connecting' || step === 'guide' || step === 'parsing') {
                      setStep('select-platform')
                      setPlatform(null)
                      setParsedMessages([])
                      setError(null)
                    } else if (step === 'preview') {
                      setStep('guide')
                      setParsedMessages([])
                    }
                  }}
                  className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {tr('一键导入聊天记录', 'One-Click Import')}
                </h2>
                <p className="text-white/70 text-xs mt-0.5">
                  {step === 'select-platform' && tr('选择你要导入的平台', 'Select the platform to import from')}

                  {step === 'guide' && tr('AI 智能扫描中', 'AI Smart Scanning')}
                  {step === 'parsing' && tr('AI 正在识别截图内容...', 'AI is recognizing screenshot...')}
                  {step === 'preview' && tr('确认导入内容', 'Confirm import content')}
                  {step === 'importing' && tr('正在导入...', 'Importing...')}
                  {step === 'success' && tr('导入完成！', 'Import complete!')}
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

        {/* ─── Body ─── */}
        <div className="flex-1 overflow-y-auto">

          {/* Step 1: Select Platform */}
          {step === 'select-platform' && (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {PLATFORMS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPlatform(p.id)}
                    className="group flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-transparent bg-muted/40 hover:bg-muted/80 hover:border-purple-200 dark:hover:border-purple-800 transition-all hover:scale-[1.03] active:scale-[0.98]"
                  >
                    <div className={cn(
                      "h-16 w-16 rounded-2xl bg-gradient-to-br flex items-center justify-center text-2xl shadow-lg group-hover:shadow-xl transition-shadow",
                      p.color
                    )}>
                      <span className="text-3xl">{p.icon}</span>
                    </div>
                    <span className="text-sm font-semibold">{p.name[language] || p.name.en}</span>
                  </button>
                ))}
              </div>

              <div className="text-center pt-2">
                <p className="text-xs text-muted-foreground">
                  {tr(
                    '支持从微信、飞书、钉钉导入聊天记录',
                    'Import chat history from WeChat, Feishu, or DingTalk'
                  )}
                </p>
              </div>
            </div>
          )}


          {/* Step 3: AI Smart Scan Mode */}
          {step === 'guide' && platform && (
            <div className="p-5 space-y-4">
              {/* AI Scanning Animation */}
              <div className="relative flex flex-col items-center justify-center py-6">
                {/* Radar rings */}
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-purple-300/30 dark:border-purple-600/30 animate-ping" style={{ animationDuration: '2s' }} />
                  <div className="absolute inset-2 rounded-full border-2 border-purple-400/40 dark:border-purple-500/40 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.3s' }} />
                  <div className="absolute inset-4 rounded-full border-2 border-purple-500/50 dark:border-purple-400/50 animate-ping" style={{ animationDuration: '3s', animationDelay: '0.6s' }} />
                  {/* Center icon */}
                  <div className={cn(
                    "relative z-10 w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center text-3xl shadow-xl",
                    PLATFORMS.find(p => p.id === platform)?.color
                  )}>
                    {PLATFORMS.find(p => p.id === platform)?.icon}
                  </div>
                </div>

                {/* Scanning status text */}
                <div className="mt-5 text-center">
                  <p className="text-base font-semibold flex items-center gap-2 justify-center">
                    <Sparkles className="h-4 w-4 text-purple-500 animate-pulse" />
                    {tr('AI 智能扫描中...', 'AI Smart Scanning...')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 max-w-[280px] mx-auto leading-relaxed">
                    {tr(
                      `请切换到${PLATFORMS.find(p => p.id === platform)?.name.zh}，截图或选择聊天记录，然后切回此窗口`,
                      `Switch to ${PLATFORMS.find(p => p.id === platform)?.name.en}, screenshot or select chat history, then switch back`
                    )}
                  </p>
                </div>

                {/* Animated scanning indicators */}
                <div className="flex items-center gap-4 mt-5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs text-muted-foreground">{tr('监听中', 'Listening')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" style={{ animationDelay: '0.5s' }} />
                    <span className="text-xs text-muted-foreground">{tr('图像识别就绪', 'Image AI Ready')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '1s' }} />
                    <span className="text-xs text-muted-foreground">{tr('文字解析就绪', 'Text Parser Ready')}</span>
                  </div>
                </div>
              </div>

              {/* Error display */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 animate-in fade-in duration-200">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              {/* Subtle action area — no copy/paste language */}
              <div className="rounded-xl border bg-gradient-to-b from-muted/30 to-muted/10 p-4">
                <p className="text-xs font-medium text-center text-muted-foreground mb-3">
                  {tr('💡 数据采集方式', '💡 Data Collection Methods')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {/* Auto-detect card */}
                  <div
                    ref={pasteAreaRef}
                    className="rounded-lg border border-purple-200/60 dark:border-purple-800/60 bg-white/60 dark:bg-background/60 p-3 text-center cursor-pointer hover:border-purple-400 transition-all hover:shadow-sm group"
                    onClick={() => pasteAreaRef.current?.focus()}
                    tabIndex={0}
                  >
                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                      <ImageIcon className="h-4 w-4 text-white" />
                    </div>
                    <p className="text-xs font-medium">{tr('截图识别', 'Screenshot AI')}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{tr('自动 OCR 解析', 'Auto OCR Parse')}</p>
                  </div>

                  {/* Upload card */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-emerald-200/60 dark:border-emerald-800/60 bg-white/60 dark:bg-background/60 p-3 text-center hover:border-emerald-400 transition-all hover:shadow-sm group"
                  >
                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                      <Upload className="h-4 w-4 text-white" />
                    </div>
                    <p className="text-xs font-medium">{tr('文件导入', 'File Import')}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{tr('图片/文本文件', 'Image/Text File')}</p>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.txt,.csv,.text"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              </div>

              <p className="text-[11px] text-center text-muted-foreground">
                {tr(
                  '🔒 所有数据仅在本地处理，不会上传至第三方',
                  '🔒 All data is processed locally, never uploaded to third parties'
                )}
              </p>
            </div>
          )}

          {/* Step 4: Parsing (OCR) */}
          {step === 'parsing' && (
            <div className="p-8 flex flex-col items-center justify-center min-h-[260px]">
              <div className="relative mb-6">
                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-xl">
                  <Sparkles className="h-10 w-10 text-white animate-pulse" />
                </div>
                <div className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center">
                  <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                </div>
              </div>
              <p className="text-base font-semibold">{tr('AI 正在识别聊天内容...', 'AI is recognizing chat content...')}</p>
              <p className="text-sm text-muted-foreground mt-2">{tr('通常需要 5-15 秒', 'Usually takes 5-15 seconds')}</p>
            </div>
          )}

          {/* Step 5: Preview */}
          {step === 'preview' && (
            <div className="p-5 space-y-4">
              {/* Success badge */}
              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20 border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    {tr('识别成功', 'Recognized successfully')}
                  </span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold">
                  {parsedMessages.length} {tr('条消息', 'messages')}
                </span>
              </div>

              {/* Sender selection (if multiple senders) */}
              {senderNames.length >= 2 && (
                <div className="rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-2 border-b bg-violet-50/30 dark:bg-violet-950/10">
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
                </div>
              )}

              {/* Message preview */}
              <div className="rounded-xl border overflow-hidden">
                <div className="max-h-[220px] overflow-y-auto divide-y">
                  {parsedMessages.slice(0, 30).map((msg, i) => {
                    const isMe = mySenderName && msg.senderName === mySenderName
                    return (
                      <div key={i} className={cn("px-4 py-2 flex items-start gap-3", isMe ? "bg-blue-50/30 dark:bg-blue-950/10" : "")}>
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
                            {msg.rawTimestamp && (
                              <span className="text-[10px] text-muted-foreground shrink-0">{msg.rawTimestamp}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 break-all">{msg.content}</p>
                        </div>
                      </div>
                    )
                  })}
                  {parsedMessages.length > 30 && (
                    <div className="px-4 py-2 text-center text-xs text-muted-foreground">
                      {tr(`还有 ${parsedMessages.length - 30} 条未显示...`, `${parsedMessages.length - 30} more not shown...`)}
                    </div>
                  )}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 6: Success */}
          {step === 'success' && (
            <div className="p-8 flex flex-col items-center justify-center min-h-[260px]">
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center animate-in zoom-in-50 duration-300 shadow-xl mb-6">
                <CheckCircle2 className="h-10 w-10 text-white" />
              </div>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {tr('导入成功！', 'Import Successful!')}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {tr(`成功导入 ${parsedMessages.length} 条消息`, `Successfully imported ${parsedMessages.length} messages`)}
              </p>
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        {step === 'preview' && (
          <div className="border-t px-6 py-4 flex items-center justify-between bg-muted/20">
            <p className="text-[11px] text-muted-foreground">
              {tr('导入的消息将标记为「历史记录」', 'Imported messages will be tagged as "history"')}
            </p>
            <Button
              onClick={handleImport}
              disabled={parsedMessages.length === 0 || importing}
              className="rounded-lg h-9 gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md px-5"
            >
              {importing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {importing
                ? tr('导入中...', 'Importing...')
                : tr(`确认导入 ${parsedMessages.length} 条`, `Import ${parsedMessages.length} messages`)
              }
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Guide Steps ───
function getGuideSteps(platform: Platform, language: string): { icon: string; text: string }[] {
  const isZh = language === 'zh'

  if (platform === 'wechat') {
    return isZh ? [
      { icon: '💻', text: '打开微信，进入你要导入的聊天窗口' },
      { icon: '📸', text: '截图聊天记录（可以截多张），或长按多选→合并转发→复制文字' },
      { icon: '📋', text: '回到这里，直接 Ctrl+V 粘贴截图或文字' },
    ] : [
      { icon: '💻', text: 'Open WeChat, go to the chat you want to import' },
      { icon: '📸', text: 'Screenshot the chat history, or select messages → merge & forward → copy text' },
      { icon: '📋', text: 'Come back here and Ctrl+V to paste screenshot or text' },
    ]
  }

  if (platform === 'feishu') {
    return isZh ? [
      { icon: '💻', text: '打开飞书，进入你要导入的聊天窗口' },
      { icon: '📸', text: '截图聊天记录，或按住 Shift 多选消息→合并转发→复制' },
      { icon: '📋', text: '回到这里，直接 Ctrl+V 粘贴截图或文字' },
    ] : [
      { icon: '💻', text: 'Open Feishu, go to the chat you want to import' },
      { icon: '📸', text: 'Screenshot the chat, or hold Shift to multi-select → merge & forward → copy' },
      { icon: '📋', text: 'Come back here and Ctrl+V to paste screenshot or text' },
    ]
  }

  // DingTalk
  return isZh ? [
    { icon: '💻', text: '打开钉钉，进入你要导入的聊天窗口' },
    { icon: '📸', text: '截图聊天记录，或选择消息→转发→复制文字' },
    { icon: '📋', text: '回到这里，直接 Ctrl+V 粘贴截图或文字' },
  ] : [
    { icon: '💻', text: 'Open DingTalk, go to the chat you want to import' },
    { icon: '📸', text: 'Screenshot the chat, or select messages → forward → copy text' },
    { icon: '📋', text: 'Come back here and Ctrl+V to paste screenshot or text' },
  ]
}
