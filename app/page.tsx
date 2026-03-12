'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Sparkles,
  Shield,
  Zap,
  MessagesSquare,
  Search,
  Layers,
  Languages,
  Sun,
  Moon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { mockAuth } from '@/lib/mock-auth'
import { useSettings } from '@/lib/settings-context'

const copy = {
  en: {
    title: 'MornChat, a calm workspace for serious teams',
    subtitle: 'See the core workflows before you sign in.',
    description:
      'Explore how conversations, documents, and decisions stay connected across channels, devices, and projects.',
    primaryCta: 'Log in to start',
    navLogin: 'Log in',
    sectionTitle: 'Core capabilities',
    sectionSubtitle: 'Designed to keep teams aligned, fast, and secure.',
    highlightTitle: 'What makes MornChat different',
    highlightBody:
      'One workspace for chat, files, and workflows. Everything is searchable, permissioned, and ready for enterprise use.',
    previewLabel: 'Workspace Preview',
    previewLive: 'Live',
    cardProjectTitle: 'Project Alpha',
    cardProjectSubtitle: '3 new decisions ready',
    cardTodayLabel: 'Today',
    cardTodayTitle: 'Sync with design',
    cardTodayDesc: '4 action items',
    cardSearchLabel: 'Search',
    cardSearchTitle: 'Q2 roadmap',
    cardSearchDesc: '12 results',
    cardSummaryLabel: 'AI Summary',
    cardSummaryText: '“Prioritize onboarding flow, confirm timeline, and assign owners by Friday.”',
    feature1: {
      title: 'Unified conversations',
      desc: 'Channels, DMs, and threaded decisions stay in one place.',
    },
    feature2: {
      title: 'Instant knowledge search',
      desc: 'Find answers across chats, docs, and media in seconds.',
    },
    feature3: {
      title: 'AI-assisted summaries',
      desc: 'Turn long discussions into crisp action items automatically.',
    },
    feature4: {
      title: 'Enterprise-grade security',
      desc: 'Fine-grained permissions, audit trails, and policy controls.',
    },
    feature5: {
      title: 'Cross-device continuity',
      desc: 'Seamless experience across web, mobile, and desktop.',
    },
    feature6: {
      title: 'Structured collaboration',
      desc: 'Pin decisions, assign owners, and keep momentum visible.',
    },
    footer: 'MornChat Preview • Built for modern enterprise collaboration',
  },
  zh: {
    title: 'MornChat 企业协作工作台',
    subtitle: '先了解核心体验，再决定是否登录。',
    description:
      '聊天、文件、决策统一在一个空间，跨频道、跨设备协作更顺畅。',
    primaryCta: '立即登录',
    navLogin: '登录',
    sectionTitle: '核心能力',
    sectionSubtitle: '让团队更清晰、更高效、更安全。',
    highlightTitle: '为什么选择 MornChat',
    highlightBody:
      '把聊天、资料和流程聚合到一个工作台，搜索更快，权限更清晰，协作更稳定。',
    previewLabel: '工作台预览',
    previewLive: '实时',
    cardProjectTitle: '项目 Alpha',
    cardProjectSubtitle: '3 个新决策待确认',
    cardTodayLabel: '今日',
    cardTodayTitle: '与设计同步',
    cardTodayDesc: '4 个行动项',
    cardSearchLabel: '搜索',
    cardSearchTitle: 'Q2 路线图',
    cardSearchDesc: '12 条结果',
    cardSummaryLabel: 'AI 总结',
    cardSummaryText: '“优先完善入职流程，确认时间线，并在周五前指定负责人。”',
    feature1: {
      title: '统一会话空间',
      desc: '频道、私信与线程整合到一个入口。',
    },
    feature2: {
      title: '知识秒级检索',
      desc: '跨消息、文件和附件快速定位答案。',
    },
    feature3: {
      title: 'AI 自动总结',
      desc: '把长讨论整理成要点和行动计划。',
    },
    feature4: {
      title: '企业级安全',
      desc: '权限控制、审计记录与合规策略一体化。',
    },
    feature5: {
      title: '多端连续体验',
      desc: '网页、移动端与桌面端保持一致。',
    },
    feature6: {
      title: '结构化协作',
      desc: '固定决策、责任人和进度，一目了然。',
    },
    footer: 'MornChat 预览页 • 为企业沟通而生',
  },
}

export default function Home() {
  const router = useRouter()
  const { language, theme, setLanguage, setTheme } = useSettings()
  const t = copy[language] || copy.en
  const isZh = language === 'zh'

  useEffect(() => {
    const user = mockAuth.getCurrentUser()
    const workspace = mockAuth.getCurrentWorkspace()
    if (user && workspace) {
      router.replace('/chat')
    }
  }, [router])

  const handleLogin = () => {
    router.push('/login')
  }

  const toggleLanguage = () => {
    setLanguage(isZh ? 'en' : 'zh')
  }

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f6f2ea] text-[#1b1b1b] dark:bg-[#0f1115] dark:text-[#f8f7f4]">
      <div className="absolute inset-0">
        <div className="absolute -top-24 left-[-10%] h-72 w-72 rounded-full bg-[#ffd6b5] blur-3xl opacity-50 dark:bg-[#2a1f15]" />
        <div className="absolute top-32 right-[-5%] h-64 w-64 rounded-full bg-[#c7e6ff] blur-3xl opacity-50 dark:bg-[#142a3a]" />
        <div className="absolute bottom-[-10%] left-[20%] h-72 w-72 rounded-full bg-[#e2d8ff] blur-3xl opacity-40 dark:bg-[#2b213f]" />
      </div>

      <header className="relative z-10 border-b border-black/5 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-black/40">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-black text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <span>MornChat</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-2" onClick={toggleLanguage}>
              <Languages className="h-4 w-4" />
              {isZh ? 'English' : '中文'}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button size="sm" onClick={handleLogin}>
              {t.navLogin}
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-20 pt-12">
        <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <h1 className="text-3xl font-semibold leading-tight md:text-5xl">
              {t.title}
            </h1>
            <p className="text-base text-black/70 md:text-lg dark:text-white/70">{t.subtitle}</p>
            <p className="text-sm text-black/60 md:text-base dark:text-white/60">{t.description}</p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={handleLogin} className="px-6">
                {t.primaryCta}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="relative">
            <Card className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-xl dark:border-white/10 dark:bg-white/10">
              <div className="flex items-center justify-between text-xs text-black/60 dark:text-white/60">
                <span>{t.previewLabel}</span>
                <span>{t.previewLive}</span>
              </div>
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-black/5 bg-[#f8f7f4] p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/90 text-xs text-white">PM</span>
                    <div>
                      <p className="text-sm font-semibold">{t.cardProjectTitle}</p>
                      <p className="text-xs text-black/50 dark:text-white/50">{t.cardProjectSubtitle}</p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-white/5">
                    <p className="text-xs uppercase text-black/40 dark:text-white/40">{t.cardTodayLabel}</p>
                    <p className="mt-2 text-sm font-medium">{t.cardTodayTitle}</p>
                    <p className="text-xs text-black/50 dark:text-white/50">{t.cardTodayDesc}</p>
                  </div>
                  <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-white/5">
                    <p className="text-xs uppercase text-black/40 dark:text-white/40">{t.cardSearchLabel}</p>
                    <p className="mt-2 text-sm font-medium">{t.cardSearchTitle}</p>
                    <p className="text-xs text-black/50 dark:text-white/50">{t.cardSearchDesc}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-white/5">
                  <p className="text-xs uppercase text-black/40 dark:text-white/40">{t.cardSummaryLabel}</p>
                  <p className="mt-2 text-sm text-black/70 dark:text-white/70">{t.cardSummaryText}</p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section id="features" className="mt-16 space-y-8">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold md:text-3xl">{t.sectionTitle}</h2>
            <p className="text-sm text-black/60 md:text-base dark:text-white/60">{t.sectionSubtitle}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="rounded-2xl border border-black/10 bg-white/80 p-5 dark:border-white/10 dark:bg-white/10">
              <MessagesSquare className="h-6 w-6 text-[#0f766e]" />
              <h3 className="mt-3 text-base font-semibold">{t.feature1.title}</h3>
              <p className="mt-2 text-sm text-black/60 dark:text-white/60">{t.feature1.desc}</p>
            </Card>
            <Card className="rounded-2xl border border-black/10 bg-white/80 p-5 dark:border-white/10 dark:bg-white/10">
              <Search className="h-6 w-6 text-[#7c3aed]" />
              <h3 className="mt-3 text-base font-semibold">{t.feature2.title}</h3>
              <p className="mt-2 text-sm text-black/60 dark:text-white/60">{t.feature2.desc}</p>
            </Card>
            <Card className="rounded-2xl border border-black/10 bg-white/80 p-5 dark:border-white/10 dark:bg-white/10">
              <Sparkles className="h-6 w-6 text-[#f97316]" />
              <h3 className="mt-3 text-base font-semibold">{t.feature3.title}</h3>
              <p className="mt-2 text-sm text-black/60 dark:text-white/60">{t.feature3.desc}</p>
            </Card>
            <Card className="rounded-2xl border border-black/10 bg-white/80 p-5 dark:border-white/10 dark:bg-white/10">
              <Shield className="h-6 w-6 text-[#2563eb]" />
              <h3 className="mt-3 text-base font-semibold">{t.feature4.title}</h3>
              <p className="mt-2 text-sm text-black/60 dark:text-white/60">{t.feature4.desc}</p>
            </Card>
            <Card className="rounded-2xl border border-black/10 bg-white/80 p-5 dark:border-white/10 dark:bg-white/10">
              <Zap className="h-6 w-6 text-[#0f766e]" />
              <h3 className="mt-3 text-base font-semibold">{t.feature5.title}</h3>
              <p className="mt-2 text-sm text-black/60 dark:text-white/60">{t.feature5.desc}</p>
            </Card>
            <Card className="rounded-2xl border border-black/10 bg-white/80 p-5 dark:border-white/10 dark:bg-white/10">
              <Layers className="h-6 w-6 text-[#d97706]" />
              <h3 className="mt-3 text-base font-semibold">{t.feature6.title}</h3>
              <p className="mt-2 text-sm text-black/60 dark:text-white/60">{t.feature6.desc}</p>
            </Card>
          </div>
        </section>

        <section className="mt-16 rounded-3xl border border-black/10 bg-white/80 p-8 dark:border-white/10 dark:bg-white/10">
          <h3 className="text-xl font-semibold">{t.highlightTitle}</h3>
          <p className="mt-3 text-sm text-black/60 md:text-base dark:text-white/60">{t.highlightBody}</p>
        </section>
      </main>

      <footer className="relative z-10 border-t border-black/5 bg-white/70 py-6 text-center text-xs text-black/50 dark:border-white/10 dark:bg-black/40 dark:text-white/50">
        {t.footer}
      </footer>
    </div>
  )
}
