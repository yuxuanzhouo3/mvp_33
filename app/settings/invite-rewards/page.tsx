'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Copy, Gift, Link2, Share2, TrendingUp, Trophy, Users, Wallet } from 'lucide-react'
import { AppNavigation } from '@/components/layout/app-navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSettings } from '@/lib/settings-context'

type InviteRewardsResponse = {
  referralCode: string
  shareUrl: string
  clickCount: number
  invitedCount: number
  conversionRate: number
  cashBalance: number
  pointsBalance: number
  withdrawThreshold: number
  canWithdraw: boolean
  signupCashReward: number
  firstOrderCashReward: number
  sevenDayLoginPointsReward: number
  pointsDecayGraceDays: number
  pointsDecayDailyRate: number
  pointsDecayMaxRate: number
}

type RelationRow = {
  relationId: string
  invitedUserId: string
  invitedEmail: string | null
  createdAt: string
  currentLoginStreak: number
  firstOrderAt: string | null
  signupRewarded: boolean
  firstOrderRewarded: boolean
  sevenDayLoginRewarded: boolean
  status: 'registered' | 'first_order' | 'streak_rewarded'
}

type RewardRow = {
  rewardId: string
  rewardType: string
  rewardLabel: string
  rewardAsset: 'cash' | 'points'
  amount: number
  status: string
  createdAt: string
  grantedAt: string | null
}

const formatCash = (value: number) => `¥${Number(value || 0).toFixed(2)}`

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '-'
  return date.toLocaleDateString()
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
  const [relations, setRelations] = useState<RelationRow[]>([])
  const [rewards, setRewards] = useState<RewardRow[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const response = await fetch(`/api/users/invite-rewards?lang=${language === 'en' ? 'en' : 'zh'}`, {
          cache: 'no-store',
        })
        const json = await response.json().catch(() => ({ success: false }))
        if (!response.ok || json?.success === false) {
          throw new Error(json?.error || tr('邀请数据加载失败', 'Failed to load invite rewards'))
        }
        setInviteRewards(json.inviteRewards as InviteRewardsResponse)
        setRelations(json.relations?.rows || [])
        setRewards(json.rewards?.rows || [])
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

  const handleShare = async () => {
    if (!inviteRewards?.shareUrl) return

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: tr('邀请有奖', 'Invite Rewards'),
          text: tr(
            `使用我的邀请码 ${inviteRewards.referralCode} 注册吧`,
            `Register with my invite code ${inviteRewards.referralCode}`,
          ),
          url: inviteRewards.shareUrl,
        })
        return
      }

      await copyText(inviteRewards.shareUrl, tr('邀请链接', 'Invite link'))
    } catch {
      setError(tr('分享失败，请改用复制链接', 'Share failed, please copy the link instead'))
    }
  }

  const summaryCards = useMemo(() => {
    if (!inviteRewards) return []

    return [
      {
        key: 'cash',
        icon: Wallet,
        label: tr('现金余额', 'Cash Balance'),
        value: formatCash(inviteRewards.cashBalance),
        hint: inviteRewards.canWithdraw
          ? tr('已达到提现门槛', 'Withdrawal threshold reached')
          : tr(`满 ${formatCash(inviteRewards.withdrawThreshold)} 可提现`, `Withdraw at ${formatCash(inviteRewards.withdrawThreshold)}`),
      },
      {
        key: 'points',
        icon: Trophy,
        label: tr('积分余额', 'Points Balance'),
        value: String(inviteRewards.pointsBalance),
        hint: tr('7日连续登录奖励发放到邀请人', '7-day login streak rewards go to the inviter'),
      },
      {
        key: 'invited',
        icon: Users,
        label: tr('成功邀请', 'Invited Users'),
        value: String(inviteRewards.invitedCount),
        hint: tr('按完成注册计数', 'Counted on successful registration'),
      },
      {
        key: 'conversion',
        icon: TrendingUp,
        label: tr('转化率', 'Conversion'),
        value: `${inviteRewards.conversionRate}%`,
        hint: tr(`点击 ${inviteRewards.clickCount} 次`, `${inviteRewards.clickCount} clicks`),
      },
    ]
  }, [inviteRewards, language])

  return (
    <div className="flex h-screen min-w-0 flex-col mobile-app-shell mobile-overscroll-contain">
      <div className="flex-1 overflow-y-auto mobile-scroll-y mobile-overscroll-contain">
        <div className="container mx-auto max-w-5xl px-4 py-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4 h-9 px-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tr('返回', 'Back')}
          </Button>

          <div className="mb-8">
            <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{tr('邀请有奖', 'Invite Rewards')}</h1>
            <p className="text-muted-foreground">
              {tr(
                '邀请码为 8 位字母数字，可复制或直接分享到社交平台；奖励和积分衰减参数支持后台配置。',
                'Each user gets an 8-character invite code that can be copied or shared directly. Reward and decay rules are configurable.',
              )}
            </p>
          </div>

          {copied ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {tr('已复制：', 'Copied: ')}
              {copied}
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : null}

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{tr('邀请码', 'Invite Code')}</CardTitle>
                <CardDescription>
                  {tr('复制邀请码或邀请链接，分享给朋友注册。', 'Copy the invite code or link and share it with friends.')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="text-sm text-muted-foreground">{tr('加载中...', 'Loading...')}</div>
                ) : inviteRewards ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border bg-muted/30 p-4">
                        <div className="mb-1 text-xs text-muted-foreground">{tr('邀请码', 'Invite Code')}</div>
                        <div className="break-all text-lg font-semibold tracking-[0.2em]">{inviteRewards.referralCode}</div>
                        <Button
                          variant="outline"
                          className="mt-3 w-full justify-between"
                          onClick={() => void copyText(inviteRewards.referralCode, tr('邀请码', 'Invite code'))}
                        >
                          <span>{tr('复制邀请码', 'Copy code')}</span>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="rounded-2xl border bg-muted/30 p-4">
                        <div className="mb-1 text-xs text-muted-foreground">{tr('邀请链接', 'Invite Link')}</div>
                        <div className="break-all text-sm leading-6">{inviteRewards.shareUrl}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            className="flex-1 justify-between"
                            onClick={() => void copyText(inviteRewards.shareUrl, tr('邀请链接', 'Invite link'))}
                          >
                            <span>{tr('复制链接', 'Copy link')}</span>
                            <Link2 className="h-4 w-4" />
                          </Button>
                          <Button className="flex-1 justify-between" onClick={() => void handleShare()}>
                            <span>{tr('分享', 'Share')}</span>
                            <Share2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {summaryCards.map((card) => {
                        const Icon = card.icon
                        return (
                          <div key={card.key} className="rounded-2xl border p-4">
                            <div className="mb-1 inline-flex items-center gap-2 text-xs text-muted-foreground">
                              <Icon className="h-4 w-4" />
                              {card.label}
                            </div>
                            <div className="text-2xl font-semibold">{card.value}</div>
                            <div className="mt-2 text-xs text-muted-foreground">{card.hint}</div>
                          </div>
                        )
                      })}
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
                  <CardTitle>{tr('奖励规则', 'Reward Rules')}</CardTitle>
                  <CardDescription>
                    {tr('当前规则来自后台营销设置，修改后这里会自动同步。', 'These rules are driven by marketing settings and update automatically.')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border bg-muted/30 p-4">
                    <div className="font-medium">{tr('奖励触发', 'Reward Triggers')}</div>
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <p>{tr(`被邀请人注册：邀请人 +${formatCash(inviteRewards.signupCashReward)}`, `Invitee registers: inviter +${formatCash(inviteRewards.signupCashReward)}`)}</p>
                      <p>{tr(`被邀请人首单：邀请人 +${formatCash(inviteRewards.firstOrderCashReward)}`, `Invitee first order: inviter +${formatCash(inviteRewards.firstOrderCashReward)}`)}</p>
                      <p>{tr(`被邀请人连续登录 7 天：邀请人 +${inviteRewards.sevenDayLoginPointsReward} 积分`, `Invitee logs in for 7 consecutive days: inviter +${inviteRewards.sevenDayLoginPointsReward} points`)}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-muted/30 p-4">
                    <div className="font-medium">{tr('提现与衰减', 'Withdrawal And Decay')}</div>
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <p>{tr(`现金满 ${formatCash(inviteRewards.withdrawThreshold)} 可提现`, `Cash can be withdrawn at ${formatCash(inviteRewards.withdrawThreshold)}`)}</p>
                      <p>{tr(`连续 ${inviteRewards.pointsDecayGraceDays} 天未登录后开始衰减`, `Decay starts after ${inviteRewards.pointsDecayGraceDays} inactive days`)}</p>
                      <p>{tr(`每日扣减 ${inviteRewards.pointsDecayDailyRate}% 积分，累计不超过 ${inviteRewards.pointsDecayMaxRate}%`, `Deduct ${inviteRewards.pointsDecayDailyRate}% points per day, capped at ${inviteRewards.pointsDecayMaxRate}%`)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card className="rounded-[2rem] border-muted/50 shadow-sm">
              <CardHeader>
                <CardTitle>{tr('邀请进度', 'Invite Progress')}</CardTitle>
                <CardDescription>
                  {tr('查看每个被邀请人的注册、首单和 7 日登录进展。', 'Track each invitee through registration, first order, and 7-day login progress.')}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs defaultValue="invitees" className="w-full">
                  <div className="border-b px-6">
                    <TabsList className="h-12 w-full justify-start gap-6 bg-transparent p-0">
                      <TabsTrigger value="invitees" className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 font-medium text-muted-foreground transition-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">
                        {tr('邀请明细', 'Invitees')}
                      </TabsTrigger>
                      <TabsTrigger value="rewards" className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 font-medium text-muted-foreground transition-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">
                        {tr('奖励记录', 'Rewards')}
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="invitees" className="m-0">
                    {relations.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-muted/30 text-muted-foreground">
                            <tr>
                              <th className="px-6 py-3 font-medium">{tr('被邀请人', 'Invitee')}</th>
                              <th className="px-6 py-3 font-medium">{tr('注册奖励', 'Signup')}</th>
                              <th className="px-6 py-3 font-medium">{tr('首单', 'First Order')}</th>
                              <th className="px-6 py-3 font-medium">{tr('登录连击', 'Login Streak')}</th>
                              <th className="px-6 py-3 font-medium">{tr('当前状态', 'Status')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {relations.map((relation) => (
                              <tr key={relation.relationId} className="hover:bg-muted/20">
                                <td className="px-6 py-4">
                                  <div className="font-medium">{relation.invitedEmail || relation.invitedUserId}</div>
                                  <div className="text-xs text-muted-foreground">{formatDate(relation.createdAt)}</div>
                                </td>
                                <td className="px-6 py-4">{relation.signupRewarded ? tr('已发放', 'Granted') : tr('待确认', 'Pending')}</td>
                                <td className="px-6 py-4">
                                  {relation.firstOrderRewarded || relation.firstOrderAt
                                    ? `${tr('已完成', 'Completed')} · ${formatDate(relation.firstOrderAt)}`
                                    : tr('未完成', 'Not yet')}
                                </td>
                                <td className="px-6 py-4">
                                  <div>{tr(`连续 ${relation.currentLoginStreak} 天`, `${relation.currentLoginStreak} days`)}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {relation.sevenDayLoginRewarded
                                      ? tr('7日奖励已发放', '7-day reward granted')
                                      : tr('达到 7 天后发放', 'Granted at 7 days')}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                                    {relation.status === 'streak_rewarded'
                                      ? tr('已发积分', 'Points granted')
                                      : relation.status === 'first_order'
                                        ? tr('已首单', 'First order done')
                                        : tr('已注册', 'Registered')}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Users className="mb-3 h-12 w-12 opacity-20" />
                        <p>{tr('暂无邀请记录', 'No invite history yet')}</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="rewards" className="m-0">
                    {rewards.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-muted/30 text-muted-foreground">
                            <tr>
                              <th className="px-6 py-3 font-medium">{tr('奖励类型', 'Reward Type')}</th>
                              <th className="px-6 py-3 font-medium">{tr('资产', 'Asset')}</th>
                              <th className="px-6 py-3 font-medium">{tr('数量', 'Amount')}</th>
                              <th className="px-6 py-3 font-medium">{tr('状态', 'Status')}</th>
                              <th className="px-6 py-3 font-medium">{tr('日期', 'Date')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {rewards.map((reward) => (
                              <tr key={reward.rewardId} className="hover:bg-muted/20">
                                <td className="px-6 py-4 font-medium">{reward.rewardLabel}</td>
                                <td className="px-6 py-4">{reward.rewardAsset === 'cash' ? tr('现金', 'Cash') : tr('积分', 'Points')}</td>
                                <td className="px-6 py-4">
                                  {reward.rewardAsset === 'cash' ? formatCash(reward.amount) : `+${reward.amount}`}
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${reward.status === 'granted' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    {reward.status === 'granted' ? tr('已发放', 'Granted') : tr('处理中', 'Pending')}
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">{formatDate(reward.grantedAt || reward.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Gift className="mb-3 h-12 w-12 opacity-20" />
                        <p>{tr('暂无奖励记录', 'No reward history yet')}</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      {isMobile && <AppNavigation mobile />}
    </div>
  )
}
