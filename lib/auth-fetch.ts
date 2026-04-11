/**
 * Global fetch interceptor for CloudBase authentication.
 *
 * Problem: In WeChat mini-program webview, the JWT token obtained via
 * wx.request → /api/wxlogin is stored in localStorage by MpLoginBridge,
 * but fetch() calls throughout the app don't include auth headers.
 * Cookies set by the API response are NOT shared with the webview context.
 *
 * Solution: Monkey-patch window.fetch to automatically inject auth headers
 * for any /api/ request when a token exists in localStorage.
 */

import { IS_DOMESTIC_VERSION } from '@/config'

const AUTH_TOKEN_KEY = 'chat_app_token'

/**
 * Build authentication headers from the token stored in localStorage.
 * Returns empty object when no token is present.
 */
export function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY) || ''
  if (!token) return {}

  if (IS_DOMESTIC_VERSION) {
    return {
      'x-cloudbase-session': token,
      Authorization: `Bearer ${token}`,
    }
  }

  return { Authorization: `Bearer ${token}` }
}

let _installed = false

/**
 * Install a global fetch interceptor that injects auth headers into every
 * same-origin `/api/` request.  Safe to call multiple times — only the
 * first call takes effect.
 */
export function installAuthFetchInterceptor() {
  if (typeof window === 'undefined') return
  if (_installed) return
  _installed = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    let url = ''
    if (typeof input === 'string') {
      url = input
    } else if (input instanceof URL) {
      url = input.toString()
    } else if (input instanceof Request) {
      url = input.url
    }

    // Only intercept same-origin /api/ requests
    const isApiRequest =
      url.startsWith('/api/') ||
      url.startsWith(window.location.origin + '/api/')

    if (isApiRequest) {
      const authHeaders = getAuthHeaders()
      if (Object.keys(authHeaders).length > 0) {
        const existingHeaders = new Headers(init?.headers || {})
        for (const [key, value] of Object.entries(authHeaders)) {
          // Don't overwrite headers that the caller set explicitly
          if (!existingHeaders.has(key)) {
            existingHeaders.set(key, value)
          }
        }
        init = { ...init, headers: existingHeaders }
      }
    }

    return originalFetch(input, init)
  }
}
