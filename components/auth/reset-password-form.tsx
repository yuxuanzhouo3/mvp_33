'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'

interface ResetPasswordFormProps {
  onBack: () => void
}

export function ResetPasswordForm({ onBack }: ResetPasswordFormProps) {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const { language } = useSettings()

  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      en: {
        resetPassword: 'Reset Password',
        email: 'Email',
        emailPlaceholder: 'you@company.com',
        enterEmail: 'Enter your email address and we will send you a link to reset your password',
        sendLink: 'Send Reset Link',
        sending: 'Sending...',
        backToLogin: 'Back to login',
        emailSent: 'Reset link sent!',
        checkEmail: 'Check your email for a link to reset your password. If it doesn\'t appear within a few minutes, check your spam folder.',
        invalidEmail: 'Please enter a valid email address',
      },
      zh: {
        resetPassword: '重置密码',
        email: '邮箱',
        emailPlaceholder: 'you@company.com',
        enterEmail: '输入您的邮箱地址，我们将发送重置密码链接',
        sendLink: '发送重置链接',
        sending: '发送中...',
        backToLogin: '返回登录',
        emailSent: '重置链接已发送！',
        checkEmail: '请检查您的邮箱以获取重置密码的链接。如果几分钟内未收到，请检查垃圾邮件文件夹。',
        invalidEmail: '请输入有效的邮箱地址',
      }
    }
    return translations[language]?.[key] || translations.en[key]
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      // Simulate sending reset email
      await new Promise(resolve => setTimeout(resolve, 1500))
      setSuccess(true)
    } catch (err) {
      setError(t('invalidEmail'))
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold flex items-center gap-2">
            <CheckCircle className="h-6 w-6 text-green-500" />
            {t('emailSent')}
          </CardTitle>
          <CardDescription>
            {t('checkEmail')}
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
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('sending')}
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                {t('sendLink')}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
