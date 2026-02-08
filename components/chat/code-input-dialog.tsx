'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Code2, Copy, Check, Eye } from 'lucide-react'

// Map language names to Prism-compatible language identifiers
const languageMap: Record<string, string> = {
  'javascript': 'javascript',
  'typescript': 'typescript',
  'python': 'python',
  'java': 'java',
  'cpp': 'cpp',
  'c': 'c',
  'csharp': 'csharp',
  'php': 'php',
  'ruby': 'ruby',
  'go': 'go',
  'rust': 'rust',
  'swift': 'swift',
  'kotlin': 'kotlin',
  'html': 'markup', // Prism uses 'markup' for HTML
  'css': 'css',
  'scss': 'scss',
  'json': 'json',
  'xml': 'markup', // Prism uses 'markup' for XML
  'sql': 'sql',
  'bash': 'bash',
  'shell': 'bash', // Map shell to bash
  'yaml': 'yaml',
  'markdown': 'markdown',
  'text': 'text',
}

const getPrismLanguage = (language: string): string => {
  const normalized = language.toLowerCase()
  const mapped = languageMap[normalized] || normalized
  // Debug: Log language mapping
  console.log('🔍 CodeInputDialog language:', { original: language, normalized, mapped })
  return mapped
}

interface CodeInputDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSend: (code: string, language: string) => void
}

const codeLanguages = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'csharp', label: 'C#' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'shell', label: 'Shell' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'text', label: 'Plain Text' },
]

export function CodeInputDialog({ open, onOpenChange, onSend }: CodeInputDialogProps) {
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('javascript')
  const [copied, setCopied] = useState(false)

  const handleSend = () => {
    if (code.trim()) {
      onSend(code.trim(), language)
      setCode('')
      setLanguage('javascript')
      onOpenChange(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" style={{ imageRendering: 'crisp-edges', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            分享代码
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">语言:</span>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {codeLanguages.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {code && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                className="ml-auto gap-2"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    复制
                  </>
                )}
              </Button>
            )}
          </div>
          
          <Tabs defaultValue="input" className="w-full flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="input">编辑</TabsTrigger>
              <TabsTrigger value="preview" disabled={!code.trim()}>
                <Eye className="h-4 w-4 mr-1" />
                预览
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="input" className="mt-2">
              <Textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="粘贴或输入代码..."
                className="font-mono text-sm min-h-[300px] resize-none"
                spellCheck={false}
              />
            </TabsContent>
            
            <TabsContent value="preview" className="mt-2">
              <div className="relative rounded-lg overflow-hidden border max-h-[400px] overflow-auto">
                {code.trim() ? (
                  <SyntaxHighlighter
                    language={getPrismLanguage(language)}
                    style={oneDark}
                    customStyle={{
                      margin: 0,
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      lineHeight: '1.5',
                      padding: '1rem',
                      minHeight: '300px',
                      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                      WebkitFontSmoothing: 'antialiased',
                      MozOsxFontSmoothing: 'grayscale',
                      textRendering: 'optimizeLegibility',
                    }}
                    showLineNumbers
                    wrapLines={false}
                    PreTag="div"
                    CodeTag="code"
                    codeTagProps={{
                      className: `language-${getPrismLanguage(language)}`,
                    }}
                  >
                    {code}
                  </SyntaxHighlighter>
                ) : (
                  <div className="min-h-[300px] flex items-center justify-center text-muted-foreground">
                    请输入代码以查看预览
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSend} disabled={!code.trim()}>
            发送
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


