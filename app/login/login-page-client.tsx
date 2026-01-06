'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { LoginForm } from '@/components/auth/login-form'
import { RegisterForm } from '@/components/auth/register-form'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { WorkspaceSelector } from '@/components/workspace/workspace-selector'
import { mockAuth } from '@/lib/mock-auth'
import { Workspace } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/lib/settings-context'
import { Languages } from 'lucide-react'

const OAUTH_TOKEN_KEY = 'chat_app_last_oauth_token'

interface LoginPageClientProps {
  initialStep?: 'login' | 'workspace'
}

export default function LoginPageClient({ initialStep = 'login' }: LoginPageClientProps) {
  const router = useRouter()
  const [step, setStep] = useState<'login' | 'register' | 'reset-password' | 'workspace'>(initialStep)
  const { language, setLanguage } = useSettings()
  const oauthProcessedRef = useRef(false) // Prevent duplicate OAuth processing
  const initialStepSetRef = useRef(initialStep === 'workspace') // Track if initial step has been set

  useEffect(() => {
    // CRITICAL: Set initial step on client side only (after hydration)
    // This prevents hydration mismatch between server and client
    if (!initialStepSetRef.current) {
      const clientSearchParams = new URLSearchParams(window.location.search)
      const oauth = clientSearchParams.get('oauth')
      
      // If OAuth callback, set to workspace immediately
      if (oauth === 'success') {
        setStep('workspace')
        initialStepSetRef.current = true
        // Don't return here, continue to process OAuth below
      } else {
        // Check if user is already logged in but no workspace
        const user = mockAuth.getCurrentUser()
        const workspace = mockAuth.getCurrentWorkspace()
        
        if (user && !workspace) {
          setStep('workspace')
        } else if (user && workspace) {
          // User has both, redirect to chat
          router.replace('/chat')
          return
        }
        
        initialStepSetRef.current = true
      }
    }

    // Handle OAuth callback FIRST (before checking existing login)
    const clientSearchParams = new URLSearchParams(window.location.search)
    const oauth = clientSearchParams.get('oauth')
    const token = clientSearchParams.get('token')
    const userParam = clientSearchParams.get('user')
    const error = clientSearchParams.get('error')

    const getProcessedToken = () => {
      if (typeof window === 'undefined') return null
      return sessionStorage.getItem(OAUTH_TOKEN_KEY)
    }

    const markTokenProcessed = (tokenValue: string) => {
      if (typeof window === 'undefined') return
      sessionStorage.setItem(OAUTH_TOKEN_KEY, tokenValue)
    }

    // CRITICAL: Only process OAuth callback once
    if (oauth === 'success' && token && userParam && !oauthProcessedRef.current) {
      const alreadyProcessed = getProcessedToken() === token
      if (alreadyProcessed) {
        console.log('⚠️ OAuth token already processed, skipping duplicate handling')
        // Check if workspace is already set
        const existingWorkspace = mockAuth.getCurrentWorkspace()
        if (existingWorkspace) {
          console.log('✅ Workspace already set, redirecting to chat...')
          router.replace('/chat')
        } else {
          setStep('workspace')
        }
        return
      }

      markTokenProcessed(token)
      oauthProcessedRef.current = true // Mark as processed immediately
      
      try {
        const user = JSON.parse(userParam)
        console.log('✅ OAuth callback received, storing user data...')
        // Store user and token
        if (typeof window !== 'undefined') {
          localStorage.setItem('chat_app_current_user', JSON.stringify(user))
          localStorage.setItem('chat_app_token', token)
        }
        
        // Check if user already has a workspace
        const existingWorkspace = mockAuth.getCurrentWorkspace()
        if (existingWorkspace) {
          console.log('✅ User has workspace, redirecting to chat...')
          // Use replace instead of push to avoid adding to history
          router.replace('/chat')
        } else {
          console.log('✅ User logged in, showing workspace selector...')
          setStep('workspace')
        }
        
        return // Exit early to prevent further processing
      } catch (err) {
        console.error('Failed to parse OAuth user data:', err)
        oauthProcessedRef.current = false // Reset on error
      }
    } else if (error && !oauthProcessedRef.current) {
      console.error('OAuth error:', error)
      // You might want to show an error message to the user
    }

    // CRITICAL: If we're on workspace step, don't check for redirect
    // This prevents the effect from redirecting away while user is selecting workspace
    if (step === 'workspace') {
      return
    }

    // Check if already logged in (only if not processing OAuth callback)
    // Skip this check if we just processed OAuth to avoid race conditions
    if (oauthProcessedRef.current) {
      return
    }
    
    const user = mockAuth.getCurrentUser()
    const workspace = mockAuth.getCurrentWorkspace()
    
    if (user && workspace) {
      // User is already logged in with workspace, redirect to chat
      router.replace('/chat')
    } else if (user && initialStepSetRef.current && step !== 'workspace') {
      // User is logged in but no workspace selected
      // Only update if initial step has been set to avoid unnecessary updates
      // And only if we're not already on workspace step
      setStep('workspace')
    }
  }, [router, step]) // Add 'step' back to dependencies to check it

  const handleLoginSuccess = () => {
    setStep('workspace')
  }

  const handleWorkspaceSelect = async (workspace: Workspace) => {
    // CRITICAL: Ensure workspace is saved before any async operations
    // WorkspaceSelector already calls mockAuth.setCurrentWorkspace, but we'll ensure it here too
    console.log('🔧 [WORKSPACE SELECT] Starting workspace selection:', workspace.id)
    mockAuth.setCurrentWorkspace(workspace)
    
    // CRITICAL: Verify immediately after saving
    const verifyWorkspace = mockAuth.getCurrentWorkspace()
    if (!verifyWorkspace) {
      console.error('❌ [WORKSPACE SELECT] Workspace not saved after setCurrentWorkspace! Retrying...')
      // Try again with explicit localStorage call
      if (typeof window !== 'undefined') {
        localStorage.setItem('chat_app_current_workspace', JSON.stringify(workspace))
        console.log('🔧 [WORKSPACE SELECT] Manually saved workspace to localStorage')
      }
    } else {
      console.log('✅ [WORKSPACE SELECT] Workspace verified in localStorage:', verifyWorkspace.id)
    }
    
    // IMPORTANT: Add user to workspace_members in database
    // This ensures the user is properly associated with the workspace
    // and avoids the slow upsert operation in conversations API
    try {
      // Try to join workspace via API
      const response = await fetch('/api/workspaces/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspace_id: workspace.id,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        console.log('✅ [WORKSPACE SELECT] Successfully joined workspace:', workspace.id, data)
      } else {
        // If API doesn't exist (404) or fails, that's okay
        // The conversations API will handle adding the user to workspace_members
        const errorText = await response.text()
        console.log('⚠️ [WORKSPACE SELECT] Workspace join API not available or failed (this is okay):', {
          status: response.status,
          error: errorText
        })
      }
    } catch (error) {
      // Network error or API doesn't exist - that's okay
      // The conversations API will handle it
      console.log('⚠️ [WORKSPACE SELECT] Workspace join API call failed (this is okay, will be handled by conversations API):', error)
    }

    // CRITICAL: Final verification before redirecting
    // Wait a tiny bit to ensure localStorage write completes
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const finalWorkspace = mockAuth.getCurrentWorkspace()
    if (!finalWorkspace) {
      console.error('❌ [WORKSPACE SELECT] Workspace still not saved before redirect! Saving one more time...')
      mockAuth.setCurrentWorkspace(workspace)
      // Also check localStorage directly
      if (typeof window !== 'undefined') {
        const directCheck = localStorage.getItem('chat_app_current_workspace')
        console.log('🔍 [WORKSPACE SELECT] Direct localStorage check:', directCheck ? 'EXISTS' : 'NULL')
        if (!directCheck) {
          localStorage.setItem('chat_app_current_workspace', JSON.stringify(workspace))
          console.log('🔧 [WORKSPACE SELECT] Saved workspace directly to localStorage as fallback')
          // Wait again after manual save
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      }
    } else {
      console.log('✅ [WORKSPACE SELECT] Final verification passed, workspace exists:', finalWorkspace.id)
    }

    // CRITICAL: One more final check before redirect
    const lastCheck = mockAuth.getCurrentWorkspace()
    if (!lastCheck) {
      console.error('❌❌❌ [WORKSPACE SELECT] CRITICAL: Workspace still null after all attempts!')
      console.error('❌ [WORKSPACE SELECT] Workspace object:', workspace)
      console.error('❌ [WORKSPACE SELECT] localStorage.getItem result:', typeof window !== 'undefined' ? localStorage.getItem('chat_app_current_workspace') : 'N/A')
      // Don't redirect if workspace is not saved - user will see workspace selector again
      alert('Failed to save workspace. Please try selecting again.')
      return
    }

    // Use replace instead of push to avoid adding to history
    console.log('🚀 [WORKSPACE SELECT] Redirecting to /chat with workspace:', workspace.id)
    router.replace('/chat')
  }

  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      en: {
        forgotPassword: 'Forgot password?',
        noAccount: 'Don\'t have an account?',
        createAccount: 'Create one',
      },
      zh: {
        forgotPassword: '忘记密码？',
        noAccount: '没有账号？',
        createAccount: '立即注册',
      }
    }
    return translations[language]?.[key] || translations.en[key]
  }

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'zh' : 'en')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Button
        variant="outline"
        size="sm"
        onClick={toggleLanguage}
        className="fixed top-4 right-4 gap-2"
      >
        <Languages className="h-4 w-4" />
        {language === 'en' ? '中文' : 'English'}
      </Button>

      <div className="w-full max-w-md space-y-4">
        {step === 'login' && (
          <LoginForm 
            onSuccess={handleLoginSuccess}
            onForgotPassword={() => setStep('reset-password')}
            onRegister={() => setStep('register')}
          />
        )}
        {step === 'register' && (
          <RegisterForm 
            onSuccess={handleLoginSuccess}
            onBack={() => setStep('login')}
          />
        )}
        {step === 'reset-password' && (
          <ResetPasswordForm 
            onBack={() => setStep('login')}
          />
        )}
        {step === 'workspace' && (
          <WorkspaceSelector onSelect={handleWorkspaceSelect} />
        )}
      </div>
    </div>
  )
}










































































































