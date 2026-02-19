'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Mail, ArrowLeft } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { IS_DOMESTIC_VERSION } from '@/config'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

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
  const [verificationCode, setVerificationCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState('')
  const [showEmailConfirmDialog, setShowEmailConfirmDialog] = useState(false)
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
        checkEmailTitle: 'Check your email',
        checkEmailDescription: 'We have sent a confirmation link to your inbox. Please confirm your email, then go to the login page and sign in with your email and password.',
        verificationCode: 'Verification Code',
        verificationCodePlaceholder: 'Enter 6-digit code',
        getCode: 'Get Code',
        sendingCode: 'Sending...',
        codeSent: 'Code sent!',
        codeFailed: 'Failed to send code',
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
        registrationFailed: 'Registration failed',
        or: '或继续使用',
        backToLogin: '返回登录',
        alreadyHaveAccount: '已有账号？',
        checkEmailTitle: '请检查邮箱',
        checkEmailDescription: '我们已经向您的邮箱发送了一封确认邮件。请先点击邮件中的链接完成验证，然后到登录页用邮箱和密码登录。',
        verificationCode: '验证码',
        verificationCodePlaceholder: '输入6位验证码',
        getCode: '获取验证码',
        sendingCode: '发送中...',
        codeSent: '验证码已发送！',
        codeFailed: '发送失败',
      }
    }
    return translations[language]?.[key] || translations.en[key]
  }

  const handleSendCode = async () => {
    if (!email) {
      setError(t('emailPlaceholder'))
      return
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError(language === 'zh' ? '请输入有效的邮箱地址' : 'Please enter a valid email address')
      return
    }

    setIsSendingCode(true)
    setError('')

    try {
      const response = await fetch('/api/auth/send-register-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || t('codeFailed'))
      }

      // Start countdown
      setCountdown(60)
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err) {
      console.error('Send code error:', err)
      const errorMessage = err instanceof Error ? err.message : t('codeFailed')
      setError(errorMessage)
    } finally {
      setIsSendingCode(false)
    }
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
      // 注册：走注册流程，发送确认邮件
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          name,
          verificationCode,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Show specific error message from server
        const errorMsg = data?.error || 'Registration failed'
        console.error('[REGISTER FORM] Registration failed:', {
          status: response.status,
          serverError: data?.error,
          details: data?.details,
          code: data?.code,
        })

        // Map server error messages to user-friendly messages
        let userErrorMsg = errorMsg

        // 国内版错误消息映射
        if (IS_DOMESTIC_VERSION) {
          if (errorMsg.includes('验证码')) {
            userErrorMsg = errorMsg // 直接显示服务器返回的验证码错误信息
          } else if (errorMsg.toLowerCase().includes('already registered') || errorMsg.toLowerCase().includes('already exists') || errorMsg.includes('已注册')) {
            userErrorMsg = language === 'zh' ? '该邮箱已被注册' : 'Email already registered'
          } else if (errorMsg.includes('密码')) {
            userErrorMsg = errorMsg
          }
        } else {
          // 国际版
          if (errorMsg.toLowerCase().includes('already registered') || errorMsg.toLowerCase().includes('already exists')) {
            userErrorMsg = 'Email already registered'
          }
        }

        throw new Error(userErrorMsg)
      }

      if (data.success && data.user) {
        // 国内版：验证码注册成功后直接跳转登录页
        // 国际版：显示邮箱确认提示
        if (IS_DOMESTIC_VERSION) {
          // 直接回到登录页，让用户用账号密码登录
          onBack()
        } else {
          setShowEmailConfirmDialog(true)
        }
      } else {
        throw new Error('Registration failed')
      }
    } catch (err) {
      console.error('Registration error:', err)
      // Show the actual error message in English (e.g., "Email already registered")
      const errorMessage = err instanceof Error ? err.message : 'Registration failed'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  // OAuth handler - same as login page (OAuth automatically creates account if not exists)
  const handleOAuth = async (provider: 'wechat' | 'google') => {
    setIsLoading(true)
    setError('')
    try {
      // Use same logic as login page - OAuth handles both login and registration
      window.location.href = `/api/auth/oauth/${provider}?action=login`
      // Note: setIsLoading(false) won't execute due to redirect, which is fine
    } catch (err) {
      setError(`${provider === 'wechat' ? t('wechat') : t('google')} ${t('register')} failed`)
      setIsLoading(false)
    }
  }

  return (
    <>
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
          {/* OAuth Buttons - Dynamic based on region */}
          <div className="grid grid-cols-1 gap-3">
            {IS_DOMESTIC_VERSION ? (
              // 国内版：显示微信登录
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOAuth('wechat')}
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
                onClick={() => handleOAuth('google')}
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
            {/* 国内版：显示验证码输入框 */}
            {IS_DOMESTIC_VERSION && (
              <div className="space-y-2">
                <Label htmlFor="verificationCode">{t('verificationCode')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="verificationCode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder={t('verificationCodePlaceholder')}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    required
                    disabled={isLoading}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSendCode}
                    disabled={isSendingCode || countdown > 0}
                    className="whitespace-nowrap"
                  >
                    {isSendingCode ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('sendingCode')}
                      </>
                    ) : countdown > 0 ? (
                      `${countdown}s`
                    ) : (
                      t('getCode')
                    )}
                  </Button>
                </div>
              </div>
            )}
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

      {/* 居中的“请检查邮箱”弹窗 */}
      <Dialog open={showEmailConfirmDialog} onOpenChange={setShowEmailConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('checkEmailTitle')}</DialogTitle>
            <DialogDescription>
              {t('checkEmailDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowEmailConfirmDialog(false)
                // 回到登录页，让用户在邮箱确认后，用账号密码登录
                onBack()
              }}
            >
              {t('backToLogin')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
