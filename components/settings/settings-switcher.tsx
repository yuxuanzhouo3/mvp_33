'use client'

import { Button } from '@/components/ui/button'
import { Languages, Moon, Sun, Code, Sparkles, Sunset, Star } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSettings } from '@/lib/settings-context'
import { cn } from '@/lib/utils'

export function SettingsSwitcher() {
  const { language, theme, setLanguage, setTheme, t } = useSettings()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="relative">
          {theme === 'light' ? (
            <Sun className="h-5 w-5" />
          ) : theme === 'monokai' ? (
            <Code className="h-5 w-5" />
          ) : theme === 'solarized-dark' ? (
            <Sunset className="h-5 w-5" />
          ) : theme === 'light-purple' ? (
            <Sparkles className="h-5 w-5" />
          ) : theme === 'light-yellow' ? (
            <Star className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
          <span className="sr-only">Settings</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t('preferences')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t('language')}
        </DropdownMenuLabel>
        <DropdownMenuItem 
          onClick={() => setLanguage('en')}
          className={cn('gap-2', language === 'en' && 'bg-accent')}
        >
          <Languages className="h-4 w-4" />
          <span>English</span>
          {language === 'en' && (
            <span className="ml-auto text-primary">✓</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setLanguage('zh')}
          className={cn('gap-2', language === 'zh' && 'bg-accent')}
        >
          <Languages className="h-4 w-4" />
          <span>中文</span>
          {language === 'zh' && (
            <span className="ml-auto text-primary">✓</span>
          )}
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.location.href = '/settings'}>
          <span>订阅管理</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t('theme')}
        </DropdownMenuLabel>
        <DropdownMenuItem 
          onClick={() => setTheme('light')}
          className={cn('gap-2', theme === 'light' && 'bg-accent')}
        >
          <Sun className="h-4 w-4" />
          <span>{t('light')}</span>
          {theme === 'light' && (
            <span className="ml-auto text-primary">✓</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme('dark')}
          className={cn('gap-2', theme === 'dark' && 'bg-accent')}
        >
          <Moon className="h-4 w-4" />
          <span>{t('dark')}</span>
          {theme === 'dark' && (
            <span className="ml-auto text-primary">✓</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme('monokai')}
          className={cn('gap-2', theme === 'monokai' && 'bg-accent')}
        >
          <Code className="h-4 w-4" />
          <span>{t('monokai')}</span>
          {theme === 'monokai' && (
            <span className="ml-auto text-primary">✓</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme('solarized-dark')}
          className={cn('gap-2', theme === 'solarized-dark' && 'bg-accent')}
        >
          <Sunset className="h-4 w-4" />
          <span>{t('solarized-dark')}</span>
          {theme === 'solarized-dark' && (
            <span className="ml-auto text-primary">✓</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme('light-purple')}
          className={cn('gap-2', theme === 'light-purple' && 'bg-accent')}
        >
          <Sparkles className="h-4 w-4" />
          <span>{t('light-purple')}</span>
          {theme === 'light-purple' && (
            <span className="ml-auto text-primary">✓</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme('light-yellow')}
          className={cn('gap-2', theme === 'light-yellow' && 'bg-accent')}
        >
          <Star className="h-4 w-4" />
          <span>{t('light-yellow')}</span>
          {theme === 'light-yellow' && (
            <span className="ml-auto text-primary">✓</span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
