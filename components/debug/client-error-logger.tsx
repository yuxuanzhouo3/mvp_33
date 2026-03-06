'use client'

import { useEffect } from 'react'

type ErrorPayload = {
  type: 'window_error' | 'unhandled_rejection' | 'next_global_error'
  message?: string
  stack?: string
  digest?: string
  url?: string
  line?: number
  column?: number
  userAgent?: string
  href?: string
  extra?: any
}

function postClientError(payload: ErrorPayload) {
  try {
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
  } catch {
    // Ignore reporter failures.
  }
}

export function ClientErrorLogger() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      postClientError({
        type: 'window_error',
        message: event.message || 'Unknown window error',
        stack: event.error?.stack,
        url: event.filename,
        line: event.lineno,
        column: event.colno,
        userAgent: navigator.userAgent,
        href: window.location.href,
      })
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as any
      postClientError({
        type: 'unhandled_rejection',
        message: String(reason?.message || reason || 'Unhandled rejection'),
        stack: reason?.stack,
        userAgent: navigator.userAgent,
        href: window.location.href,
        extra: {
          reasonType: typeof reason,
        },
      })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  return null
}

export { postClientError }
