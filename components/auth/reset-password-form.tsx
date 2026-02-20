'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Mail, ArrowLeft, CheckCircle, Lock, AlertCircle } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'

interface ResetPasswordFormProps {
  onBack: () => void
}

type Step = 'email' | 'verify' | 'reset' | 'success'

export function ResetPasswordForm({ onBack }: ResetPasswordFormProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState('')
  const { language } = useSettings()

  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      en: {
        resetPassword: 'Reset Password',
        email: 'Email',
        emailPlaceholder: 'you@company.com',
        enterEmail: 'Enter your email address and we will send you a verification code',
        sendCode: 'Send Code',
        sending: 'Sending...',
        backToLogin: 'Back to login',
        emailSent: 'Code sent!',
        checkEmail: 'Please check your email for the verification code',
        invalidEmail: 'Please enter a valid email address',
        verificationCode: 'Verification Code',
        codePlaceholder: 'Enter 6-digit code',
        verifyCode: 'Verify Code',
        verifying: 'Verifying...',
        newPassword: 'New Password',
        passwordPlaceholder: 'Enter new password',
        confirmPassword: 'Confirm Password',
        confirmPasswordPlaceholder: 'Confirm new password',
        resetting: 'Resetting...',
        passwordSuccess: 'Password reset successfully!',
        passwordSuccessDesc: 'Your password has been reset. You can now login with your new password.',
        invalidCode: 'Invalid or expired verification code',
        passwordMismatch: 'Passwords do not match',
        passwordTooShort: 'Password must be at least 6 characters',
      },
      zh: {
        resetPassword: '重置密码',
        email: '邮箱',
        emailPlaceholder: 'you@company.com',
        enterEmail: '输入您的邮箱地址，我们将发送验证码',
        sendCode: '发送验证码',
        sending: '发送中...',
        backToLogin: '返回登录',
        emailSent: '验证码已发送！',
        checkEmail: '请查收邮箱中的验证码',
        invalidEmail: '请输入有效的邮箱地址',
        verificationCode: '验证码',
        codePlaceholder: '请输入6位验证码',
        verifyCode: '验证验证码',
        verifying: '验证中...',
        newPassword: '新密码',
        passwordPlaceholder: '请输入新密码',
        confirmPassword: '确认密码',
        confirmPasswordPlaceholder: '请再次输入新密码',
        resetting: '重置中...',
        passwordSuccess: '密码重置成功！',
        passwordSuccessDesc: '您的密码已重置，现在可以使用新密码登录。',
        invalidCode: '验证码无效或已过期',
        passwordMismatch: '两次输入的密码不一致',
        passwordTooShort: '密码长度至少为6位',
      }
    }
    return translations[language]?.[key] || translations.en[key]
  }

  const handleSendCode = async () => {
    if (!email) {
      setError(t('invalidEmail'))
      return
    }

    setError('')
    setIsSendingCode(true)

    try {
      const response = await fetch('/api/auth/send-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok) {
        setStep('verify')
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
      } else {
        setError(data.error || '发送验证码失败')
      }
    } catch (err) {
      setError('发送验证码失败，请稍后重试')
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!verificationCode || verificationCode.length !== 6) {
      setError(t('invalidCode'))
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/verify-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verificationCode }),
      })

      const data = await response.json()

      if (response.ok) {
        // 清除密码字段，防止浏览器自动填充
        setPassword('')
        setConfirmPassword('')
        // 存储token用于后续重置密码
        sessionStorage.setItem('reset_password_token', data.resetToken)
        setStep('reset')
      } else {
        setError(data.error || t('invalidCode'))
      }
    } catch (err) {
      setError('验证失败，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError(t('passwordTooShort'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('passwordMismatch'))
      return
    }

    setIsLoading(true)

    try {
      // 获取之前存储的token（这里简化处理，实际应该通过状态传递）
      // 由于verify-reset-code已经返回了token，我们需要在verify步骤保存它
      // 这里使用sessionStorage临时存储
      const resetToken = sessionStorage.getItem('reset_password_token')

      if (!resetToken) {
        setError('会话已过期，请重新开始')
        setStep('email')
        return
      }

      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          resetToken,
          password,
          confirmPassword,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        // 显示成功消息，让用户点击返回登录
        sessionStorage.removeItem('reset_password_token')
        setStep('success')
      } else {
        setError(data.error || '重置密码失败')
      }
    } catch (err) {
      setError('重置密码失败，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  // 成功步骤
  if (step === 'success') {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold flex items-center gap-2">
            <CheckCircle className="h-6 w-6 text-green-500" />
            {t('passwordSuccess')}
          </CardTitle>
          <CardDescription>
            {t('passwordSuccessDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full"
            onClick={onBack}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('backToLogin')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // 步骤1: 输入邮箱
  if (step === 'email') {
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
            <CardTitle className="text-2xl font-semibold">{t('resetPassword')}</CardTitle>
          </div>
          <CardDescription>
            {t('enterEmail')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t('email')}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                required
                disabled={isSendingCode}
              />
            </div>
          </div>
          <Button
            type="button"
            className="w-full"
            onClick={handleSendCode}
            disabled={isSendingCode || !email}
          >
            {isSendingCode ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('sending')}
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                {t('sendCode')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // 步骤2: 输入验证码
  if (step === 'verify') {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setStep('email')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-2xl font-semibold">{t('resetPassword')}</CardTitle>
          </div>
          <CardDescription>
            {t('checkEmail')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              disabled
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="verificationCode">{t('verificationCode')}</Label>
            <div className="flex gap-2">
              <Input
                id="verificationCode"
                type="text"
                placeholder={t('codePlaceholder')}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                maxLength={6}
                className="flex-1"
                required
                disabled={isLoading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSendCode}
                disabled={isSendingCode || countdown > 0}
                className="whitespace-nowrap"
              >
                {isSendingCode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : countdown > 0 ? (
                  `${countdown}秒`
                ) : (
                  t('sendCode')
                )}
              </Button>
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            onClick={handleVerifyCode}
            disabled={isLoading || verificationCode.length !== 6}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('verifying')}
              </>
            ) : (
              t('verifyCode')
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // 步骤3: 输入新密码
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => {
            setPassword('')
            setConfirmPassword('')
            setStep('verify')
          }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CardTitle className="text-2xl font-semibold">{t('resetPassword')}</CardTitle>
        </div>
        <CardDescription>
          {t('enterEmail')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleResetPassword} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              disabled
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('newPassword')}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
                required
                disabled={isLoading}
                minLength={6}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder={t('confirmPasswordPlaceholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-10"
                required
                disabled={isLoading}
                minLength={6}
                autoComplete="new-password"
              />
              {confirmPassword && password === confirmPassword && (
                <CheckCircle className="absolute right-3 top-3 h-4 w-4 text-green-500" />
              )}
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('resetting')}
              </>
            ) : (
              t('resetPassword')
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
