'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Languages, Sun, Moon, Code, Sparkles, Sunset, Star } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { PrivacySettings } from '@/components/settings/privacy-settings'
import { BlockedUsersList } from '@/components/settings/blocked-users-list'

export default function PreferencesPage() {
  const { language, theme, setLanguage, setTheme, t } = useSettings()

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('preferences')}</h1>
        <p className="text-muted-foreground">{t('customizeAppLanguage')}</p>
      </div>

      {/* Privacy Settings Card - Slack Mode */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{language === 'zh' ? '隐私设置' : 'Privacy Settings'}</CardTitle>
          <CardDescription>
            {language === 'zh' ? '管理您的隐私偏好' : 'Manage your privacy preferences'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PrivacySettings />
        </CardContent>
      </Card>

      {/* Blocked Users Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{language === 'zh' ? '已屏蔽用户' : 'Blocked Users'}</CardTitle>
          <CardDescription>
            {language === 'zh'
              ? '管理您已屏蔽的用户，解除屏蔽后可恢复正常聊天'
              : 'Manage blocked users. Unblock to resume normal communication.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BlockedUsersList />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('languageAndTheme')}</CardTitle>
          <CardDescription>{t('customizeAppLanguage')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Language Settings */}
          <div>
            <Label className="mb-3 block">{t('language')}</Label>
            <div className="flex gap-2">
              <Button
                variant={language === 'en' ? 'default' : 'outline'}
                onClick={() => setLanguage('en')}
                className="flex-1"
              >
                <Languages className="mr-2 h-4 w-4" />
                English
                {language === 'en' && <span className="ml-auto">✓</span>}
              </Button>
              <Button
                variant={language === 'zh' ? 'default' : 'outline'}
                onClick={() => setLanguage('zh')}
                className="flex-1"
              >
                <Languages className="mr-2 h-4 w-4" />
                Chinese
                {language === 'zh' && <span className="ml-auto">✓</span>}
              </Button>
            </div>
          </div>

          {/* Theme Settings */}
          <div>
            <Label className="mb-3 block">{t('theme')}</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                onClick={() => setTheme('light')}
                className="flex-1"
              >
                <Sun className="mr-2 h-4 w-4" />
                {t('light')}
                {theme === 'light' && <span className="ml-auto">✓</span>}
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                onClick={() => setTheme('dark')}
                className="flex-1"
              >
                <Moon className="mr-2 h-4 w-4" />
                {t('dark')}
                {theme === 'dark' && <span className="ml-auto">✓</span>}
              </Button>
              <Button
                variant={theme === 'monokai' ? 'default' : 'outline'}
                onClick={() => setTheme('monokai')}
                className="flex-1"
              >
                <Code className="mr-2 h-4 w-4" />
                {t('monokai')}
                {theme === 'monokai' && <span className="ml-auto">✓</span>}
              </Button>
              <Button
                variant={theme === 'solarized-dark' ? 'default' : 'outline'}
                onClick={() => setTheme('solarized-dark')}
                className="flex-1"
              >
                <Sunset className="mr-2 h-4 w-4" />
                {t('solarized-dark')}
                {theme === 'solarized-dark' && <span className="ml-auto">✓</span>}
              </Button>
              <Button
                variant={theme === 'light-purple' ? 'default' : 'outline'}
                onClick={() => setTheme('light-purple')}
                className="flex-1"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {t('light-purple')}
                {theme === 'light-purple' && <span className="ml-auto">✓</span>}
              </Button>
              <Button
                variant={theme === 'light-yellow' ? 'default' : 'outline'}
                onClick={() => setTheme('light-yellow')}
                className="flex-1"
              >
                <Star className="mr-2 h-4 w-4" />
                {t('light-yellow')}
                {theme === 'light-yellow' && <span className="ml-auto">✓</span>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('notifications')}</CardTitle>
          <CardDescription>{t('manageNotificationPreferences')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            {t('notificationSettingsComingSoon')}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

