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
  useEffect(() => {
    postClientError({
      type: 'next_global_error',
      message: error?.message || 'Unknown Next global error',
      stack: error?.stack,
      digest: error?.digest,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      href: typeof window !== 'undefined' ? window.location.href : undefined,
    })
  }, [error])

  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
        <div className="w-full max-w-md rounded-lg border bg-background p-6 text-center">
          <h2 className="mb-2 text-lg font-semibold">Application Error</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            A client-side error occurred. Please try again.
          </p>
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
