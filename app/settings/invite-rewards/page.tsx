'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Copy, Gift, Link2, MousePointerClick, TrendingUp, Users } from 'lucide-react'
import { AppNavigation } from '@/components/layout/app-navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSettings } from '@/lib/settings-context'

type InviteRewardsResponse = {
  referralCode: string
  shareUrl: string
  clickCount: number
  invitedCount: number
  conversionRate: number
  rewardCredits: number
  inviterSignupBonus: number
  invitedSignupBonus: number
  inviterFirstUseBonus: number
  invitedFirstUseBonus: number
}

export default function InviteRewardsPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { language } = useSettings()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [inviteRewards, setInviteRewards] = useState<InviteRewardsResponse | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const response = await fetch('/api/users/invite-rewards', { cache: 'no-store' })
        const json = await response.json().catch(() => ({}))
        if (!response.ok || json?.success === false) {
          throw new Error(json?.error || tr('邀请数据加载失败', 'Failed to load invite rewards'))
        }
        setInviteRewards(json.inviteRewards as InviteRewardsResponse)
      } catch (err: any) {
        setError(err?.message || tr('邀请数据加载失败', 'Failed to load invite rewards'))
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [language])

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      window.setTimeout(() => setCopied(''), 1800)
    } catch {
      setError(tr('复制失败，请手动复制', 'Copy failed, please copy manually'))
    }
  }

  return (
    <div className="flex h-screen min-w-0 flex-col mobile-app-shell mobile-overscroll-contain">
      <div className="flex-1 overflow-y-auto mobile-scroll-y mobile-overscroll-contain">
        <div className="container mx-auto max-w-4xl px-4 py-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4 h-9 px-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tr('返回', 'Back')}
          </Button>

          <div className="mb-8">
            <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{tr('邀请有奖', 'Invite Rewards')}</h1>
            <p className="text-muted-foreground">{tr('复制你的专属邀请信息，邀请成员注册和激活即可获得奖励。', 'Copy your referral info and invite people to register and activate for rewards.')}</p>
          </div>

          {copied ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {tr('已复制：', 'Copied: ')}{copied}
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : null}

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{tr('邀请信息', 'Invite Info')}</CardTitle>
                <CardDescription>{tr('首版只展示邀请入口、邀请码、邀请链接与基础数据。', 'V1 only exposes the invite entry, code, share link and basic stats.')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="text-sm text-muted-foreground">{tr('加载中...', 'Loading...')}</div>
                ) : inviteRewards ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border bg-muted/30 p-4">
                        <div className="mb-1 text-xs text-muted-foreground">{tr('邀请码', 'Invite Code')}</div>
                        <div className="break-all text-lg font-semibold">{inviteRewards.referralCode}</div>
                        <Button variant="outline" className="mt-3 w-full justify-between" onClick={() => void copyText(inviteRewards.referralCode, tr('邀请码', 'Invite Code'))}>
                          <span>{tr('复制邀请码', 'Copy Code')}</span>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="rounded-2xl border bg-muted/30 p-4">
                        <div className="mb-1 text-xs text-muted-foreground">{tr('邀请链接', 'Invite Link')}</div>
                        <div className="break-all text-sm leading-6">{inviteRewards.shareUrl}</div>
                        <Button variant="outline" className="mt-3 w-full justify-between" onClick={() => void copyText(inviteRewards.shareUrl, tr('邀请链接', 'Invite Link'))}>
                          <span>{tr('复制链接', 'Copy Link')}</span>
                          <Link2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border p-4">
                        <div className="mb-1 inline-flex items-center gap-2 text-xs text-muted-foreground"><MousePointerClick className="h-4 w-4" />{tr('点击数', 'Clicks')}</div>
                        <div className="text-2xl font-semibold">{inviteRewards.clickCount}</div>
                      </div>
                      <div className="rounded-2xl border p-4">
                        <div className="mb-1 inline-flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-4 w-4" />{tr('邀请数', 'Invites')}</div>
                        <div className="text-2xl font-semibold">{inviteRewards.invitedCount}</div>
                      </div>
                      <div className="rounded-2xl border p-4">
                        <div className="mb-1 inline-flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-4 w-4" />{tr('转化率', 'Conversion')}</div>
                        <div className="text-2xl font-semibold">{inviteRewards.conversionRate}%</div>
                      </div>
                      <div className="rounded-2xl border p-4">
                        <div className="mb-1 inline-flex items-center gap-2 text-xs text-muted-foreground"><Gift className="h-4 w-4" />{tr('累计奖励', 'Reward Credits')}</div>
                        <div className="text-2xl font-semibold">{inviteRewards.rewardCredits}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">{tr('暂无邀请数据', 'No invite data')}</div>
                )}
              </CardContent>
            </Card>

            {inviteRewards ? (
              <Card>
                <CardHeader>
                  <CardTitle>{tr('奖励说明', 'Reward Guide')}</CardTitle>
                  <CardDescription>{tr('当前展示的是邀请奖励规则说明，钱包、提现、积分抵扣等前台暂未开放。', 'This page currently shows invite reward rules only. Wallet, withdrawals and redemption are not open on the frontend yet.')}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border bg-muted/30 p-4">
                    <div className="font-medium">{tr('邀请人奖励', 'Inviter Rewards')}</div>
                    <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <li>{tr(`好友完成注册：+${inviteRewards.inviterSignupBonus}`, `Friend registers: +${inviteRewards.inviterSignupBonus}`)}</li>
                      <li>{tr(`好友完成首次激活：+${inviteRewards.inviterFirstUseBonus}`, `Friend activates first action: +${inviteRewards.inviterFirstUseBonus}`)}</li>
                    </ul>
                  </div>
                  <div className="rounded-2xl border bg-muted/30 p-4">
                    <div className="font-medium">{tr('被邀请人奖励', 'Invitee Rewards')}</div>
                    <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <li>{tr(`完成注册：+${inviteRewards.invitedSignupBonus}`, `Register: +${inviteRewards.invitedSignupBonus}`)}</li>
                      <li>{tr(`完成首次激活：+${inviteRewards.invitedFirstUseBonus}`, `First activation: +${inviteRewards.invitedFirstUseBonus}`)}</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
      {isMobile && <AppNavigation mobile />}
    </div>
  )
}
