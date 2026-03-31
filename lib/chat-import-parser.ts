/**
 * Chat Import Parser
 * Parses chat history text from WeChat / Feishu / CSV into a standard ImportedMessage[] array.
 */

export interface ImportedMessage {
  senderName: string
  content: string
  timestamp: string        // ISO string or raw text
  rawTimestamp?: string     // Original timestamp text
  sourceFormat: 'wechat' | 'feishu' | 'csv' | 'unknown'
}

export interface ParseResult {
  messages: ImportedMessage[]
  errors: string[]
  format: 'wechat' | 'feishu' | 'csv' | 'unknown'
}

// ───────── WeChat Parser ─────────
// WeChat merged-forward format (电脑版合并转发复制):
//   张三 2025-03-30 10:00
//   你好，明天开会吗？
//
//   李四 2025-03-30 10:01
//   是的，下午两点
//
// Also handles:
//   张三 2025/3/30 10:00:05
//   张三 3/30 10:00
const WECHAT_HEADER = /^(.+?)\s+(\d{2,4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s*$/

export function parseWechatMessages(text: string): ParseResult {
  const lines = text.split(/\r?\n/)
  const messages: ImportedMessage[] = []
  const errors: string[] = []

  let currentSender: string | null = null
  let currentTimestamp: string | null = null
  let contentLines: string[] = []

  const flush = () => {
    if (currentSender && contentLines.length > 0) {
      const content = contentLines.join('\n').trim()
      if (content) {
        messages.push({
          senderName: currentSender,
          content,
          timestamp: normalizeTimestamp(currentTimestamp || ''),
          rawTimestamp: currentTimestamp || '',
          sourceFormat: 'wechat',
        })
      }
    }
    contentLines = []
  }

  for (const line of lines) {
    const headerMatch = line.match(WECHAT_HEADER)
    if (headerMatch) {
      flush()
      currentSender = headerMatch[1].trim()
      currentTimestamp = headerMatch[2].trim()
    } else {
      // Content line (could be empty line between messages)
      if (currentSender) {
        contentLines.push(line)
      }
    }
  }
  flush()

  if (messages.length === 0 && text.trim().length > 0) {
    errors.push('未能解析出任何消息，请检查格式是否正确')
  }

  return { messages, errors, format: 'wechat' }
}


// ───────── Feishu Parser ─────────
// Feishu merged-forward format:
//   张三 2025-03-30 10:00
//   你好
// Or short format:
//   张三 10:00
//   你好
const FEISHU_HEADER_FULL = /^(.+?)\s+(\d{2,4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s*$/
const FEISHU_HEADER_SHORT = /^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*$/

export function parseFeishuMessages(text: string): ParseResult {
  const lines = text.split(/\r?\n/)
  const messages: ImportedMessage[] = []
  const errors: string[] = []

  let currentSender: string | null = null
  let currentTimestamp: string | null = null
  let contentLines: string[] = []

  const flush = () => {
    if (currentSender && contentLines.length > 0) {
      const content = contentLines.join('\n').trim()
      if (content) {
        messages.push({
          senderName: currentSender,
          content,
          timestamp: normalizeTimestamp(currentTimestamp || ''),
          rawTimestamp: currentTimestamp || '',
          sourceFormat: 'feishu',
        })
      }
    }
    contentLines = []
  }

  for (const line of lines) {
    const fullMatch = line.match(FEISHU_HEADER_FULL)
    const shortMatch = !fullMatch ? line.match(FEISHU_HEADER_SHORT) : null

    if (fullMatch) {
      flush()
      currentSender = fullMatch[1].trim()
      currentTimestamp = fullMatch[2].trim()
    } else if (shortMatch) {
      // Only treat as header if the "name" part doesn't look like content
      const possibleName = shortMatch[1].trim()
      if (possibleName.length <= 20 && !/[，。！？；：、]/.test(possibleName)) {
        flush()
        currentSender = possibleName
        currentTimestamp = shortMatch[2].trim()
      } else {
        if (currentSender) contentLines.push(line)
      }
    } else {
      if (currentSender) contentLines.push(line)
    }
  }
  flush()

  if (messages.length === 0 && text.trim().length > 0) {
    errors.push('未能解析出任何消息，请检查格式是否正确')
  }

  return { messages, errors, format: 'feishu' }
}


// ───────── CSV Parser ─────────
// Expected CSV format:
//   发送者,时间,内容
//   张三,2025-03-30 10:00,你好
export function parseCsvMessages(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const messages: ImportedMessage[] = []
  const errors: string[] = []

  // Skip header row if it looks like one
  let startIdx = 0
  if (lines.length > 0) {
    const firstLine = lines[0].toLowerCase()
    if (firstLine.includes('发送者') || firstLine.includes('sender') ||
        firstLine.includes('时间') || firstLine.includes('time') ||
        firstLine.includes('内容') || firstLine.includes('content')) {
      startIdx = 1
    }
  }

  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(',')
    if (parts.length < 3) {
      errors.push(`第 ${i + 1} 行格式不正确，需要至少3列`)
      continue
    }
    const senderName = parts[0].trim()
    const timestamp = parts[1].trim()
    const content = parts.slice(2).join(',').trim() // Content might contain commas

    if (!senderName || !content) continue

    messages.push({
      senderName,
      content,
      timestamp: normalizeTimestamp(timestamp),
      rawTimestamp: timestamp,
      sourceFormat: 'csv',
    })
  }

  return { messages, errors, format: 'csv' }
}


// ───────── Auto-detect & Parse ─────────
export function autoParseMessages(text: string): ParseResult {
  // Try WeChat first (most common)
  const wechat = parseWechatMessages(text)
  if (wechat.messages.length > 0) return wechat

  // Try Feishu
  const feishu = parseFeishuMessages(text)
  if (feishu.messages.length > 0) return feishu

  // Try CSV
  const csv = parseCsvMessages(text)
  if (csv.messages.length > 0) return csv

  return {
    messages: [],
    errors: ['无法自动识别聊天记录格式，请选择正确的来源标签页'],
    format: 'unknown',
  }
}


// ───────── Helpers ─────────
function normalizeTimestamp(raw: string): string {
  if (!raw) return new Date().toISOString()

  // Try direct parse
  const d = new Date(raw.replace(/\//g, '-'))
  if (!isNaN(d.getTime())) return d.toISOString()

  // If only time (HH:MM or HH:MM:SS), use today's date
  const timeOnly = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (timeOnly) {
    const today = new Date()
    today.setHours(parseInt(timeOnly[1]), parseInt(timeOnly[2]), parseInt(timeOnly[3] || '0'), 0)
    return today.toISOString()
  }

  return new Date().toISOString()
}
