'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { mockAuth } from '@/lib/mock-auth'
import { Loader2, Mail, ArrowLeft } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'

interface RegisterFormProps {
  onSuccess: () => void
  onBack: () => void
}

function WeChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-5.523 3.397-6.95 1.128-.504 2.35-.761 3.566-.761.18 0 .36.012.537.024-.275-3.47-3.763-6.945-8.31-6.945zm5.785 8.069a.695.695 0 1 1 0-1.39.695.695 0 0 1 0 1.39zm-8.757 0a.695.695 0 1 1 .001-1.39.695.695 0 0 1-.001 1.39zM23.995 15.329c0-3.461-3.457-6.271-7.724-6.271-4.267 0-7.724 2.81-7.724 6.271 0 3.461 3.457 6.271 7.724 6.271a9.493 9.493 0 0 0 2.74-.403.864.864 0 0 1 .716.098l1.903 1.114a.326.326 0 0 0 .167.054c.16 0 .29-.132.29-.295 0-.072-.029-.143-.048-.213l-.39-1.48a.59.59 0 0 1 .213-.665c1.832-1.347 3.002-3.338 3.002-5.55zm-5.678-1.39a.695.695 0 1 1 0 1.39.695.695 0 0 1 0-1.39zm-4.046 1.39a.695.695 0 1 1 0-1.39.695.695 0 0 1 0 1.39z"/>
    </svg>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

export function RegisterForm({ onSuccess, onBack }: RegisterFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const { language } = useSettings()

  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      en: {
        register: 'Create Account',
        registerWith: 'Sign up with',
        wechat: 'WeChat',
        google: 'Google',
        name: 'Full Name',
        email: 'Email',
        password: 'Password',
        confirmPassword: 'Confirm Password',
        namePlaceholder: 'John Doe',
        emailPlaceholder: 'you@company.com',
        enterDetails: 'Create your account to get started',
        registering: 'Creating account...',
        passwordMismatch: 'Passwords do not match',
        registrationFailed: 'Registration failed',
        or: 'Or continue with',
        backToLogin: 'Back to login',
        alreadyHaveAccount: 'Already have an account?',
      },
      zh: {
        register: '注册账号',
        registerWith: '使用 {method} 注册',
        wechat: '微信',
        google: '谷歌',
        name: '姓名',
        email: '邮箱',
        password: '密码',
        confirmPassword: '确认密码',
        namePlaceholder: '张三',
        emailPlaceholder: 'you@company.com',
        enterDetails: '创建您的账号以开始使用',
        registering: '注册中...',
        passwordMismatch: '密码不匹配',
        registrationFailed: '注册失败',
        or: '或继续使用',
        backToLogin: '返回登录',
        alreadyHaveAccount: '已有账号？',
      }
    }
    return translations[language]?.[key] || translations.en[key]
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError(t('passwordMismatch'))
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || t('registrationFailed'))
      }

      if (data.success && data.user) {
        // Store user and token
        if (typeof window !== 'undefined') {
          localStorage.setItem('chat_app_current_user', JSON.stringify(data.user))
          if (data.token) {
            localStorage.setItem('chat_app_token', data.token)
          }
        }
        
        // If email confirmation is required, show message
        if (data.requiresEmailConfirmation) {
          alert('Please check your email to confirm your account before using the app.')
        }
        
        // Refresh the page to ensure Supabase session cookies are synced
        // This ensures the session is properly established for API calls
        if (!data.requiresEmailConfirmation) {
          // Small delay to ensure cookies are set
          setTimeout(() => {
            window.location.reload()
          }, 100)
        } else {
          onSuccess()
        }
      } else {
        throw new Error(t('registrationFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('registrationFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  // OAuth register handler - redirects to OAuth provider
  const handleOAuthRegister = async (provider: 'wechat' | 'google') => {
    setIsLoading(true)
    setError('')
    try {
      // Redirect to OAuth provider with register action
      window.location.href = `/api/auth/oauth/${provider}?action=register`
    } catch (err) {
      setError(`${provider} registration failed`)
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CardTitle className="text-2xl font-semibold">{t('register')}</CardTitle>
        </div>
        <CardDescription>
          {t('enterDetails')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOAuthRegister('wechat')}
            disabled={isLoading}
          >
            <WeChatIcon className="mr-2 h-5 w-5" />
            {t('wechat')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOAuthRegister('google')}
            disabled={isLoading}
          >
            <GoogleIcon className="mr-2 h-5 w-5" />
            {t('google')}
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              {t('or')}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('name')}</Label>
            <Input
              id="name"
              type="text"
              placeholder={t('namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('password')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              minLength={6}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isLoading}
              minLength={6}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('registering')}
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                {t('register')}
              </>
            )}
          </Button>
          <div className="text-center text-sm">
            <span className="text-muted-foreground">{t('alreadyHaveAccount')} </span>
            <Button
              type="button"
              variant="link"
              className="p-0 h-auto font-normal"
              onClick={onBack}
            >
              {t('backToLogin')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
