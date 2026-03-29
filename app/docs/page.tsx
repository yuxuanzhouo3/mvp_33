'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { mockAuth } from '@/lib/mock-auth'
import { WorkspaceHeader } from '@/components/chat/workspace-header'
import { AppNavigation } from '@/components/layout/app-navigation'
import { User, Workspace } from '@/lib/types'
import {
  FileText, Plus, FolderOpen, FileSpreadsheet, Presentation, Trash2,
  X, Loader2, ArrowLeft, Save, Bold, Italic, Underline, AlignLeft,
  AlignCenter, AlignRight, List, ListOrdered, ChevronLeft, ChevronRight,
  Image as ImageIcon, Type
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSettings } from '@/lib/settings-context'
import { useIsMobile } from '@/hooks/use-mobile'

interface Doc {
  _id: string
  id?: string
  title: string
  type: 'doc' | 'spreadsheet' | 'slides' | 'folder'
  content: string
  owner_id: string
  owner_name: string
  shared_with: string[]
  updated_at: string
  created_at: string
}

const DOC_TYPES = {
  doc: { icon: FileText, color: 'from-blue-500 to-blue-600', label: { zh: '文档', en: 'Doc' } },
  spreadsheet: { icon: FileSpreadsheet, color: 'from-green-500 to-green-600', label: { zh: '表格', en: 'Sheet' } },
  slides: { icon: Presentation, color: 'from-orange-500 to-orange-600', label: { zh: '演示', en: 'Slides' } },
  folder: { icon: FolderOpen, color: 'from-yellow-500 to-yellow-600', label: { zh: '文件夹', en: 'Folder' } },
}

// ===================== SPREADSHEET EDITOR =====================
function SpreadsheetEditor({ content, onChange, language }: { content: string; onChange: (c: string) => void; language: string }) {
  const ROWS = 20
  const COLS = 10
  const colLetters = Array.from({ length: COLS }, (_, i) => String.fromCharCode(65 + i))

  // Parse content as JSON grid or initialize empty
  const [grid, setGrid] = useState<string[][]>(() => {
    try {
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch { }
    return Array.from({ length: ROWS }, () => Array(COLS).fill(''))
  })
  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null)
  const [editValue, setEditValue] = useState('')

  const updateCell = (r: number, c: number, value: string) => {
    const newGrid = grid.map(row => [...row])
    // Extend grid if needed
    while (newGrid.length <= r) newGrid.push(Array(COLS).fill(''))
    while (newGrid[r].length <= c) newGrid[r].push('')
    newGrid[r][c] = value
    setGrid(newGrid)
    onChange(JSON.stringify(newGrid))
  }

  const handleCellClick = (r: number, c: number) => {
    // Save previous cell
    if (activeCell) {
      updateCell(activeCell.r, activeCell.c, editValue)
    }
    setActiveCell({ r, c })
    setEditValue(grid[r]?.[c] || '')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!activeCell) return
    if (e.key === 'Enter') {
      updateCell(activeCell.r, activeCell.c, editValue)
      // Move to next row
      const nextR = Math.min(activeCell.r + 1, ROWS - 1)
      setActiveCell({ r: nextR, c: activeCell.c })
      setEditValue(grid[nextR]?.[activeCell.c] || '')
      e.preventDefault()
    } else if (e.key === 'Tab') {
      updateCell(activeCell.r, activeCell.c, editValue)
      const nextC = (activeCell.c + 1) % COLS
      const nextR = nextC === 0 ? Math.min(activeCell.r + 1, ROWS - 1) : activeCell.r
      setActiveCell({ r: nextR, c: nextC })
      setEditValue(grid[nextR]?.[nextC] || '')
      e.preventDefault()
    } else if (e.key === 'Escape') {
      setEditValue(grid[activeCell.r]?.[activeCell.c] || '')
      setActiveCell(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Formula bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
        <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded min-w-[40px] text-center">
          {activeCell ? `${colLetters[activeCell.c]}${activeCell.r + 1}` : ''}
        </span>
        <input
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 text-sm border rounded px-2 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={language === 'zh' ? '输入单元格内容...' : 'Enter cell value...'}
        />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse w-full" style={{ minWidth: COLS * 100 }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-[50px] min-w-[50px] bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-medium text-muted-foreground p-0 h-7"></th>
              {colLetters.map(letter => (
                <th key={letter} className="min-w-[100px] bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-medium text-muted-foreground p-0 h-7 text-center">
                  {letter}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ROWS }).map((_, r) => (
              <tr key={r}>
                <td className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-xs text-center text-muted-foreground font-medium h-8 w-[50px]">
                  {r + 1}
                </td>
                {Array.from({ length: COLS }).map((_, c) => {
                  const isActive = activeCell?.r === r && activeCell?.c === c
                  return (
                    <td
                      key={c}
                      onClick={() => handleCellClick(r, c)}
                      className={`border border-gray-200 dark:border-gray-700 h-8 p-0 cursor-cell relative
                        ${isActive ? 'ring-2 ring-blue-500 ring-inset z-10 bg-blue-50/30 dark:bg-blue-950/20' : 'hover:bg-blue-50/20'}`}
                    >
                      {isActive ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={() => { updateCell(r, c, editValue) }}
                          className="w-full h-full px-1.5 text-sm bg-transparent focus:outline-none absolute inset-0"
                        />
                      ) : (
                        <span className="px-1.5 text-sm truncate block leading-8">
                          {grid[r]?.[c] || ''}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ===================== SLIDES EDITOR =====================
function SlidesEditor({ content, onChange, language }: { content: string; onChange: (c: string) => void; language: string }) {
  // Each slide: { title, body, bg }
  const [slides, setSlides] = useState<Array<{ title: string; body: string; bg: string }>>(() => {
    try {
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch { }
    return [{ title: language === 'zh' ? '标题幻灯片' : 'Title Slide', body: '', bg: '#ffffff' }]
  })
  const [currentSlide, setCurrentSlide] = useState(0)

  const BG_COLORS = ['#ffffff', '#1e293b', '#0f172a', '#1e3a5f', '#2d1b4e', '#1a2e1a']

  const updateSlide = (index: number, field: string, value: string) => {
    const newSlides = slides.map((s, i) => i === index ? { ...s, [field]: value } : s)
    setSlides(newSlides)
    onChange(JSON.stringify(newSlides))
  }

  const addSlide = () => {
    const newSlides = [...slides, { title: '', body: '', bg: '#ffffff' }]
    setSlides(newSlides)
    setCurrentSlide(newSlides.length - 1)
    onChange(JSON.stringify(newSlides))
  }

  const deleteSlide = (index: number) => {
    if (slides.length <= 1) return
    const newSlides = slides.filter((_, i) => i !== index)
    setSlides(newSlides)
    setCurrentSlide(Math.min(currentSlide, newSlides.length - 1))
    onChange(JSON.stringify(newSlides))
  }

  const slide = slides[currentSlide]
  const isDark = slide?.bg !== '#ffffff'

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
        <Button variant="outline" size="sm" onClick={addSlide} className="gap-1.5 text-xs h-7">
          <Plus className="h-3.5 w-3.5" />
          {language === 'zh' ? '添加幻灯片' : 'Add Slide'}
        </Button>
        <span className="text-xs text-muted-foreground mx-2">
          {currentSlide + 1} / {slides.length}
        </span>
        <div className="flex-1" />
        <div className="flex gap-1">
          {BG_COLORS.map(bg => (
            <button key={bg} onClick={() => updateSlide(currentSlide, 'bg', bg)}
              className={`w-6 h-6 rounded border-2 transition-transform ${slide?.bg === bg ? 'ring-2 ring-blue-500 scale-110' : 'hover:scale-110'}`}
              style={{ backgroundColor: bg, borderColor: bg === '#ffffff' ? '#e5e7eb' : bg }} />
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Slide thumbnails panel */}
        <div className="w-[160px] border-r bg-muted/20 overflow-y-auto p-2 space-y-2">
          {slides.map((s, i) => (
            <div key={i} onClick={() => setCurrentSlide(i)}
              className={`relative group rounded-lg border-2 p-2 cursor-pointer transition-colors aspect-[16/9] flex flex-col justify-center items-center
                ${i === currentSlide ? 'border-blue-500 shadow-sm' : 'border-transparent hover:border-gray-300'}`}
              style={{ backgroundColor: s.bg }}>
              <span className="absolute top-0.5 left-1.5 text-[9px] text-muted-foreground">{i + 1}</span>
              <p className={`text-[8px] font-bold text-center truncate w-full px-1 ${s.bg !== '#ffffff' ? 'text-white' : 'text-gray-800'}`}>
                {s.title || (language === 'zh' ? '无标题' : 'Untitled')}
              </p>
              {slides.length > 1 && (
                <button onClick={e => { e.stopPropagation(); deleteSlide(i) }}
                  className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Slide editor */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-100 dark:bg-gray-900/50">
          <div className="w-full max-w-[800px] aspect-[16/9] rounded-lg shadow-xl flex flex-col justify-center p-8 sm:p-12 transition-colors"
            style={{ backgroundColor: slide?.bg || '#ffffff' }}>
            <input
              value={slide?.title || ''}
              onChange={e => updateSlide(currentSlide, 'title', e.target.value)}
              className={`text-2xl sm:text-4xl font-bold text-center mb-4 bg-transparent border-none focus:outline-none w-full
                ${isDark ? 'text-white placeholder:text-white/40' : 'text-gray-800 placeholder:text-gray-300'}`}
              placeholder={language === 'zh' ? '点击添加标题' : 'Click to add title'}
            />
            <textarea
              value={slide?.body || ''}
              onChange={e => updateSlide(currentSlide, 'body', e.target.value)}
              className={`flex-1 text-sm sm:text-lg text-center bg-transparent border-none focus:outline-none w-full resize-none leading-relaxed
                ${isDark ? 'text-white/80 placeholder:text-white/30' : 'text-gray-600 placeholder:text-gray-300'}`}
              placeholder={language === 'zh' ? '点击添加内容...' : 'Click to add content...'}
            />
          </div>

          {/* Slide navigation */}
          <div className="flex items-center gap-4 mt-4">
            <Button variant="outline" size="icon" className="h-8 w-8"
              disabled={currentSlide === 0}
              onClick={() => setCurrentSlide(currentSlide - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{currentSlide + 1} / {slides.length}</span>
            <Button variant="outline" size="icon" className="h-8 w-8"
              disabled={currentSlide === slides.length - 1}
              onClick={() => setCurrentSlide(currentSlide + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===================== RICH TEXT EDITOR =====================
function RichTextEditor({ content, onChange, language }: { content: string; onChange: (c: string) => void; language: string }) {
  const editorRef = useRef<HTMLDivElement>(null)

  // Initialize content
  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML && content) {
      editorRef.current.innerHTML = content
    }
  }, [])

  const execCommand = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
    if (editorRef.current) onChange(editorRef.current.innerHTML)
    // Force re-render for active state tracking
    setActiveStates(getActiveStates())
  }

  const handleInput = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML)
    setActiveStates(getActiveStates())
  }

  const getActiveStates = () => ({
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
    justifyLeft: document.queryCommandState('justifyLeft'),
    justifyCenter: document.queryCommandState('justifyCenter'),
    justifyRight: document.queryCommandState('justifyRight'),
    insertUnorderedList: document.queryCommandState('insertUnorderedList'),
    insertOrderedList: document.queryCommandState('insertOrderedList'),
  })

  const [activeStates, setActiveStates] = useState({
    bold: false, italic: false, underline: false,
    justifyLeft: false, justifyCenter: false, justifyRight: false,
    insertUnorderedList: false, insertOrderedList: false,
  })

  // Update active states on selection change
  useEffect(() => {
    const handleSelectionChange = () => setActiveStates(getActiveStates())
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [])

  const tbBtn = (cmd: string, active: boolean) =>
    `p-1.5 rounded transition-colors ${active ? 'bg-primary/15 text-primary shadow-sm' : 'hover:bg-muted'}`

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b bg-muted/30 flex-wrap">
        <button onClick={() => execCommand('bold')} className={tbBtn('bold', activeStates.bold)} title="Bold">
          <Bold className="h-4 w-4" />
        </button>
        <button onClick={() => execCommand('italic')} className={tbBtn('italic', activeStates.italic)} title="Italic">
          <Italic className="h-4 w-4" />
        </button>
        <button onClick={() => execCommand('underline')} className={tbBtn('underline', activeStates.underline)} title="Underline">
          <Underline className="h-4 w-4" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <button onClick={() => execCommand('justifyLeft')} className={tbBtn('justifyLeft', activeStates.justifyLeft)}>
          <AlignLeft className="h-4 w-4" />
        </button>
        <button onClick={() => execCommand('justifyCenter')} className={tbBtn('justifyCenter', activeStates.justifyCenter)}>
          <AlignCenter className="h-4 w-4" />
        </button>
        <button onClick={() => execCommand('justifyRight')} className={tbBtn('justifyRight', activeStates.justifyRight)}>
          <AlignRight className="h-4 w-4" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <button onClick={() => execCommand('insertUnorderedList')} className={tbBtn('insertUnorderedList', activeStates.insertUnorderedList)}>
          <List className="h-4 w-4" />
        </button>
        <button onClick={() => execCommand('insertOrderedList')} className={tbBtn('insertOrderedList', activeStates.insertOrderedList)}>
          <ListOrdered className="h-4 w-4" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <select onChange={e => execCommand('formatBlock', e.target.value)} defaultValue=""
          className="text-xs border rounded px-1.5 py-1 bg-background">
          <option value="" disabled>{language === 'zh' ? '段落样式' : 'Style'}</option>
          <option value="p">{language === 'zh' ? '正文' : 'Normal'}</option>
          <option value="h1">{language === 'zh' ? '标题 1' : 'Heading 1'}</option>
          <option value="h2">{language === 'zh' ? '标题 2' : 'Heading 2'}</option>
          <option value="h3">{language === 'zh' ? '标题 3' : 'Heading 3'}</option>
        </select>
        <select onChange={e => execCommand('fontSize', e.target.value)} defaultValue=""
          className="text-xs border rounded px-1.5 py-1 bg-background">
          <option value="" disabled>{language === 'zh' ? '字号' : 'Size'}</option>
          <option value="1">12px</option>
          <option value="2">14px</option>
          <option value="3">16px</option>
          <option value="4">18px</option>
          <option value="5">24px</option>
          <option value="6">32px</option>
        </select>
      </div>

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="flex-1 p-6 focus:outline-none overflow-y-auto text-sm leading-relaxed min-h-[300px]"
        style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
        data-placeholder={language === 'zh' ? '开始编写文档...' : 'Start writing...'}
        suppressContentEditableWarning
      />
    </div>
  )
}

// ===================== MAIN PAGE =====================
export default function DocsPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<User | null>(() => mockAuth.getCurrentUser())
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(() => mockAuth.getCurrentWorkspace())
  const isMobile = useIsMobile()
  const { language } = useSettings()
  const [activeTab, setActiveTab] = useState<'recent' | 'my' | 'shared'>('recent')
  const [documents, setDocuments] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState<'doc' | 'spreadsheet' | 'slides'>('doc')

  // Editor state
  const [editingDoc, setEditingDoc] = useState<Doc | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)

  useEffect(() => {
    const user = mockAuth.getCurrentUser()
    const workspace = mockAuth.getCurrentWorkspace()
    if (!user || !workspace) { router.push('/login'); return }
    setCurrentUser(user)
    setCurrentWorkspace(workspace)
  }, [router])

  const handleWorkspaceChange = (nw: Workspace) => setCurrentWorkspace(nw)

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/docs?tab=${activeTab}`)
      const data = await res.json()
      if (data.success) setDocuments(data.documents || [])
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    if (currentUser) fetchDocuments()
  }, [currentUser, fetchDocuments])

  const createDocument = async (typeOverride?: 'doc' | 'spreadsheet' | 'slides') => {
    const docType = typeOverride || newType
    const titleToUse = newTitle || getDefaultTitle(docType)
    setCreating(true)
    try {
      // Generate default content based on type
      let defaultContent = ''
      if (docType === 'spreadsheet') {
        defaultContent = JSON.stringify(Array.from({ length: 20 }, () => Array(10).fill('')))
      } else if (docType === 'slides') {
        defaultContent = JSON.stringify([{
          title: titleToUse,
          body: language === 'zh' ? '点击编辑内容' : 'Click to edit content',
          bg: '#ffffff'
        }])
      }

      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleToUse, type: docType, content: defaultContent }),
      })
      const data = await res.json()
      if (data.success && data.document) {
        setDocuments(prev => [data.document, ...prev])
        setShowCreateDialog(false)
        setNewTitle('')
        setNewType('doc')
        // Open editor immediately
        openDocument(data.document)
      }
    } catch (err) {
      console.error('Failed to create document:', err)
    } finally {
      setCreating(false)
    }
  }

  const getDefaultTitle = (type: string) => {
    const now = new Date().toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')
    switch (type) {
      case 'spreadsheet': return language === 'zh' ? `无标题表格 ${now}` : `Untitled Sheet ${now}`
      case 'slides': return language === 'zh' ? `无标题演示 ${now}` : `Untitled Slides ${now}`
      default: return language === 'zh' ? `无标题文档 ${now}` : `Untitled Doc ${now}`
    }
  }

  const deleteDocument = async (docId: string) => {
    try {
      await fetch(`/api/docs?id=${docId}`, { method: 'DELETE' })
      setDocuments(prev => prev.filter(d => (d._id || d.id) !== docId))
    } catch (err) {
      console.error('Failed to delete document:', err)
    }
  }

  const saveDocument = async () => {
    if (!editingDoc) return
    setSaving(true)
    try {
      const docId = editingDoc._id || editingDoc.id
      await fetch('/api/docs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: docId, title: editTitle, content: editContent }),
      })
      setLastSaved(new Date().toLocaleTimeString())
      setDocuments(prev => prev.map(d => {
        if ((d._id || d.id) === docId) {
          return { ...d, title: editTitle, content: editContent, updated_at: new Date().toISOString() }
        }
        return d
      }))
    } catch (err) {
      console.error('Failed to save document:', err)
    } finally {
      setSaving(false)
    }
  }

  const openDocument = (doc: Doc) => {
    setEditingDoc(doc)
    setEditContent(doc.content || '')
    setEditTitle(doc.title)
    setLastSaved(null)
  }

  const closeEditor = () => {
    setEditingDoc(null)
    setEditContent('')
    setEditTitle('')
    setLastSaved(null)
  }

  if (!currentUser || !currentWorkspace) {
    return <div className="flex h-screen mobile-app-shell items-center justify-center text-sm text-muted-foreground">Loading...</div>
  }

  const tabs = [
    { key: 'recent' as const, label: language === 'zh' ? '最近' : 'Recent' },
    { key: 'my' as const, label: language === 'zh' ? '我的文档' : 'My Docs' },
    { key: 'shared' as const, label: language === 'zh' ? '共享' : 'Shared' },
  ]

  const quickCreateTypes = [
    { type: 'doc' as const, ...DOC_TYPES.doc },
    { type: 'spreadsheet' as const, ...DOC_TYPES.spreadsheet },
    { type: 'slides' as const, ...DOC_TYPES.slides },
  ]

  // Render type-specific editor
  const renderEditor = () => {
    if (!editingDoc) return null

    const typeInfo = DOC_TYPES[editingDoc.type] || DOC_TYPES.doc
    const Icon = typeInfo.icon

    return (
      <>
        {/* Editor Header */}
        <div className="border-b px-4 py-2 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={closeEditor}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${typeInfo.color} flex items-center justify-center shrink-0`}>
            <Icon className="h-3.5 w-3.5 text-white" />
          </div>
          <Input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            className="text-base font-semibold border-none shadow-none focus-visible:ring-0 px-0 h-auto flex-1"
            placeholder={language === 'zh' ? '无标题' : 'Untitled'}
          />
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium uppercase">
              {typeInfo.label[language]}
            </span>
            {lastSaved && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {language === 'zh' ? `已保存 ${lastSaved}` : `Saved ${lastSaved}`}
              </span>
            )}
            <Button size="sm" onClick={saveDocument} disabled={saving} className="gap-1.5 h-8">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {language === 'zh' ? '保存' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Type-specific editor body */}
        <div className="flex-1 overflow-hidden">
          {editingDoc.type === 'spreadsheet' ? (
            <SpreadsheetEditor content={editContent} onChange={setEditContent} language={language} />
          ) : editingDoc.type === 'slides' ? (
            <SlidesEditor content={editContent} onChange={setEditContent} language={language} />
          ) : (
            <RichTextEditor content={editContent} onChange={setEditContent} language={language} />
          )}
        </div>
      </>
    )
  }

  return (
    <div className="flex h-screen flex-col mobile-app-shell mobile-overscroll-contain">
      <WorkspaceHeader workspace={currentWorkspace} currentUser={currentUser} onWorkspaceChange={handleWorkspaceChange} />

      <div className="relative flex flex-1 min-w-0 overflow-hidden mobile-overscroll-contain">
        {!isMobile && <AppNavigation />}

        <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
          {editingDoc ? renderEditor() : (
            /* ============ LIST VIEW ============ */
            <>
              <div className="border-b px-6 py-4 shrink-0">
                <div className="flex items-center justify-between">
                  <h1 className="text-xl font-bold">{language === 'zh' ? '云文档' : 'Cloud Docs'}</h1>
                  <Button size="sm" className="gap-2" onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4" />
                    {language === 'zh' ? '新建' : 'New'}
                  </Button>
                </div>
              </div>

              {/* Quick Create */}
              <div className="px-6 py-4 border-b shrink-0">
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {quickCreateTypes.map(t => {
                    const Icon = t.icon
                    return (
                      <button key={t.type}
                        onClick={() => {
                          setNewType(t.type as any)
                          setNewTitle('')
                          setShowCreateDialog(true)
                        }}
                        className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors shrink-0 min-w-[80px]">
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center shadow-sm`}>
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">
                          {language === 'zh' ? `新建${t.label.zh}` : `New ${t.label.en}`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tabs */}
              <div className="px-6 py-3 border-b shrink-0">
                <div className="flex gap-1">
                  {tabs.map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                        ${activeTab === tab.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Document List */}
              <div className="flex-1 p-6 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    {language === 'zh' ? '正在加载...' : 'Loading...'}
                  </div>
                ) : documents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <FileText className="h-20 w-20 mb-4 opacity-15" />
                    <h3 className="text-lg font-semibold mb-2">{language === 'zh' ? '暂无文档' : 'No documents yet'}</h3>
                    <p className="text-sm mb-6">{language === 'zh' ? '创建或上传文档开始协作' : 'Create documents to start collaborating'}</p>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowCreateDialog(true)}>
                      <Plus className="h-4 w-4" />
                      {language === 'zh' ? '创建第一个文档' : 'Create your first document'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map(doc => {
                      const typeInfo = DOC_TYPES[doc.type] || DOC_TYPES.doc
                      const Icon = typeInfo.icon
                      return (
                        <div key={doc._id || doc.id}
                          className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/30 cursor-pointer transition-colors group"
                          onClick={() => openDocument(doc)}>
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${typeInfo.color} flex items-center justify-center shrink-0`}>
                            <Icon className="h-5 w-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{doc.title}</p>
                            <p className="text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                {typeInfo.label[language]}
                              </span>
                              {' · '}{doc.owner_name}
                              {' · '}{new Date(doc.updated_at).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}
                            </p>
                          </div>
                          <Button variant="ghost" size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600 shrink-0"
                            onClick={e => { e.stopPropagation(); deleteDocument(doc._id || doc.id!) }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {isMobile && <AppNavigation mobile />}

      {/* Create Document Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateDialog(false)}>
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{language === 'zh' ? '新建' : 'New Document'}</h2>
              <button onClick={() => setShowCreateDialog(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">{language === 'zh' ? '标题' : 'Title'}</label>
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder={getDefaultTitle(newType)} autoFocus />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">{language === 'zh' ? '类型' : 'Type'}</label>
                <div className="flex gap-3">
                  {(['doc', 'spreadsheet', 'slides'] as const).map(t => {
                    const info = DOC_TYPES[t]
                    const Icon = info.icon
                    return (
                      <button key={t} onClick={() => setNewType(t)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-colors flex-1
                          ${newType === t ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20' : 'border-transparent hover:bg-muted/50'}`}>
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${info.color} flex items-center justify-center`}>
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-xs font-medium">{info.label[language]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <Button className="w-full" onClick={() => createDocument()} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                {language === 'zh' ? '创建' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
