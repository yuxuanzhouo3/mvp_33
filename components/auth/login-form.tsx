'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { mockAuth } from '@/lib/mock-auth'
import { Loader2, Mail, CheckCircle } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { IS_DOMESTIC_VERSION } from '@/config'

interface LoginFormProps {
  onSuccess: () => void
  onForgotPassword?: () => void
  onRegister?: () => void
  successMessage?: string
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

export function LoginForm({ onSuccess, onForgotPassword, onRegister, successMessage }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const { language } = useSettings()

  // 显示重置成功的提示
  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      en: {
        signIn: 'Sign In',
        signInWith: 'Sign in with',
        wechat: 'WeChat',
        google: 'Google',
        email: 'Email',
        password: 'Password',
        emailPlaceholder: 'you@company.com',
        enterCredentials: 'Enter your credentials to access your workspace',
        quickDemo: 'Quick Demo Login',
        signingIn: 'Signing in...',
        invalidCredentials: 'Invalid email or password',
        unexpectedResponse: 'Server returned an unexpected response. Please try again.',
        forgotPassword: 'Forgot password?',
        noAccount: 'Don\'t have an account?',
        createAccount: 'Create one',
        or: 'Or continue with',
      },
      zh: {
        signIn: '登录',
        signInWith: '使用 {method} 登录',
        wechat: '微信',
        google: '谷歌',
        email: '邮箱',
        password: '密码',
        emailPlaceholder: 'you@company.com',
        enterCredentials: '输入您的凭据以访问工作区',
        quickDemo: '快速演示登录',
        signingIn: '登录中...',
        invalidCredentials: 'Invalid email or password',
        unexpectedResponse: '服务器返回了意外响应，请稍后再试。',
        forgotPassword: '忘记密码？',
        noAccount: '没有账号？',
        createAccount: '立即注册',
        or: '或继续使用',
      }
    }
    return translations[language]?.[key] || translations.en[key]
  }

  const parseLoginResponse = async (response: Response): Promise<{ data: any; rawBody: string }> => {
    const rawBody = await response.text()
    if (!rawBody.trim()) {
      return { data: null as any, rawBody }
    }
    try {
      return { data: JSON.parse(rawBody), rawBody }
    } catch (error) {
      const parseError = new Error('PARSE_ERROR')
      ;(parseError as any).bodyPreview = rawBody.slice(0, 200)
      ;(parseError as any).status = response.status
      ;(parseError as any).statusText = response.statusText
      throw parseError
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email, 
          password,
        }),
      })

      console.log('[LOGIN FORM] Response status:', response.status)
      let parsedBody
      try {
        parsedBody = await parseLoginResponse(response)
      } catch (parseError) {
        console.error('[LOGIN FORM] Failed to parse login response JSON:', {
          status: (parseError as any).status ?? response.status,
          statusText: (parseError as any).statusText ?? response.statusText,
          preview: (parseError as any).bodyPreview ?? '',
        })
        throw new Error(t('unexpectedResponse'))
      }
      const data = parsedBody.data || {}
      const rawBodyPreview = parsedBody.rawBody?.slice(0, 200) || ''
      console.log('[LOGIN FORM] Response data:', { success: data?.success, userStatus: data?.user?.status })

      const normalizeServerError = (message?: string) => {
        if (!message) return null
        const lower = message.toLowerCase()
        if (lower.includes('unexpected token') || lower.includes('unexpected end of json') || lower.includes('not valid json')) {
          return null
        }
        return message
      }

      if (!response.ok) {
        // Always show simple error message in English, don't expose server details
        console.error('[LOGIN FORM] Login failed:', {
          status: response.status,
          bodyPreview: rawBodyPreview,
          serverError: data?.error,
          errorCode: data?.code,
          fullResponse: data,
        })
        
        // Check for specific error codes
        if (data?.code === 'EMAIL_NOT_CONFIRMED') {
          throw new Error('Please check your email and confirm your account before logging in')
        }
        
        throw new Error(data?.error || 'Invalid email or password')
      }

      if (data?.success && data?.user) {
        console.log('[LOGIN FORM] Login successful, user status:', data.user.status)
        // Store user and token
        if (typeof window !== 'undefined') {
          localStorage.setItem('chat_app_current_user', JSON.stringify(data.user))
          localStorage.setItem('chat_app_token', data.token)
        }
        // Call onSuccess immediately - no need to reload page
        onSuccess()
      } else {
        // Always show simple error message in English
        throw new Error('Invalid email or password')
      }
    } catch (err) {
      console.error('[LOGIN FORM] Login error:', err)
      // Always show simple error message in English, don't expose details
      setError(err instanceof Error ? err.message : 'Invalid email or password')
    } finally {
      setIsLoading(false)
    }
  }

  // Quick login for demo
  const handleQuickLogin = async () => {
    setEmail('alice@company.com')
    setPassword('password')
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'alice@company.com',
          password: 'password',
        }),
      })

      console.log('[QUICK LOGIN] Response status:', response.status)
      let parsedBody
      try {
        parsedBody = await parseLoginResponse(response)
      } catch (parseError) {
        console.error('[QUICK LOGIN] Failed to parse response:', parseError)
        throw new Error(t('unexpectedResponse'))
      }
      const data = parsedBody.data || {}

      if (!response.ok) {
        console.error('[QUICK LOGIN] Login failed:', data?.error)
        throw new Error(data?.error || 'Invalid email or password')
      }

      if (data?.success && data?.user) {
        console.log('[QUICK LOGIN] Login successful')
        // Store user and token
        if (typeof window !== 'undefined') {
          localStorage.setItem('chat_app_current_user', JSON.stringify(data.user))
          localStorage.setItem('chat_app_token', data.token)
        }
        onSuccess()
      } else {
        throw new Error('Invalid email or password')
      }
    } catch (err) {
      console.error('[QUICK LOGIN] Error:', err)
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  // OAuth login handler - redirects to OAuth provider
  const handleOAuthLogin = async (provider: 'wechat' | 'google') => {
    setIsLoading(true)
    setError('')
    try {
      // For better UX, we can open in same window (faster) or new window
      // Using same window redirect for faster response
      window.location.href = `/api/auth/oauth/${provider}?action=login`
      // Note: setIsLoading(false) won't execute due to redirect, which is fine
    } catch (err) {
      setError(`${provider === 'wechat' ? t('wechat') : t('google')} ${t('signIn')} failed`)
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-semibold">{t('signIn')}</CardTitle>
        <CardDescription>
          {t('enterCredentials')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Success message from password reset */}
        {successMessage && (
          <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-600">{successMessage}</AlertDescription>
          </Alert>
        )}

        {/* OAuth Login Buttons - Dynamic based on region */}
        <div className="grid grid-cols-1 gap-3">
          {IS_DOMESTIC_VERSION ? (
            // 国内版：显示微信登录
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuthLogin('wechat')}
              disabled={isLoading}
              className="w-full"
            >
              <WeChatIcon className="mr-2 h-5 w-5" />
              {t('wechat')}
            </Button>
          ) : (
            // 国际版：显示 Google 登录
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuthLogin('google')}
              disabled={isLoading}
              className="w-full"
            >
              <GoogleIcon className="mr-2 h-5 w-5" />
              {t('google')}
            </Button>
          )}
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/40" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              {t('or')}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('signingIn')}
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                {t('signIn')}
              </>
            )}
          </Button>
          <Button 
            type="button" 
            variant="outline" 
            className="w-full" 
            onClick={handleQuickLogin}
            disabled={isLoading}
          >
            {t('quickDemo')}
          </Button>
          
          <div className="pt-2 space-y-3">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/40" />
              </div>
            </div>
            
            <div className="flex flex-col gap-3 text-center">
              <Button 
                type="button" 
                variant="ghost" 
                className="h-auto py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={onForgotPassword || (() => alert(t('forgotPassword')))}
              >
                {t('forgotPassword')}
              </Button>
              <div className="text-sm">
                <span className="text-muted-foreground">{t('noAccount')} </span>
                <Button 
                  type="button" 
                  variant="link" 
                  className="h-auto p-0 text-sm font-medium underline-offset-4 hover:underline"
                  onClick={onRegister || (() => alert(t('createAccount')))}
                >
                  {t('createAccount')}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
