'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * 🔧 临时调试组件 - 用于排查微信小程序登录问题
 * 会在页面右下角显示一个浮动的调试面板，记录所有关键的认证事件。
 * 问题排查完成后应该删除此组件。
 */

interface DebugEntry {
  time: string
  tag: string
  msg: string
}

// Global debug log array that can be written to from anywhere
const _debugLog: DebugEntry[] = []

function pushDebug(tag: string, msg: string) {
  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  _debugLog.push({ time, tag, msg })
  // Keep only last 50 entries
  if (_debugLog.length > 50) _debugLog.shift()
  // Dispatch update event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('__debug_log_update'))
  }
}

// Expose globally so other code can call it
if (typeof window !== 'undefined') {
  (window as any).__mpDebug = pushDebug
}

export function MpDebugOverlay() {
  const [entries, setEntries] = useState<DebugEntry[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => {
    setEntries([..._debugLog])
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Make pushDebug globally available (also handle late load)
    ;(window as any).__mpDebug = pushDebug

    // Initial state snapshot
    const token = localStorage.getItem('chat_app_token')
    const user = localStorage.getItem('chat_app_current_user')
    const workspace = localStorage.getItem('chat_app_current_workspace')

    pushDebug('INIT', `页面=${location.pathname}`)
    pushDebug('INIT', `token=${token ? `有(${token.length}字符)` : '无'}`)
    pushDebug('INIT', `user=${user ? '有' : '无'}`)
    pushDebug('INIT', `workspace=${workspace ? '有' : '无'}`)

    if (user) {
      try {
        const u = JSON.parse(user)
        pushDebug('INIT', `user.id=${u.id?.substring(0, 16)}...`)
        pushDebug('INIT', `user.name=${u.full_name || u.username || '?'}`)
      } catch {}
    }
    if (workspace) {
      try {
        const w = JSON.parse(workspace)
        pushDebug('INIT', `ws.id=${w.id?.substring(0, 12)}...`)
        pushDebug('INIT', `ws.name=${w.name || '?'}`)
      } catch {}
    }
    if (token) {
      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
          pushDebug('JWT', `sub=${payload.sub?.substring(0, 16)}...`)
          pushDebug('JWT', `exp=${new Date(payload.exp * 1000).toLocaleString()}`)
          const isExpired = payload.exp * 1000 < Date.now()
          pushDebug('JWT', `已过期=${isExpired ? '⚠️是' : '✅否'}`)
        }
      } catch {}
    }

    refresh()

    // Listen for updates
    window.addEventListener('__debug_log_update', refresh)

    // Monitor navigation changes (detect when router.push/replace fires)
    const origPushState = history.pushState.bind(history)
    const origReplaceState = history.replaceState.bind(history)
    
    history.pushState = function(...args: any) {
      const url = args[2] || ''
      pushDebug('🔀NAV', `pushState → ${url}`)
      return origPushState.apply(this, args as any)
    }
    history.replaceState = function(...args: any) {
      const url = args[2] || ''
      // Don't log URL cleanup (same path)
      const newPath = typeof url === 'string' ? new URL(url, location.origin).pathname : ''
      if (newPath && newPath !== location.pathname) {
        pushDebug('🔀NAV', `replaceState → ${newPath}`)
      }
      return origReplaceState.apply(this, args as any)
    }

    // Intercept fetch to log API auth status
    // IMPORTANT: We need to check auth status CORRECTLY
    // The auth interceptor adds headers inside its wrapper.
    // We wrap OUTSIDE the auth interceptor, so we check:
    // 1. Does localStorage have a token? (means interceptor WILL add it)
    // 2. Does the call already have explicit auth headers?
    const currentFetch = window.fetch
    
    const patchedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      let url = ''
      if (typeof input === 'string') url = input
      else if (input instanceof URL) url = input.toString()
      else if (input instanceof Request) url = input.url

      const isApi = url.startsWith('/api/') || url.includes('/api/')

      if (isApi) {
        const shortUrl = url.replace(/^.*\/api\//, '/api/').split('?')[0].substring(0, 40)
        const headers = new Headers(init?.headers || {})
        const hasExplicitAuth = headers.has('x-cloudbase-session') || headers.has('Authorization') || headers.has('authorization')
        const hasToken = !!localStorage.getItem('chat_app_token')
        
        let authLabel: string
        if (hasExplicitAuth) {
          authLabel = '✅显式'
        } else if (hasToken) {
          authLabel = '🔧拦截器注入'
        } else {
          authLabel = '❌无token!'
        }
        
        pushDebug('FETCH', `${init?.method || 'GET'} ${shortUrl} auth=${authLabel}`)
      }

      try {
        const response = await currentFetch(input, init)

        if (isApi) {
          const shortUrl = url.replace(/^.*\/api\//, '/api/').split('?')[0].substring(0, 40)
          if (response.status === 401) {
            pushDebug('🚨401', `${shortUrl} → 未授权! 服务器拒绝了token!`)
            // Try to read error body for more info
            try {
              const cloned = response.clone()
              const errBody = await cloned.text()
              pushDebug('🚨401', `响应: ${errBody.substring(0, 100)}`)
            } catch {}
          } else if (response.status >= 400) {
            pushDebug('⚠️ERR', `${shortUrl} → ${response.status}`)
            try {
              const cloned = response.clone()
              const errBody = await cloned.text()
              pushDebug('⚠️ERR', `响应: ${errBody.substring(0, 80)}`)
            } catch {}
          } else if (isApi && (url.includes('/conversations') || url.includes('/subscription'))) {
            // Log success for key APIs
            pushDebug('✅API', `${shortUrl} → ${response.status} OK`)
          }
        }

        return response
      } catch (fetchError: any) {
        if (isApi) {
          const shortUrl = url.replace(/^.*\/api\//, '/api/').split('?')[0].substring(0, 40)
          pushDebug('🚨ERR', `${shortUrl} → 网络错误: ${fetchError.message}`)
        }
        throw fetchError
      }
    }

    // Only patch if not already patched
    if (!(window.fetch as any).__debugPatched2) {
      ;(patchedFetch as any).__debugPatched2 = true
      window.fetch = patchedFetch as typeof fetch
    }

    return () => {
      window.removeEventListener('__debug_log_update', refresh)
      history.pushState = origPushState
      history.replaceState = origReplaceState
    }
  }, [refresh])

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [entries])

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed',
          bottom: 10,
          right: 10,
          zIndex: 99999,
          background: 'rgba(0,0,0,0.85)',
          color: '#0f0',
          padding: '6px 12px',
          borderRadius: 8,
          fontSize: 12,
          cursor: 'pointer',
          fontFamily: 'monospace',
        }}
      >
        🔧 调试 ({entries.length})
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 10,
        left: 10,
        right: 10,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.92)',
        color: '#0f0',
        borderRadius: 10,
        fontSize: 11,
        fontFamily: 'monospace',
        maxHeight: '45vh',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #333',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 10px',
          borderBottom: '1px solid #333',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 'bold', color: '#ff0' }}>
          🔧 MP登录调试面板 v2
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <span
            onClick={() => {
              _debugLog.length = 0
              refresh()
            }}
            style={{ cursor: 'pointer', color: '#f88' }}
          >
            清除
          </span>
          <span
            onClick={() => setCollapsed(true)}
            style={{ cursor: 'pointer', color: '#aaa' }}
          >
            收起
          </span>
        </div>
      </div>
      <div
        ref={containerRef}
        style={{
          overflowY: 'auto',
          padding: '4px 10px',
          flex: 1,
        }}
      >
        {entries.map((e, i) => (
          <div key={i} style={{ 
            borderBottom: '1px solid #222', 
            padding: '2px 0',
            color: e.tag.includes('🚨') ? '#f44' 
              : e.tag.includes('⚠️') ? '#fa0' 
              : e.tag.includes('🔀') ? '#f0f'
              : e.tag === 'JWT' ? '#0ff'
              : e.tag === 'FETCH' ? '#aaf'
              : e.tag.includes('✅') ? '#0f0'
              : '#0f0'
          }}>
            <span style={{ color: '#888' }}>{e.time}</span>
            {' '}
            <span style={{ color: '#ff0' }}>[{e.tag}]</span>
            {' '}
            {e.msg}
          </div>
        ))}
        {entries.length === 0 && (
          <div style={{ color: '#666', padding: 8 }}>等待日志...</div>
        )}
      </div>
    </div>
  )
}

export { pushDebug }
