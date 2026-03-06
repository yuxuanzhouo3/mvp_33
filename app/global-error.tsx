'use client'

import { useEffect } from 'react'
import { postClientError } from '@/components/debug/client-error-logger'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const message = error?.message || 'Unknown error'
  const digest = error?.digest || 'n/a'
  const stackLine = (error?.stack || '').split('\n').slice(0, 1).join('')

  useEffect(() => {
    postClientError({
      type: 'next_global_error',
      message,
      stack: error?.stack,
      digest,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      href: typeof window !== 'undefined' ? window.location.href : undefined,
    })
  }, [error, digest, message])

  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
        <div className="w-full max-w-md rounded-lg border bg-background p-6 text-center">
          <h2 className="mb-2 text-lg font-semibold">Application Error</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            A client-side error occurred. Please try again.
          </p>
          <div className="mb-4 rounded border bg-muted/40 p-3 text-left text-xs">
            <p><strong>message:</strong> {message}</p>
            <p><strong>digest:</strong> {digest}</p>
            {stackLine ? <p><strong>stack:</strong> {stackLine}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm text-primary-foreground"
          >
            Retry
          </button>
        </div>
      </body>
    </html>
  )
}
