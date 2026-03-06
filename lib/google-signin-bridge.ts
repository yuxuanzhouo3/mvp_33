'use client'

interface GoogleSignInResult {
  success: boolean
  idToken?: string
  email?: string
  displayName?: string
  error?: string
}

interface GoogleSignInBridge {
  signIn(clientId: string, callback: string): void
  signOut(callback: string): void
  getCurrentUser(): string | null
}

declare global {
  interface Window {
    GoogleSignIn?: GoogleSignInBridge
  }
}

export function isAndroidWebView(): boolean {
  return typeof window !== 'undefined' && !!window.GoogleSignIn
}

export function signInWithGoogle(clientId: string): Promise<GoogleSignInResult> {
  return new Promise((resolve, reject) => {
    if (!isAndroidWebView()) {
      reject(new Error('Not running in Android WebView'))
      return
    }

    const callbackName = `googleSignInCallback_${Date.now()}`
    ;(window as any)[callbackName] = (result: GoogleSignInResult) => {
      delete (window as any)[callbackName]
      if (result?.success) {
        resolve(result)
      } else {
        reject(new Error(result?.error || 'Sign in failed'))
      }
    }

    try {
      window.GoogleSignIn!.signIn(clientId, callbackName)
    } catch (error) {
      delete (window as any)[callbackName]
      reject(error)
    }
  })
}

export function signOutGoogle(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isAndroidWebView()) {
      reject(new Error('Not running in Android WebView'))
      return
    }

    const callbackName = `googleSignOutCallback_${Date.now()}`
    const timeoutId = window.setTimeout(() => {
      delete (window as any)[callbackName]
      reject(new Error('Google signOut timeout'))
    }, 2000)

    ;(window as any)[callbackName] = (result: GoogleSignInResult) => {
      window.clearTimeout(timeoutId)
      delete (window as any)[callbackName]
      if (result?.success) {
        resolve()
      } else {
        reject(new Error(result?.error || 'Sign out failed'))
      }
    }

    try {
      window.GoogleSignIn!.signOut(callbackName)
    } catch (error) {
      window.clearTimeout(timeoutId)
      delete (window as any)[callbackName]
      reject(error)
    }
  })
}
