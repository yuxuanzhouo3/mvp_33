'use client'

import { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'

interface CodeBlockProps {
  code: string
  language?: string
  className?: string
}

// Map language names to Prism-compatible language identifiers
// Prism uses specific language names - see AVAILABLE_LANGUAGES_PRISM.MD
const languageMap: Record<string, string> = {
  'javascript': 'javascript',
  'typescript': 'typescript',
  'python': 'python',
  'java': 'java',
  'cpp': 'cpp',
  'c': 'c',
  'csharp': 'csharp', // Prism supports 'csharp'
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

// Map language identifiers to display names
const languageDisplayNames: Record<string, string> = {
  'javascript': 'JavaScript',
  'typescript': 'TypeScript',
  'python': 'Python',
  'java': 'Java',
  'cpp': 'C++',
  'c': 'C',
  'csharp': 'C#',
  'php': 'PHP',
  'ruby': 'Ruby',
  'go': 'Go',
  'rust': 'Rust',
  'swift': 'Swift',
  'kotlin': 'Kotlin',
  'html': 'HTML',
  'markup': 'HTML', // For markup (HTML/XML)
  'css': 'CSS',
  'scss': 'SCSS',
  'json': 'JSON',
  'xml': 'XML',
  'sql': 'SQL',
  'bash': 'Bash',
  'shell': 'Shell',
  'yaml': 'YAML',
  'markdown': 'Markdown',
  'text': 'Plain Text',
}

// Debug: Log when language is not recognized
const getPrismLanguage = (language: string): string => {
  const normalized = language.toLowerCase()
  const mapped = languageMap[normalized]
  if (!mapped && normalized !== 'text') {
    console.warn(`⚠️ Language "${language}" not found in languageMap, using as-is. Available:`, Object.keys(languageMap))
  }
  return mapped || normalized
}

export function CodeBlock({ code, language = 'text', className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const { language: lang } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(lang, key)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Map the language to Prism-compatible identifier
  const prismLanguage = getPrismLanguage(language)
  const displayLanguage = languageDisplayNames[language.toLowerCase()] || languageDisplayNames[prismLanguage] || language || 'Code'

  return (
    <div className={cn('relative group', className)}>
      {/* Language label */}
      {language && language !== 'text' && (
        <div className="absolute top-0 left-2 z-10">
          <span className="px-2 py-1 text-xs font-medium rounded bg-background/80 backdrop-blur-sm border text-muted-foreground">
            {displayLanguage}
          </span>
        </div>
      )}
      <div className="absolute top-0 right-2 z-10">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCopy}
          className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 mr-1" />
              {t('copied')}
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" />
              {t('copy')}
            </>
          )}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          language={prismLanguage}
          style={oneDark}
          customStyle={{
            margin: 0,
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            lineHeight: '1.5',
            padding: '1rem',
            paddingTop: '1.5rem',
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
            className: `language-${prismLanguage}`,
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}

