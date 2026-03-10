import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const DEFAULT_SCOPE = ['app', 'lib', 'actions', 'components', 'config', 'hooks', 'types', 'scripts']
const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.sql', '.css'])
const IGNORED_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git', 'coverage', 'out'])
const MAX_FILE_COUNT = 450
const MAX_FILE_CHARS = 12000
const MAX_BUNDLE_CHARS = 450000

export interface RepoContextFile {
  path: string
  chars: number
  truncated: boolean
  content: string
}

export interface RepoContextBundle {
  rootPath: string
  repoDigest: string
  fileCount: number
  truncated: boolean
  repoScope: string[]
  files: RepoContextFile[]
  combinedText: string
}

function normalizeScope(scope?: string[]): string[] {
  if (!scope || scope.length === 0) {
    return DEFAULT_SCOPE
  }
  return Array.from(new Set(scope.map((item) => item.replace(/^[\\/]+|[\\/]+$/g, '')).filter(Boolean)))
}

async function collectFilesRecursively(rootPath: string, relativeDir: string, files: string[]): Promise<void> {
  if (files.length >= MAX_FILE_COUNT) {
    return
  }

  const currentDir = path.join(rootPath, relativeDir)
  let entries
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (files.length >= MAX_FILE_COUNT) {
      return
    }

    const relativePath = path.posix.join(relativeDir.replace(/\\/g, '/'), entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue
      }
      await collectFilesRecursively(rootPath, relativePath, files)
      continue
    }

    const ext = path.extname(entry.name).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      continue
    }

    files.push(relativePath)
  }
}

export async function buildRepoContextBundle(repoScope?: string[]): Promise<RepoContextBundle> {
  const rootPath = process.cwd()
  const normalizedScope = normalizeScope(repoScope)
  const filePaths: string[] = []

  for (const scopeEntry of normalizedScope) {
    await collectFilesRecursively(rootPath, scopeEntry, filePaths)
    if (filePaths.length >= MAX_FILE_COUNT) {
      break
    }
  }

  filePaths.sort((a, b) => a.localeCompare(b))

  const files: RepoContextFile[] = []
  const parts: string[] = []
  let totalChars = 0
  let truncated = false

  for (const relativePath of filePaths) {
    if (totalChars >= MAX_BUNDLE_CHARS) {
      truncated = true
      break
    }

    const absolutePath = path.join(rootPath, relativePath)
    let raw = ''
    try {
      raw = await fs.readFile(absolutePath, 'utf8')
    } catch {
      continue
    }

    const fileTruncated = raw.length > MAX_FILE_CHARS
    const content = fileTruncated ? raw.slice(0, MAX_FILE_CHARS) : raw
    const block = [`FILE: ${relativePath}`, content, ''].join('\n')

    if (totalChars + block.length > MAX_BUNDLE_CHARS) {
      truncated = true
      break
    }

    totalChars += block.length
    parts.push(block)
    files.push({
      path: relativePath,
      chars: content.length,
      truncated: fileTruncated,
      content,
    })

    if (fileTruncated) {
      truncated = true
    }
  }

  const combinedText = parts.join('\n')
  const repoDigest = createHash('sha1').update(combinedText).digest('hex')

  return {
    rootPath,
    repoDigest,
    fileCount: files.length,
    truncated,
    repoScope: normalizedScope,
    files,
    combinedText,
  }
}
