'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoginForm } from '@/components/auth/login-form'
import { RegisterForm } from '@/components/auth/register-form'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { WorkspaceSelector } from '@/components/workspace/workspace-selector'
import { mockAuth } from '@/lib/mock-auth'
import { Workspace } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/lib/settings-context'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<'login' | 'register' | 'reset-password' | 'workspace'>('login')
  const { language } = useSettings()

  useEffect(() => {
    // Check if already logged in
    const user = mockAuth.getCurrentUser()
    const workspace = mockAuth.getCurrentWorkspace()
    
    if (user && workspace) {
      router.push('/chat')
    } else if (user) {
      setStep('workspace')
    }
  }, [router])

  const handleLoginSuccess = () => {
    setStep('workspace')
  }

  const handleWorkspaceSelect = (workspace: Workspace) => {
    router.push('/chat')
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md space-y-4">
        {step === 'login' && (
          <>
            <LoginForm onSuccess={handleLoginSuccess} />
            <div className="flex flex-col gap-2 text-center text-sm">
              <Button
                variant="link"
                className="p-0 h-auto font-normal"
                onClick={() => setStep('reset-password')}
              >
                {t('forgotPassword')}
              </Button>
              <div>
                <span className="text-muted-foreground">{t('noAccount')} </span>
                <Button
                  variant="link"
                  className="p-0 h-auto font-normal"
                  onClick={() => setStep('register')}
                >
                  {t('createAccount')}
                </Button>
              </div>
            </div>
          </>
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
