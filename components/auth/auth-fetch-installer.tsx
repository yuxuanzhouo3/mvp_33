'use client'

import { useEffect } from 'react'
import { installAuthFetchInterceptor } from '@/lib/auth-fetch'

/**
 * Client component that installs the global fetch auth interceptor on mount.
 * Must be placed in the root layout so it runs before any API calls.
 */
export function AuthFetchInstaller() {
  useEffect(() => {
    installAuthFetchInterceptor()
  }, [])

  return null
}
