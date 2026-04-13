"use client"

import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Copy,
  Database,
  DollarSign,
  Link2,
  LogOut,
  QrCode,
  RefreshCw,
  Search,
  Share2,
  Shield,
  Target,
  TicketPercent,
  Trash2,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { getTranslation, translations, type Language } from "@/lib/i18n"
import type {
  MarketingAccountBundle,
  MarketingAssetLedger,
  MarketingAssetType,
  MarketingCampaign,
  MarketingCoupon,
  MarketingEventType,
  MarketingInvitationCode,
  MarketingListResult,
  MarketingOverview,
  MarketingProduct,
  MarketingReports,
  MarketingRiskEvent,
  MarketingRiskListItem,
  MarketingSetting,
  MarketingTaskTemplate,
  MarketingUserLite,
  MarketingWithdrawal,
} from "@/lib/market/marketing-types"
import type { MarketRewardRow } from "@/lib/market/referrals"

type TabKey = "overview" | "assets" | "fission" | "activity" | "withdraw" | "reports" | "risk"

type DashboardSummary = {
  today: {
    newUsers: number
    cashIssued: number
    pointsIssued: number
    pendingWithdrawalCount: number
    pendingWithdrawalAmount: number
    riskHits: number
    activeCampaigns: number
  }
  trends: Array<{ date: string; clicks: number; invites: number; activated: number; rewardCredits: number }>
  funnel: {
    totalClicks: number
    totalInvites: number
    totalActivated: number
    totalRewardCredits: number
    conversionRate: number
    activationRate: number
  }
  dailyRoi: Array<{ date: string; clicks: number; invites: number; activated: number; cashCost: number; pointsCost: number; roi: string }>
}

type FissionRow = {
  relationId: string
  inviterUserId: string
  inviterEmail: string | null
  invitedUserId: string
  invitedEmail: string | null
  shareCode: string
  toolSlug: string | null
  firstToolId: string | null
  status: string
  createdAt: string
  activatedAt: string | null
}

type FissionData = {
  overview: DashboardSummary["funnel"]
  trends: DashboardSummary["trends"]
  channels: Array<{ source: string; clicks: number; invites: number; conversionRate: number }>
  topInviters: Array<{
    inviterUserId: string
    inviterEmail: string | null
    referralCode: string | null
    clickCount: number
    invitedCount: number
    activatedCount: number
    rewardCredits: number
  }>
  relations: MarketingListResult<FissionRow>
  rewards: MarketingListResult<MarketRewardRow>
  statuses: string[]
}

type BootstrapData = {
  overview: MarketingOverview
  settings: MarketingSetting[]
  campaigns: MarketingCampaign[]
  taskTemplates: MarketingTaskTemplate[]
  accounts: MarketingListResult<MarketingAccountBundle>
  ledgers: MarketingListResult<MarketingAssetLedger>
  withdrawals: MarketingListResult<MarketingWithdrawal>
  riskEvents: MarketingListResult<MarketingRiskEvent>
  riskLists: MarketingListResult<MarketingRiskListItem>
  reports: MarketingReports
  invitationCodes: MarketingInvitationCode[]
  coupons: MarketingCoupon[]
  adInventory: {
    inventory: { total: number; active: number; positions: string[]; totalImpressions: number; totalClicks: number }
    templates: MarketingTaskTemplate[]
  }
  dashboardSummary: DashboardSummary
  constants: { assetTypes: MarketingAssetType[]; products: MarketingProduct[]; eventTypes: MarketingEventType[] }
}

type InviteShareTarget = {
  title: string
  code: string
  shareUrl: string
  helper: string
}

type LocalizedCopy = {
  zh: string
  en: string
}

type GrowthSystemKey = "cash" | "points" | "ads" | "vip"

type GrowthSettingField = {
  key: string
  defaultValue: string
  valueType: "number" | "string"
  label: LocalizedCopy
  description: LocalizedCopy
}

type GrowthSystemPreset = {
  key: GrowthSystemKey
  icon: LucideIcon
  accentClass: string
  title: LocalizedCopy
  description: LocalizedCopy
  highlight: LocalizedCopy
  campaignSlugs: string[]
  templateSlugs: string[]
  fields: GrowthSettingField[]
  playbooks: Array<{
    title: LocalizedCopy
    description: LocalizedCopy
  }>
}

const growthSystemPresets: GrowthSystemPreset[] = [
  {
    key: "cash",
    icon: DollarSign,
    accentClass: "from-emerald-50 via-white to-lime-50",
    title: {
      zh: "现金制度",
      en: "Cash System",
    },
    description: {
      zh: "围绕邀请注册、首次下单、月活登录和提现门槛构建现金增长闭环。",
      en: "A cash growth loop built around invite signup, first order, monthly login, and withdrawal thresholds.",
    },
    highlight: {
      zh: "适合做红包、拉新、留存和提现激励。",
      en: "Best for cash packets, user acquisition, retention, and withdrawals.",
    },
    campaignSlugs: ["invite-cash-sprint", "cash-retention-engine"],
    templateSlugs: ["referral-register-cash", "referral-first-order-cash", "ad-watch-cash"],
    fields: [
      {
        key: "invite_signup_cash_reward",
        defaultValue: "5",
        valueType: "number",
        label: {
          zh: "邀请注册奖励",
          en: "Invite signup reward",
        },
        description: {
          zh: "好友注册后给邀请人的现金奖励。",
          en: "Cash paid to the inviter after the invitee registers.",
        },
      },
      {
        key: "invite_first_order_cash_reward",
        defaultValue: "10",
        valueType: "number",
        label: {
          zh: "邀请首单奖励",
          en: "Invite first-order reward",
        },
        description: {
          zh: "被邀请人首次付费后追加给邀请人的现金奖励。",
          en: "Extra cash paid to the inviter after the invitee completes the first paid order.",
        },
      },
      {
        key: "cash_monthly_login_reward",
        defaultValue: "1",
        valueType: "number",
        label: {
          zh: "月登录保活现金",
          en: "Monthly login cash",
        },
        description: {
          zh: "当月完成一次有效登录后可获得的保活现金。",
          en: "Retention cash granted after one qualified login in the current month.",
        },
      },
      {
        key: "withdraw_min_amount",
        defaultValue: "20",
        valueType: "number",
        label: {
          zh: "提现门槛",
          en: "Withdrawal threshold",
        },
        description: {
          zh: "现金达到该门槛后才允许发起提现。",
          en: "Minimum cash balance required before a withdrawal can be requested.",
        },
      },
      {
        key: "cash_inactivity_preview_days",
        defaultValue: "30",
        valueType: "number",
        label: {
          zh: "现金静默预警天数",
          en: "Cash inactivity preview days",
        },
        description: {
          zh: "超过该天数未登录时开始提示现金风险。",
          en: "Show cash-risk warnings after this many inactive days.",
        },
      },
      {
        key: "cash_inactivity_deduction_daily_rate",
        defaultValue: "1",
        valueType: "number",
        label: {
          zh: "现金日扣减比例",
          en: "Cash daily deduction rate",
        },
        description: {
          zh: "长期不登录后的每日现金扣减比例。",
          en: "Daily cash deduction percentage after extended inactivity.",
        },
      },
      {
        key: "cash_inactivity_deduction_max_rate",
        defaultValue: "50",
        valueType: "number",
        label: {
          zh: "现金最大扣减上限",
          en: "Cash deduction cap",
        },
        description: {
          zh: "长期静默时累计最多扣减的现金比例。",
          en: "Maximum cumulative cash deduction percentage for inactive users.",
        },
      },
    ],
    playbooks: [
      {
        title: {
          zh: "邀请注册或下单返现",
          en: "Invite-to-cash",
        },
        description: {
          zh: "参考外卖、短视频红包玩法，用注册奖和首单奖提升裂变效率。",
          en: "Use signup and first-order rewards to mirror delivery or short-video red packet growth loops.",
        },
      },
      {
        title: {
          zh: "月活登录 + 提现门槛",
          en: "Monthly login + threshold",
        },
        description: {
          zh: "通过月登录保活和 20 元门槛，把用户从一次性领取转成长期留存。",
          en: "Pair monthly login retention with a 20-unit threshold to turn one-off claims into ongoing retention.",
        },
      },
    ],
  },
  {
    key: "points",
    icon: Activity,
    accentClass: "from-amber-50 via-white to-orange-50",
    title: {
      zh: "积分制度",
      en: "Points System",
    },
    description: {
      zh: "把邀请、下单、使用活跃和长期留存都沉淀成积分，并支持抵扣与衰减策略。",
      en: "Turn invites, orders, engagement, and long-term retention into points with redemption and decay rules.",
    },
    highlight: {
      zh: "适合做长期运营、抵扣与任务养成。",
      en: "Designed for long-term engagement, redemption, and habit loops.",
    },
    campaignSlugs: ["invite-cash-sprint", "points-loyalty-loop"],
    templateSlugs: ["referral-seven-day-login-points", "order-paid-points", "ai-quota-exhausted-relief"],
    fields: [
      {
        key: "invite_seven_day_login_points_reward",
        defaultValue: "50",
        valueType: "number",
        label: {
          zh: "邀请 7 天登录奖励",
          en: "Invite 7-day login reward",
        },
        description: {
          zh: "被邀请人连续登录 7 天后给邀请人的积分奖励。",
          en: "Points paid to the inviter after the invitee completes a 7-day login streak.",
        },
      },
      {
        key: "points_order_paid_reward",
        defaultValue: "100",
        valueType: "number",
        label: {
          zh: "下单返积分",
          en: "Order paid points",
        },
        description: {
          zh: "用户完成订单支付后返还的积分数量。",
          en: "Points returned to the buyer after a completed paid order.",
        },
      },
      {
        key: "points_redeem_offset_rate",
        defaultValue: "100",
        valueType: "number",
        label: {
          zh: "积分抵扣比例",
          en: "Points redemption rate",
        },
        description: {
          zh: "多少积分可抵扣 1 元或 1 单位金额。",
          en: "How many points are required to offset one unit of spend.",
        },
      },
      {
        key: "points_expiry_days",
        defaultValue: "180",
        valueType: "number",
        label: {
          zh: "长期不用清零天数",
          en: "Points clear window",
        },
        description: {
          zh: "超过该时长长期不用时触发清零或强提醒。",
          en: "Window after which dormant points can be cleared or aggressively warned.",
        },
      },
      {
        key: "invite_points_decay_grace_days",
        defaultValue: "30",
        valueType: "number",
        label: {
          zh: "积分衰减宽限天数",
          en: "Points decay grace days",
        },
        description: {
          zh: "连续未登录达到该天数后开始衰减。",
          en: "Number of inactive days before point decay starts.",
        },
      },
      {
        key: "invite_points_decay_daily_rate",
        defaultValue: "1",
        valueType: "number",
        label: {
          zh: "积分日衰减比例",
          en: "Points daily decay rate",
        },
        description: {
          zh: "静默期后的每日积分扣减比例。",
          en: "Daily points decay percentage after the inactivity grace period.",
        },
      },
      {
        key: "invite_points_decay_max_rate",
        defaultValue: "50",
        valueType: "number",
        label: {
          zh: "积分衰减上限",
          en: "Points decay cap",
        },
        description: {
          zh: "积分衰减的累计最大比例。",
          en: "Maximum cumulative percentage that can be decayed from points.",
        },
      },
    ],
    playbooks: [
      {
        title: {
          zh: "下单返积分",
          en: "Order-to-points",
        },
        description: {
          zh: "通过下单返积分，把电商、AI 套餐或服务购买接进积分体系。",
          en: "Bring ecommerce, AI packages, or services into the points loop with pay-order rewards.",
        },
      },
      {
        title: {
          zh: "长期不用清零 / 长期不登录渐扣",
          en: "Expiry + decay",
        },
        description: {
          zh: "让积分既可抵扣，又不会无限沉睡，保持活跃运营节奏。",
          en: "Let points stay redeemable without becoming permanently dormant, preserving ongoing engagement.",
        },
      },
    ],
  },
  {
    key: "ads",
    icon: Target,
    accentClass: "from-sky-50 via-white to-cyan-50",
    title: {
      zh: "广告激励制度",
      en: "Ad Reward System",
    },
    description: {
      zh: "为不想立刻付费的用户提供“看广告换奖励”的缓冲层，承接现金、积分和 AI 次数。",
      en: "Provide a watch-ad fallback for users who do not want to pay immediately, covering cash, points, and AI quota.",
    },
    highlight: {
      zh: "适合 AI 次数不足、活动补量和现金红包小激励。",
      en: "Useful for AI quota fallback, campaign top-ups, and small cash packet rewards.",
    },
    campaignSlugs: ["ad-reward-boost"],
    templateSlugs: ["ad-watch-cash", "ad-watch-points", "ad-watch-ai-quota"],
    fields: [
      {
        key: "ad_watch_min_seconds",
        defaultValue: "15",
        valueType: "number",
        label: {
          zh: "广告最短时长",
          en: "Minimum watch seconds",
        },
        description: {
          zh: "完成多少秒广告才算有效激励观看。",
          en: "Minimum rewarded ad duration required to count as valid.",
        },
      },
      {
        key: "ad_watch_daily_limit",
        defaultValue: "5",
        valueType: "number",
        label: {
          zh: "广告奖励日上限",
          en: "Rewarded ad daily limit",
        },
        description: {
          zh: "用户每天最多可领取的激励广告奖励次数。",
          en: "Daily limit for how many rewarded ads a user can claim.",
        },
      },
      {
        key: "ad_watch_cash_reward",
        defaultValue: "1",
        valueType: "number",
        label: {
          zh: "广告现金红包",
          en: "Ad cash reward",
        },
        description: {
          zh: "看完一次广告后发放的小额现金红包。",
          en: "Small cash packet paid after one rewarded ad completion.",
        },
      },
      {
        key: "ad_watch_points_reward",
        defaultValue: "30",
        valueType: "number",
        label: {
          zh: "广告积分奖励",
          en: "Ad points reward",
        },
        description: {
          zh: "看完一次广告后发放的积分数量。",
          en: "Points paid after one rewarded ad completion.",
        },
      },
      {
        key: "ad_watch_ai_quota_reward",
        defaultValue: "20",
        valueType: "number",
        label: {
          zh: "广告 AI 次数奖励",
          en: "Ad AI quota reward",
        },
        description: {
          zh: "看完一次广告后补发的 AI 次数。",
          en: "AI quota granted after one rewarded ad completion.",
        },
      },
    ],
    playbooks: [
      {
        title: {
          zh: "15 秒广告红包",
          en: "15-second ad packet",
        },
        description: {
          zh: "参考任务广告模式，用 15 秒观看换取现金红包或积分。",
          en: "Use a 15-second rewarded ad to exchange for a cash packet or points.",
        },
      },
      {
        title: {
          zh: "AI 次数耗尽后的广告补量",
          en: "Quota exhausted fallback",
        },
        description: {
          zh: "用户不想立刻开会员时，广告激励能先承接一次免费继续使用。",
          en: "When users do not want to upgrade immediately, rewarded ads can bridge them with a free continuation path.",
        },
      },
    ],
  },
  {
    key: "vip",
    icon: TicketPercent,
    accentClass: "from-rose-50 via-white to-fuchsia-50",
    title: {
      zh: "会员升级制度",
      en: "VIP System",
    },
    description: {
      zh: "把连续登录、次数耗尽、升级折扣和会员补贴串成一条完整的升级转化链路。",
      en: "Connect login streaks, quota exhaustion, upgrade discounts, and membership bonuses into a full upgrade funnel.",
    },
    highlight: {
      zh: "适合做限时折扣、会员补贴和升级转化。",
      en: "Built for limited-time discounts, membership subsidies, and upgrade conversion.",
    },
    campaignSlugs: ["login-grand-prize", "vip-upgrade-flash-sale"],
    templateSlugs: ["login-streak-vip", "subscription-upgrade-vip", "ai-quota-exhausted-vip-trial", "ai-quota-exhausted-relief"],
    fields: [
      {
        key: "login_streak_vip_days",
        defaultValue: "3",
        valueType: "number",
        label: {
          zh: "连续登录送会员天数",
          en: "Login streak VIP days",
        },
        description: {
          zh: "用户达成连续登录里程碑后赠送的会员天数。",
          en: "VIP days granted after a consecutive-login milestone.",
        },
      },
      {
        key: "ai_quota_relief_points_reward",
        defaultValue: "15",
        valueType: "number",
        label: {
          zh: "次数耗尽引导积分",
          en: "Quota exhausted points",
        },
        description: {
          zh: "次数耗尽时发放的引导积分，用于鼓励继续任务或转化。",
          en: "Guide points granted when quota is exhausted to encourage fallback actions or conversion.",
        },
      },
      {
        key: "ai_quota_relief_vip_days",
        defaultValue: "1",
        valueType: "number",
        label: {
          zh: "次数耗尽体验会员",
          en: "Quota exhausted VIP trial",
        },
        description: {
          zh: "次数耗尽时可发放的短时会员体验。",
          en: "Short VIP trial granted when usage quota is exhausted.",
        },
      },
      {
        key: "vip_upgrade_bonus_days",
        defaultValue: "30",
        valueType: "number",
        label: {
          zh: "升级会员补贴天数",
          en: "Upgrade bonus days",
        },
        description: {
          zh: "用户完成会员升级后额外赠送的天数。",
          en: "Extra membership days granted after a successful subscription upgrade.",
        },
      },
      {
        key: "vip_flash_sale_discount_rate",
        defaultValue: "20",
        valueType: "number",
        label: {
          zh: "限时升级折扣",
          en: "Flash-sale discount",
        },
        description: {
          zh: "限时会员升级活动的折扣比例。",
          en: "Discount percentage for limited-time membership upgrades.",
        },
      },
      {
        key: "vip_upsell_window_days",
        defaultValue: "7",
        valueType: "number",
        label: {
          zh: "限时转化窗口",
          en: "Upsell window",
        },
        description: {
          zh: "次数耗尽或触达后可显示升级优惠的有效窗口。",
          en: "Conversion window for showing upgrade offers after trigger events.",
        },
      },
    ],
    playbooks: [
      {
        title: {
          zh: "连续登录冲大奖",
          en: "Streak-to-prize",
        },
        description: {
          zh: "把连续登录和贵重礼品文案结合，先用会员小奖，再用大礼品拉长周期。",
          en: "Pair login streaks with premium prize storytelling: small VIP wins first, bigger hero prizes later.",
        },
      },
      {
        title: {
          zh: "次数耗尽转会员",
          en: "Quota-to-VIP",
        },
        description: {
          zh: "在 AI 次数耗尽时给出广告、邀请和会员三条路，最后承接限时升级。",
          en: "Offer ads, invites, and VIP paths when AI quota is exhausted, then convert with a limited-time upgrade.",
        },
      },
    ],
  },
]

const growthSettingFields = growthSystemPresets.flatMap((item) => item.fields)

const growthDefaultConfig = Object.fromEntries(growthSettingFields.map((field) => [field.key, field.defaultValue])) as Record<string, string>

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatDateTime(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "-"
  return date.toLocaleString()
}

function getCouponUsedCount(row: MarketingCoupon) {
  const parsed = Number(row.usedCount || 0)
  if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed)
  return row.status === "used" ? 1 : 0
}

function getCouponMaxUses(row: MarketingCoupon) {
  if (row.maxUses === null) return null
  const parsed = Number(row.maxUses)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.floor(parsed)
}

function getCouponRemainingUses(row: MarketingCoupon) {
  const maxUses = getCouponMaxUses(row)
  if (maxUses === null) return null
  return Math.max(maxUses - getCouponUsedCount(row), 0)
}

function getSettingValue(settings: MarketingSetting[] | undefined, key: string, fallback: string) {
  const value = settings?.find((item) => item.key === key)?.value
  if (value === undefined || value === null) return fallback
  return String(value)
}

function parseConfigNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function createInviteCode(seed?: string) {
  const prefix = (seed || "invite")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12) || "INVITE"
  const stamp = Date.now().toString(36).slice(-4).toUpperCase()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${prefix}-${stamp}${random}`
}

function createCouponCode(seed?: string) {
  const prefix = (seed || "coupon")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 10) || "COUPON"
  const stamp = Date.now().toString(36).slice(-4).toUpperCase()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${prefix}-${stamp}${random}`
}

function buildMarketingInviteShareUrl(input: {
  code: string
  campaignSlug?: string | null
  product?: string | null
  tier?: string | null
  origin?: string | null
}) {
  const code = String(input.code || "").trim().toUpperCase()
  const params = new URLSearchParams()
  if (input.campaignSlug) params.set("campaign", input.campaignSlug)
  if (input.product) params.set("product", input.product)
  if (input.tier) params.set("tier", input.tier)

  const relative = `/invite/${encodeURIComponent(code)}${params.size ? `?${params.toString()}` : ""}`
  const origin = String(input.origin || "").trim().replace(/\/+$/, "")
  return origin ? `${origin}${relative}` : relative
}

function statusClass(status: string) {
  if (["active", "approved", "resolved", "processed"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (["pending", "reviewing", "in_progress"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-700"
  if (["frozen", "risk_blocked"].includes(status)) return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-slate-200 bg-slate-100 text-slate-700"
}

function severityClass(severity: string) {
  if (severity === "high") return "border-rose-200 bg-rose-50 text-rose-700"
  if (severity === "medium") return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-sky-200 bg-sky-50 text-sky-700"
}

function normalizePartnerTier(value: string) {
  return value === "blogger_partner" ? "partner_package" : value
}

function normalizeAudienceType(value: string) {
  return value === "blogger_fans" ? "linked_audience" : value
}

function Section({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[16px] font-semibold text-gray-900">{title}</div>
          {description ? <div className="mt-1 text-sm text-gray-500">{description}</div> : null}
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="text-[13px] text-gray-500">{title}</div>
      <div className="mt-1 text-3xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  })

  const json = await response.json().catch(() => ({}))
  if (!response.ok || json?.success === false) {
    throw new Error(json?.error || "Request failed")
  }
  return json as T
}

async function lookupMarketingUser(userId: string) {
  const normalized = userId.trim()
  if (!normalized) return null
  const response = await fetchJson<{ success: true; user: MarketingUserLite | null }>(
    `/api/market-admin/admin/marketing/users?userId=${encodeURIComponent(normalized)}`,
  )
  return response.user
}

function dedupeCampaignList(rows: MarketingCampaign[]) {
  const deduped = new Map<string, MarketingCampaign>()

  for (const campaign of rows) {
    const key = campaign.slug || campaign.id
    if (!key) continue

    const existing = deduped.get(key)
    if (!existing || Date.parse(campaign.updatedAt) >= Date.parse(existing.updatedAt)) {
      deduped.set(key, campaign)
    }
  }

  return Array.from(deduped.values())
}

function dedupeTaskTemplateList(rows: MarketingTaskTemplate[]) {
  const deduped = new Map<string, MarketingTaskTemplate>()

  for (const template of rows) {
    const key = template.slug || template.id
    if (!key) continue

    const existing = deduped.get(key)
    if (!existing || Date.parse(template.updatedAt) >= Date.parse(existing.updatedAt)) {
      deduped.set(key, template)
    }
  }

  return Array.from(deduped.values())
}

export function MarketingConsoleClient({ region }: { region: "CN" | "INTL" }) {
  const router = useRouter()
  const language: Language = region === "CN" ? "zh" : "en"
  const t = (key: keyof typeof translations.en) => getTranslation(language, key)
  const tx = (zh: string, en: string) => (region === "CN" ? zh : en)

  const [tab, setTab] = useState<TabKey>("overview")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busyLabel, setBusyLabel] = useState("")
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null)
  const [accounts, setAccounts] = useState<MarketingListResult<MarketingAccountBundle> | null>(null)
  const [ledgers, setLedgers] = useState<MarketingListResult<MarketingAssetLedger> | null>(null)
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([])
  const [taskTemplates, setTaskTemplates] = useState<MarketingTaskTemplate[]>([])
  const [withdrawals, setWithdrawals] = useState<MarketingListResult<MarketingWithdrawal> | null>(null)
  const [riskEvents, setRiskEvents] = useState<MarketingListResult<MarketingRiskEvent> | null>(null)
  const [riskLists, setRiskLists] = useState<MarketingListResult<MarketingRiskListItem> | null>(null)
  const [fission, setFission] = useState<FissionData | null>(null)

  const [assetQuery, setAssetQuery] = useState("")
  const [ledgerAssetType, setLedgerAssetType] = useState("all")
  const [withdrawalStatus, setWithdrawalStatus] = useState("all")
  const [riskStatus, setRiskStatus] = useState("all")
  const [fissionSearch, setFissionSearch] = useState("")
  const [fissionStatus, setFissionStatus] = useState("all")
  const [fissionDatePreset, setFissionDatePreset] = useState("all")
  const [fissionDate, setFissionDate] = useState("")
  const [fissionPage, setFissionPage] = useState(1)
  const [fissionTab, setFissionTab] = useState<"relations" | "rewards">("relations")
  const [adjustForm, setAdjustForm] = useState({ userId: "", assetType: "points", amount: "10", remark: "" })
  const [withdrawalForm, setWithdrawalForm] = useState({ userId: "", amount: "20", channel: "manual" })
  const [riskListForm, setRiskListForm] = useState({ listType: "user", targetValue: "", reason: "" })
  const [partnerConfigForm, setPartnerConfigForm] = useState({
    partnerTier: "partner_package",
    partnerProduct: "orbitchat",
    productCost: "0",
    partnerBenefitMonths: "36",
    fanDiscountRate: "20",
    orderCommissionRate: "15",
  })
  const [inviteCodeForm, setInviteCodeForm] = useState({
    code: "",
    linkedAudienceCode: "",
    userId: "",
    campaignSlug: "invite-cash-sprint",
    partnerTier: "partner_package",
    partnerProduct: "orbitchat",
    productCost: "0",
    partnerBenefitMonths: "36",
    fanDiscountRate: "20",
    orderCommissionRate: "15",
    maxUses: "1",
    expiresAt: "",
  })
  const [couponForm, setCouponForm] = useState({
    code: "",
    userId: "",
    assetType: "cash",
    audienceType: "linked_audience",
    partnerProduct: "orbitchat",
    sourceInvitationCode: "",
    productCost: "0",
    orderCommissionRate: "15",
    purchasePrice: "9.9",
    discountValue: "20",
    discountType: "percentage",
    minPurchase: "99",
    maxUses: "1",
    expiresAt: "",
  })
  const [couponBindingMode, setCouponBindingMode] = useState<"public" | "user">("public")
  const [couponConfigForm, setCouponConfigForm] = useState({ purchasePrice: "9.9", productCost: "0", discountValue: "15", discountType: "percentage", minPurchase: "99", validDays: "30", userId: "" })
  const [inviteQrTarget, setInviteQrTarget] = useState<InviteShareTarget | null>(null)
  const [growthConfigForm, setGrowthConfigForm] = useState<Record<string, string>>(growthDefaultConfig)

  const navItems = useMemo(
    () => [
      { key: "overview" as const, label: tx("总览大盘", "Overview"), icon: BarChart3 },
      { key: "assets" as const, label: tx("用户资产", "Assets"), icon: Database },
      { key: "fission" as const, label: tx("裂变与拉新", "Fission"), icon: Users },
      { key: "activity" as const, label: tx("活动与任务", "Activity"), icon: Target },
      { key: "withdraw" as const, label: tx("提现审核", "Withdrawals"), icon: DollarSign },
      { key: "reports" as const, label: tx("数据与报表", "Reports"), icon: TrendingUp },
      { key: "risk" as const, label: tx("风控安全", "Risk"), icon: Shield },
    ],
    [region],
  )

  const assetRows = accounts?.rows || bootstrap?.accounts.rows || []
  const ledgerRows = ledgers?.rows || bootstrap?.ledgers.rows || []
  const withdrawalRows = withdrawals?.rows || bootstrap?.withdrawals.rows || []
  const riskEventRows = riskEvents?.rows || bootstrap?.riskEvents.rows || []
  const riskListRows = riskLists?.rows || bootstrap?.riskLists.rows || []
  const pendingWithdrawalCount = withdrawalRows.filter((item) => item.status === "pending").length
  const invitationCodes = [...(bootstrap?.invitationCodes || [])].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  const coupons = [...(bootstrap?.coupons || [])].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  const couponUsedTotal = coupons.reduce((sum, item) => sum + getCouponUsedCount(item), 0)
  const siteOrigin = typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || ""
  const allCampaigns = useMemo(
    () => dedupeCampaignList(campaigns.length ? campaigns : bootstrap?.campaigns || []),
    [bootstrap?.campaigns, campaigns],
  )
  const allTaskTemplates = useMemo(
    () => dedupeTaskTemplateList(taskTemplates.length ? taskTemplates : bootstrap?.taskTemplates || []),
    [bootstrap?.taskTemplates, taskTemplates],
  )
  const growthSystems = useMemo(() => {
    const campaignMap = new Map(allCampaigns.map((item) => [item.slug, item]))
    const taskTemplateMap = new Map(allTaskTemplates.map((item) => [item.slug, item]))
    const overview = bootstrap?.overview
    const dashboardSummary = bootstrap?.dashboardSummary
    const reports = bootstrap?.reports
    const adInventory = bootstrap?.adInventory

    return growthSystemPresets.map((preset) => {
      const relatedCampaigns = preset.campaignSlugs
        .map((slug) => campaignMap.get(slug))
        .filter((item): item is MarketingCampaign => Boolean(item))
      const relatedTemplates = preset.templateSlugs
        .map((slug) => taskTemplateMap.get(slug))
        .filter((item): item is MarketingTaskTemplate => Boolean(item))
      const activeCampaigns = relatedCampaigns.filter((item) => item.status === "active")
      const activeTemplates = relatedTemplates.filter((item) => item.status === "active")
      const rules = preset.fields.map((field) => ({
        ...field,
        value: growthConfigForm[field.key] ?? field.defaultValue,
      }))

      const metrics =
        preset.key === "cash"
          ? [
              {
                label: tx("可用现金池", "Available cash"),
                value: `￥${formatNumber(overview?.assetTotals.cash.available || 0)}`,
              },
              {
                label: tx("今日发放现金", "Cash issued today"),
                value: `￥${formatNumber(dashboardSummary?.today.cashIssued || 0)}`,
              },
              {
                label: tx("提现门槛", "Withdrawal threshold"),
                value: `￥${formatNumber(parseConfigNumber(growthConfigForm.withdraw_min_amount, 20))}`,
              },
              {
                label: tx("现金任务数", "Cash task templates"),
                value: formatNumber(activeTemplates.length),
              },
            ]
          : preset.key === "points"
            ? [
                {
                  label: tx("可用积分池", "Available points"),
                  value: formatNumber(overview?.assetTotals.points.available || 0),
                },
                {
                  label: tx("今日发放积分", "Points issued today"),
                  value: formatNumber(dashboardSummary?.today.pointsIssued || 0),
                },
                {
                  label: tx("抵扣比例", "Redemption rate"),
                  value: tx(
                    `${formatNumber(parseConfigNumber(growthConfigForm.points_redeem_offset_rate, 100))} 积分 / 1 元`,
                    `${formatNumber(parseConfigNumber(growthConfigForm.points_redeem_offset_rate, 100))} pts / 1 unit`,
                  ),
                },
                {
                  label: tx("积分任务数", "Points task templates"),
                  value: formatNumber(activeTemplates.length),
                },
              ]
            : preset.key === "ads"
              ? [
                  {
                    label: tx("在线广告位", "Active ad slots"),
                    value: `${formatNumber(adInventory?.inventory.active || 0)} / ${formatNumber(adInventory?.inventory.total || 0)}`,
                  },
                  {
                    label: tx("激励任务模板", "Reward templates"),
                    value: formatNumber(adInventory?.templates.length || 0),
                  },
                  {
                    label: tx("激励广告时长", "Watch threshold"),
                    value: `${formatNumber(parseConfigNumber(growthConfigForm.ad_watch_min_seconds, 15))}s`,
                  },
                  {
                    label: tx("广告奖励日上限", "Daily reward limit"),
                    value: formatNumber(parseConfigNumber(growthConfigForm.ad_watch_daily_limit, 5)),
                  },
                ]
              : [
                  {
                    label: tx("可用会员天数池", "Available VIP days"),
                    value: formatNumber(overview?.assetTotals.vip_duration.available || 0),
                  },
                  {
                    label: tx("升级奖励天数", "Upgrade bonus days"),
                    value: formatNumber(parseConfigNumber(growthConfigForm.vip_upgrade_bonus_days, 30)),
                  },
                  {
                    label: tx("限时升级折扣", "Flash-sale discount"),
                    value: `${formatNumber(parseConfigNumber(growthConfigForm.vip_flash_sale_discount_rate, 20))}%`,
                  },
                  {
                    label: tx("会员相关任务", "VIP task templates"),
                    value: formatNumber(activeTemplates.length),
                  },
                ]

      return {
        ...preset,
        campaigns: relatedCampaigns,
        templates: relatedTemplates,
        rules,
        metrics,
        activeCampaigns,
        activeTemplates,
        recentPerformance:
          relatedTemplates
            .map((template) => reports?.taskPerformance.find((item) => item.templateSlug === template.slug))
            .filter((item): item is MarketingReports["taskPerformance"][number] => Boolean(item)) || [],
      }
    })
  }, [
    allCampaigns,
    allTaskTemplates,
    bootstrap?.adInventory,
    bootstrap?.dashboardSummary,
    bootstrap?.overview,
    bootstrap?.reports,
    growthConfigForm,
    region,
  ])

  const selectedInviteCampaign =
    allCampaigns.find((campaign) => campaign.slug === inviteCodeForm.campaignSlug) ||
    null
  const inviteCodePreview = inviteCodeForm.code.trim() || createInviteCode(inviteCodeForm.campaignSlug || selectedInviteCampaign?.slug || "invite")
  const inviteExpiryPreview = inviteCodeForm.expiresAt
    ? formatDateTime(new Date(inviteCodeForm.expiresAt).toISOString())
    : tx("未设置过期时间", "No expiration set")
  const inviteUsagePreview = inviteCodeForm.maxUses
    ? tx(`最多使用 ${inviteCodeForm.maxUses} 次`, `Up to ${inviteCodeForm.maxUses} uses`)
    : tx("不限使用次数", "Unlimited uses")
  const couponCodePreview = couponForm.code.trim() || createCouponCode(`coupon-${couponForm.assetType || "cash"}`)
  const couponUsagePreview = couponForm.maxUses.trim()
    ? tx(`最多使用 ${couponForm.maxUses.trim()} 次`, `Up to ${couponForm.maxUses.trim()} uses`)
    : tx("不限使用次数", "Unlimited uses")
  const linkedAudienceCodePreview =
    inviteCodeForm.linkedAudienceCode.trim() || createInviteCode(`${inviteCodeForm.campaignSlug || "audience"}-aud`)
  const linkedAudienceProductPreview =
    inviteCodeForm.partnerProduct.trim() || partnerConfigForm.partnerProduct.trim() || "orbitchat"
  const linkedAudienceMinPurchasePreview = couponConfigForm.minPurchase || couponForm.minPurchase || "0"
  const partnerBenefitYears = (() => {
    const months = Number(inviteCodeForm.partnerBenefitMonths || 0)
    if (!Number.isFinite(months) || months <= 0) return "0"
    const years = months / 12
    return Number.isInteger(years) ? String(years) : years.toFixed(1)
  })()
  const partnerConfigBenefitYears = (() => {
    const months = Number(partnerConfigForm.partnerBenefitMonths || 0)
    if (!Number.isFinite(months) || months <= 0) return "0"
    const years = months / 12
    return Number.isInteger(years) ? String(years) : years.toFixed(1)
  })()
  const linkedAudienceFold = (() => {
    const rate = Number(inviteCodeForm.fanDiscountRate || 0)
    if (!Number.isFinite(rate)) return "10"
    const fold = (100 - Math.min(Math.max(rate, 0), 100)) / 10
    return Number.isInteger(fold) ? String(fold) : fold.toFixed(1)
  })()
  const partnerConfigAudienceFold = (() => {
    const rate = Number(partnerConfigForm.fanDiscountRate || 0)
    if (!Number.isFinite(rate)) return "10"
    const fold = (100 - Math.min(Math.max(rate, 0), 100)) / 10
    return Number.isInteger(fold) ? String(fold) : fold.toFixed(1)
  })()
  const couponDiscountPreview =
    couponConfigForm.discountType === "percentage"
      ? tx(
          `${Math.max(0, 10 - Number(couponConfigForm.discountValue || 0) / 10).toFixed(1).replace(/\\.0$/, "")} 折 / ${couponConfigForm.discountValue || "0"}% off`,
          `${couponConfigForm.discountValue || "0"}% off`,
        )
      : tx(`直减 ￥${couponConfigForm.discountValue || "0"}`, `Save ${couponConfigForm.discountValue || "0"}`)
  const couponConditionPreview = tx(
    `购券价 ￥${couponConfigForm.purchasePrice || "0"}，满 ￥${couponConfigForm.minPurchase || "0"} 可用，有效期 ${couponConfigForm.validDays || "0"} 天`,
    `Purchase ${couponConfigForm.purchasePrice || "0"}, min spend ${couponConfigForm.minPurchase || "0"}, valid for ${couponConfigForm.validDays || "0"} days`,
  )
  const partnerBenefitPreview = tx(
    `合作方赠送 ${inviteCodeForm.partnerBenefitMonths || "0"} 个月会员，关联对象 ${inviteCodeForm.fanDiscountRate || "0"}% 优惠，订单分成 ${inviteCodeForm.orderCommissionRate || "0"}%`,
    `Partner gets ${inviteCodeForm.partnerBenefitMonths || "0"} months, linked audience gets ${inviteCodeForm.fanDiscountRate || "0"}% off, commission ${inviteCodeForm.orderCommissionRate || "0"}%`,
  )

  const partnerProgramPreview = tx(
    `合作方赠送 ${partnerBenefitYears} 年会员（${inviteCodeForm.partnerBenefitMonths || "0"} 个月），关联对象 ${linkedAudienceFold} 折优惠，订单分成 ${inviteCodeForm.orderCommissionRate || "0"}%`,
    `Partner gets ${partnerBenefitYears} years (${inviteCodeForm.partnerBenefitMonths || "0"} months), linked audience gets ${linkedAudienceFold}x pricing, commission ${inviteCodeForm.orderCommissionRate || "0"}%`,
  )
  const couponAudienceType = normalizeAudienceType(couponForm.audienceType)
  const couponDerivedProduct = couponForm.partnerProduct.trim() || inviteCodeForm.partnerProduct.trim() || partnerConfigForm.partnerProduct || "orbitchat"
  const couponDerivedProductCost = couponForm.productCost || inviteCodeForm.productCost || partnerConfigForm.productCost || "0"
  const couponDefaultSourceInvitationCode = couponAudienceType === "linked_audience" ? inviteCodeForm.code.trim() || inviteCodePreview : ""
  const couponDerivedSourceInvitationCode =
    couponForm.sourceInvitationCode.trim() ||
    couponDefaultSourceInvitationCode
  const couponDerivedCommissionRate =
    couponAudienceType === "linked_audience"
      ? couponForm.orderCommissionRate || inviteCodeForm.orderCommissionRate || partnerConfigForm.orderCommissionRate || "0"
      : couponForm.orderCommissionRate || "0"
  const couponSelectableSourceInvitationCode = invitationCodes.some(
    (item) => item.code.trim().toUpperCase() === couponForm.sourceInvitationCode.trim().toUpperCase(),
  )
    ? couponForm.sourceInvitationCode.trim().toUpperCase()
    : ""
  const couponLinkedInvitationSource = (() => {
    const derivedCode = couponDerivedSourceInvitationCode.trim().toUpperCase()
    if (!derivedCode) return null

    const matchedInvitation = invitationCodes.find((item) => item.code.trim().toUpperCase() === derivedCode)
    if (matchedInvitation) {
      return {
        code: matchedInvitation.code,
        partnerProduct: matchedInvitation.partnerProduct || "",
        productCost: matchedInvitation.productCost,
        fanDiscountRate: matchedInvitation.fanDiscountRate,
        orderCommissionRate: matchedInvitation.orderCommissionRate,
        isDraftCurrentInvite: false,
      }
    }

    if (couponAudienceType !== "linked_audience") return null
    if (derivedCode !== couponDefaultSourceInvitationCode.trim().toUpperCase()) return null

    return {
      code: couponDefaultSourceInvitationCode,
      partnerProduct: inviteCodeForm.partnerProduct.trim() || partnerConfigForm.partnerProduct || "",
      productCost: Number(inviteCodeForm.productCost || partnerConfigForm.productCost || 0),
      fanDiscountRate: Number(inviteCodeForm.fanDiscountRate || partnerConfigForm.fanDiscountRate || 0),
      orderCommissionRate: Number(inviteCodeForm.orderCommissionRate || partnerConfigForm.orderCommissionRate || 0),
      isDraftCurrentInvite: true,
    }
  })()
  const couponBoundUserId = couponBindingMode === "user" ? couponForm.userId.trim() : ""
  const couponBoundUser = assetRows.find((row) => row.user.userId === couponBoundUserId)?.user || null
  const buildInviteShareTarget = (input: {
    title: string
    code: string
    helper: string
    campaignSlug?: string | null
    product?: string | null
    tier?: string | null
  }): InviteShareTarget => ({
    title: input.title,
    code: input.code,
    helper: input.helper,
    shareUrl: buildMarketingInviteShareUrl({
      origin: siteOrigin,
      code: input.code,
      campaignSlug: input.campaignSlug,
      product: input.product,
      tier: input.tier,
    }),
  })
  const previewInviteShareTarget = buildInviteShareTarget({
    title: tx("合作方邀请码分享", "Partner invite share"),
    code: inviteCodePreview,
    helper: tx("当前合作方邀请码对应的分享链接与二维码。", "Share link and QR code for the current partner invite."),
    campaignSlug: inviteCodeForm.campaignSlug || null,
    product: inviteCodeForm.partnerProduct || null,
    tier: normalizePartnerTier(inviteCodeForm.partnerTier),
  })
  const previewLinkedAudienceShareTarget = buildInviteShareTarget({
    title: tx("关联对象邀请码分享", "Linked audience invite share"),
    code: linkedAudienceCodePreview,
    helper: tx("当前关联对象邀请码对应的分享链接与二维码。", "Share link and QR code for the current linked audience invite."),
    campaignSlug: inviteCodeForm.campaignSlug || null,
    product: linkedAudienceProductPreview || null,
    tier: "linked_audience",
  })

  const applyPartnerPackagePreset = () => {
    setInviteCodeForm((current) => ({
      ...current,
      partnerTier: partnerConfigForm.partnerTier,
      partnerProduct: partnerConfigForm.partnerProduct,
      productCost: partnerConfigForm.productCost,
      partnerBenefitMonths: partnerConfigForm.partnerBenefitMonths,
      fanDiscountRate: partnerConfigForm.fanDiscountRate,
      orderCommissionRate: partnerConfigForm.orderCommissionRate,
    }))
    setCouponForm((current) => ({
      ...current,
      audienceType: "linked_audience",
      discountType: "percentage",
      partnerProduct: partnerConfigForm.partnerProduct,
      sourceInvitationCode: current.sourceInvitationCode || inviteCodeForm.code || inviteCodePreview,
      productCost: partnerConfigForm.productCost,
      discountValue: partnerConfigForm.fanDiscountRate,
      orderCommissionRate: partnerConfigForm.orderCommissionRate,
    }))
  }

  const applyCouponInvitePackage = () => {
    if (!couponLinkedInvitationSource) return
    setCouponForm((current) => ({
      ...current,
      audienceType: "linked_audience",
      partnerProduct: couponLinkedInvitationSource.partnerProduct,
      sourceInvitationCode: couponLinkedInvitationSource.isDraftCurrentInvite ? "" : couponLinkedInvitationSource.code.toUpperCase(),
      productCost: String(couponLinkedInvitationSource.productCost),
      discountType: "percentage",
      discountValue: String(couponLinkedInvitationSource.fanDiscountRate),
      orderCommissionRate: String(couponLinkedInvitationSource.orderCommissionRate),
    }))
    setNotice(
      tx(
        `已同步 ${couponLinkedInvitationSource.code} 的商品、成本、折扣和分成`,
        `Applied product, cost, discount, and commission from ${couponLinkedInvitationSource.code}`,
      ),
    )
    window.setTimeout(() => setNotice(""), 2200)
  }

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(label)
      window.setTimeout(() => setNotice(""), 2200)
    } catch (_error) {
      setError(tx("复制失败，请手动复制", "Copy failed, please copy manually"))
    }
  }

  const shareInviteTarget = async (target: InviteShareTarget) => {
    const shareText = tx(
      `${target.title}\n邀请码：${target.code}`,
      `${target.title}\nInvite code: ${target.code}`,
    )

    try {
      if (navigator.share) {
        await navigator.share({
          title: target.title,
          text: shareText,
          url: target.shareUrl,
        })
        setNotice(tx("邀请分享已打开", "Invite share opened"))
        window.setTimeout(() => setNotice(""), 2200)
        return
      }

      await copyToClipboard(`${shareText}\n${target.shareUrl}`, tx("邀请内容已复制", "Invite details copied"))
    } catch (error: any) {
      if (error?.name === "AbortError") return
      setError(tx("分享失败，请改为复制链接", "Share failed, please copy the link instead"))
    }
  }

  const handleDeleteInvitationCode = async (row: MarketingInvitationCode) => {
    const confirmed = window.confirm(tx(`确认删除邀请码 ${row.code} 吗？`, `Delete invite code ${row.code}?`))
    if (!confirmed) return
    await runAction(tx("邀请码已删除", "Invite code deleted"), async () => {
      await fetchJson(`/api/market-admin/admin/marketing/invitation-codes?id=${encodeURIComponent(row.id)}`, { method: "DELETE" })
      await Promise.all([loadBootstrap(), loadFission(1)])
    })
  }

  const handleDeleteCoupon = async (row: MarketingCoupon) => {
    const confirmed = window.confirm(tx(`确认删除折扣券 ${row.code} 吗？`, `Delete coupon ${row.code}?`))
    if (!confirmed) return
    await runAction(tx("折扣券已删除", "Coupon deleted"), async () => {
      await fetchJson(`/api/market-admin/admin/marketing/coupons?id=${encodeURIComponent(row.id)}`, { method: "DELETE" })
      await loadBootstrap()
    })
  }

  const handleAdjustCouponUsage = async (row: MarketingCoupon) => {
    try {
      const currentMaxUses = getCouponMaxUses(row)
      const maxUsesInput = window.prompt(
        tx("请输入总可用次数，留空表示不限次数。", "Enter total uses. Leave blank for unlimited uses."),
        currentMaxUses === null ? "" : String(currentMaxUses),
      )
      if (maxUsesInput === null) return

      const normalizedMaxUsesInput = maxUsesInput.trim()
      const nextMaxUses =
        normalizedMaxUsesInput === ""
          ? null
          : (() => {
              const parsed = Number(normalizedMaxUsesInput)
              if (!Number.isFinite(parsed) || parsed < 1) {
                throw new Error(tx("总可用次数必须是大于 0 的整数，或留空表示不限。", "Total uses must be an integer greater than 0, or blank for unlimited."))
              }
              return Math.floor(parsed)
            })()

      const usedCountInput = window.prompt(
        tx("请输入已使用次数。", "Enter used count."),
        String(getCouponUsedCount(row)),
      )
      if (usedCountInput === null) return

      const normalizedUsedCountInput = usedCountInput.trim()
      const parsedUsedCount = Number(normalizedUsedCountInput || "0")
      if (!Number.isFinite(parsedUsedCount) || parsedUsedCount < 0) {
        throw new Error(tx("已使用次数必须是大于或等于 0 的整数。", "Used count must be an integer greater than or equal to 0."))
      }

      const nextUsedCount = Math.floor(parsedUsedCount)
      if (nextMaxUses !== null && nextUsedCount > nextMaxUses) {
        throw new Error(tx("已使用次数不能大于总可用次数。", "Used count cannot exceed total uses."))
      }

      await runAction(tx("折扣券使用次数已更新", "Coupon usage updated"), async () => {
        await fetchJson("/api/market-admin/admin/marketing/coupons", {
          method: "POST",
          body: JSON.stringify({
            id: row.id,
            code: row.code,
            userId: row.userId,
            assetType: row.assetType,
            audienceType: row.audienceType,
            partnerProduct: row.partnerProduct,
            productCost: row.productCost ?? 0,
            sourceInvitationCode: row.sourceInvitationCode,
            orderCommissionRate: row.orderCommissionRate,
            purchasePrice: row.purchasePrice,
            discountValue: row.discountValue,
            discountType: row.discountType,
            minPurchase: row.minPurchase,
            maxUses: nextMaxUses,
            usedCount: nextUsedCount,
            usedByUserId: nextUsedCount <= 0 ? null : row.usedByUserId,
            usedOrderNo: nextUsedCount <= 0 ? null : row.usedOrderNo,
            usedAt: nextUsedCount <= 0 ? null : row.usedAt,
            expiresAt: row.expiresAt,
          }),
        })
        await loadBootstrap()
      })
    } catch (error) {
      setError(error instanceof Error ? error.message : tx("调整使用次数失败", "Failed to update usage"))
    }
  }

  const loadBootstrap = async () => {
    const response = await fetchJson<{ success: true; bootstrap: BootstrapData }>("/api/market-admin/admin/marketing/bootstrap")
    setBootstrap(response.bootstrap)
    setAccounts(response.bootstrap.accounts)
    setLedgers(response.bootstrap.ledgers)
    setCampaigns(response.bootstrap.campaigns)
    setTaskTemplates(response.bootstrap.taskTemplates)
    setWithdrawals(response.bootstrap.withdrawals)
    setRiskEvents(response.bootstrap.riskEvents)
    setRiskLists(response.bootstrap.riskLists)
  }

  const buildFissionQuery = (pageOverride?: number) => {
    const params = new URLSearchParams({ search: fissionSearch, status: fissionStatus, datePreset: fissionDatePreset, page: String(pageOverride ?? fissionPage), limit: "8" })
    if (fissionDate) params.set("date", fissionDate)
    return params
  }

  const loadFission = async (pageOverride?: number) => {
    const response = await fetchJson<{ success: true; fission: FissionData }>(`/api/market-admin/admin/marketing/fission?${buildFissionQuery(pageOverride).toString()}`)
    setFission(response.fission)
  }

  const loadAccounts = async () => {
    const params = new URLSearchParams({ page: "1", limit: "10" })
    if (assetQuery.trim()) params.set("query", assetQuery.trim())
    const response = await fetchJson<{ success: true; accounts: MarketingListResult<MarketingAccountBundle> }>(`/api/market-admin/admin/marketing/accounts?${params.toString()}`)
    setAccounts(response.accounts)
  }

  const loadLedgers = async () => {
    const params = new URLSearchParams({ page: "1", limit: "10" })
    if (assetQuery.trim()) params.set("query", assetQuery.trim())
    if (ledgerAssetType !== "all") params.set("assetType", ledgerAssetType)
    const response = await fetchJson<{ success: true; ledgers: MarketingListResult<MarketingAssetLedger> }>(`/api/market-admin/admin/marketing/ledgers?${params.toString()}`)
    setLedgers(response.ledgers)
  }

  const loadCampaigns = async () => {
    const response = await fetchJson<{ success: true; campaigns: MarketingCampaign[] }>("/api/market-admin/admin/marketing/campaigns")
    setCampaigns(response.campaigns)
  }

  const loadTaskTemplates = async () => {
    const response = await fetchJson<{ success: true; taskTemplates: MarketingTaskTemplate[] }>("/api/market-admin/admin/marketing/task-templates")
    setTaskTemplates(response.taskTemplates)
  }

  const loadWithdrawals = async (nextStatus = withdrawalStatus) => {
    const query = nextStatus === "all" ? "" : `?status=${nextStatus}&page=1&limit=10`
    const response = await fetchJson<{ success: true; withdrawals: MarketingListResult<MarketingWithdrawal> }>(`/api/market-admin/admin/marketing/withdrawals${query}`)
    setWithdrawals(response.withdrawals)
  }

  const loadRiskCenter = async (nextStatus = riskStatus) => {
    const eventQuery = nextStatus === "all" ? "?page=1&limit=10" : `?status=${nextStatus}&page=1&limit=10`
    const [eventsResponse, listsResponse] = await Promise.all([
      fetchJson<{ success: true; riskEvents: MarketingListResult<MarketingRiskEvent> }>(`/api/market-admin/admin/marketing/risk-events${eventQuery}`),
      fetchJson<{ success: true; riskLists: MarketingListResult<MarketingRiskListItem> }>("/api/market-admin/admin/marketing/risk-lists?page=1&limit=10"),
    ])
    setRiskEvents(eventsResponse.riskEvents)
    setRiskLists(listsResponse.riskLists)
  }

  const runAction = async (label: string, action: () => Promise<void>) => {
    try {
      setBusyLabel(label)
      setError("")
      await action()
      setNotice(label)
      window.setTimeout(() => setNotice(""), 2600)
    } catch (err: any) {
      setError(err?.message || t("marketActionFailed"))
    } finally {
      setBusyLabel("")
    }
  }

  const validateBoundMarketingUser = async (userId: string) => {
    const normalized = userId.trim()
    if (!normalized) return null

    const user = await lookupMarketingUser(normalized)
    if (!user) {
      throw new Error(
        tx(
          "绑定用户不存在，请填写真实用户 ID（不是邮箱或昵称）；如果不需要绑定，请切换到“公开发放”或清空默认绑定用户 ID。",
          "Bound user not found. Use a real users.id instead of an email or display name, or switch to public distribution and clear the default bound user ID.",
        ),
      )
    }

    return user
  }

  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true)
        await Promise.all([loadBootstrap(), loadFission(1)])
      } catch (err: any) {
        setError(err?.message || t("marketLoadFailed"))
      } finally {
        setLoading(false)
      }
    }
    void initialize()
  }, [])

  useEffect(() => {
    if (!bootstrap?.settings?.length) return

    const partnerTier = getSettingValue(bootstrap.settings, "invite_partner_tier", "partner_package")
    const partnerProduct = getSettingValue(bootstrap.settings, "invite_partner_product", "orbitchat")
    const partnerProductCost = getSettingValue(bootstrap.settings, "invite_partner_product_cost", "0")
    const partnerBenefitMonths = getSettingValue(bootstrap.settings, "invite_partner_benefit_months", "36")
    const fanDiscountRate = getSettingValue(bootstrap.settings, "invite_partner_fan_discount_rate", "20")
    const orderCommissionRate = getSettingValue(bootstrap.settings, "invite_partner_order_commission_rate", "15")
    const purchasePrice = getSettingValue(bootstrap.settings, "invite_coupon_purchase_price", "9.9")
    const couponProductCost = getSettingValue(bootstrap.settings, "invite_coupon_product_cost", partnerProductCost)
    const discountValue = getSettingValue(bootstrap.settings, "invite_coupon_discount_value", "15")
    const discountType = getSettingValue(bootstrap.settings, "invite_coupon_discount_type", "percentage")
    const minPurchase = getSettingValue(bootstrap.settings, "invite_coupon_min_purchase", "99")
    const validDays = getSettingValue(bootstrap.settings, "invite_coupon_valid_days", "30")
    const defaultCouponUserId = getSettingValue(bootstrap.settings, "invite_coupon_default_user_id", "")
    const nextGrowthConfig = growthSettingFields.reduce<Record<string, string>>((result, field) => {
      result[field.key] = getSettingValue(bootstrap.settings, field.key, field.defaultValue)
      return result
    }, {})

    setPartnerConfigForm({ partnerTier, partnerProduct, productCost: partnerProductCost, partnerBenefitMonths, fanDiscountRate, orderCommissionRate })
    setInviteCodeForm((current) => ({
      ...current,
      partnerTier,
      partnerProduct,
      productCost: partnerProductCost,
      partnerBenefitMonths,
      fanDiscountRate,
      orderCommissionRate,
    }))
    setCouponConfigForm({ purchasePrice, productCost: couponProductCost, discountValue, discountType, minPurchase, validDays, userId: defaultCouponUserId })
    setCouponForm((current) => ({
      ...current,
      userId: defaultCouponUserId,
      partnerProduct,
      sourceInvitationCode: current.sourceInvitationCode,
      productCost: couponProductCost,
      orderCommissionRate,
      purchasePrice,
      discountValue,
      discountType,
      minPurchase,
    }))
    setCouponBindingMode(defaultCouponUserId ? "user" : "public")
    setGrowthConfigForm(nextGrowthConfig)
  }, [bootstrap?.settings])

  const updateGrowthConfigValue = (key: string, value: string) => {
    setGrowthConfigForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const syncTaskTemplate = async (
    slug: string,
    updater: (current: MarketingTaskTemplate) => MarketingTaskTemplate,
  ) => {
    const current = allTaskTemplates.find((item) => item.slug === slug)
    if (!current) return
    const next = updater(current)
    await fetchJson("/api/market-admin/admin/marketing/task-templates", {
      method: "POST",
      body: JSON.stringify(next),
    })
  }

  const syncCampaign = async (
    slug: string,
    updater: (current: MarketingCampaign) => MarketingCampaign,
  ) => {
    const current = allCampaigns.find((item) => item.slug === slug)
    if (!current) return
    const next = updater(current)
    await fetchJson("/api/market-admin/admin/marketing/campaigns", {
      method: "POST",
      body: JSON.stringify(next),
    })
  }

  const saveGrowthSystem = async (systemKey: GrowthSystemKey) => {
    const preset = growthSystemPresets.find((item) => item.key === systemKey)
    if (!preset) return

    await runAction(
      tx(`${tx(preset.title.zh, preset.title.en)}配置已保存`, `${preset.title.en} settings saved`),
      async () => {
        const settingRequests = preset.fields.map((field) =>
          fetchJson("/api/market-admin/admin/marketing/settings", {
            method: "POST",
            body: JSON.stringify({
              key: field.key,
              value:
                field.valueType === "number"
                  ? parseConfigNumber(growthConfigForm[field.key], parseConfigNumber(field.defaultValue, 0))
                  : String(growthConfigForm[field.key] || field.defaultValue).trim(),
              description: tx(field.description.zh, field.description.en),
            }),
          }),
        )

        await Promise.all(settingRequests)

        if (systemKey === "cash") {
          const signupReward = parseConfigNumber(growthConfigForm.invite_signup_cash_reward, 5)
          const firstOrderReward = parseConfigNumber(growthConfigForm.invite_first_order_cash_reward, 10)
          const withdrawThreshold = parseConfigNumber(growthConfigForm.withdraw_min_amount, 20)
          await Promise.all([
            syncTaskTemplate("referral-register-cash", (current) => ({
              ...current,
              rewardAmount: signupReward,
            })),
            syncTaskTemplate("referral-first-order-cash", (current) => ({
              ...current,
              rewardAmount: firstOrderReward,
            })),
            syncTaskTemplate("ad-watch-cash", (current) => ({
              ...current,
              rewardAmount: parseConfigNumber(growthConfigForm.ad_watch_cash_reward, 1),
              dailyLimit: parseConfigNumber(growthConfigForm.ad_watch_daily_limit, 5),
              meta: {
                ...current.meta,
                minimumWatchSeconds: parseConfigNumber(growthConfigForm.ad_watch_min_seconds, 15),
              },
            })),
            syncCampaign("invite-cash-sprint", (current) => ({
              ...current,
              rules: {
                ...current.rules,
                withdrawalMinAmount: withdrawThreshold,
              },
            })),
            syncCampaign("cash-retention-engine", (current) => ({
              ...current,
              rules: {
                ...current.rules,
                monthlyLoginReward: parseConfigNumber(growthConfigForm.cash_monthly_login_reward, 1),
                inactivityPreviewDays: parseConfigNumber(growthConfigForm.cash_inactivity_preview_days, 30),
                inactivityDeductionDailyRate: parseConfigNumber(growthConfigForm.cash_inactivity_deduction_daily_rate, 1),
                inactivityDeductionMaxRate: parseConfigNumber(growthConfigForm.cash_inactivity_deduction_max_rate, 50),
              },
            })),
          ])
        }

        if (systemKey === "points") {
          await Promise.all([
            syncTaskTemplate("referral-seven-day-login-points", (current) => ({
              ...current,
              rewardAmount: parseConfigNumber(growthConfigForm.invite_seven_day_login_points_reward, 50),
            })),
            syncTaskTemplate("order-paid-points", (current) => ({
              ...current,
              rewardAmount: parseConfigNumber(growthConfigForm.points_order_paid_reward, 100),
            })),
            syncTaskTemplate("ai-quota-exhausted-relief", (current) => ({
              ...current,
              rewardAmount: parseConfigNumber(growthConfigForm.ai_quota_relief_points_reward, 15),
            })),
            syncCampaign("points-loyalty-loop", (current) => ({
              ...current,
              rules: {
                ...current.rules,
                redeemOffsetRate: parseConfigNumber(growthConfigForm.points_redeem_offset_rate, 100),
                expiryDays: parseConfigNumber(growthConfigForm.points_expiry_days, 180),
                decayGraceDays: parseConfigNumber(growthConfigForm.invite_points_decay_grace_days, 30),
                decayDailyRate: parseConfigNumber(growthConfigForm.invite_points_decay_daily_rate, 1),
                decayMaxRate: parseConfigNumber(growthConfigForm.invite_points_decay_max_rate, 50),
              },
            })),
          ])
        }

        if (systemKey === "ads") {
          const dailyLimit = parseConfigNumber(growthConfigForm.ad_watch_daily_limit, 5)
          const minimumWatchSeconds = parseConfigNumber(growthConfigForm.ad_watch_min_seconds, 15)
          await Promise.all([
            syncTaskTemplate("ad-watch-cash", (current) => ({
              ...current,
              rewardAmount: parseConfigNumber(growthConfigForm.ad_watch_cash_reward, 1),
              dailyLimit,
              meta: {
                ...current.meta,
                minimumWatchSeconds,
              },
            })),
            syncTaskTemplate("ad-watch-points", (current) => ({
              ...current,
              rewardAmount: parseConfigNumber(growthConfigForm.ad_watch_points_reward, 30),
              dailyLimit,
              meta: {
                ...current.meta,
                minimumWatchSeconds,
              },
            })),
            syncTaskTemplate("ad-watch-ai-quota", (current) => ({
              ...current,
              rewardAmount: parseConfigNumber(growthConfigForm.ad_watch_ai_quota_reward, 20),
              dailyLimit,
              meta: {
                ...current.meta,
                minimumWatchSeconds,
              },
            })),
          ])
        }

        if (systemKey === "vip") {
          const upsellWindowDays = parseConfigNumber(growthConfigForm.vip_upsell_window_days, 7)
          await Promise.all([
            syncTaskTemplate("login-streak-vip", (current) => ({
              ...current,
              rewardAmount: parseConfigNumber(growthConfigForm.login_streak_vip_days, 3),
            })),
            syncTaskTemplate("subscription-upgrade-vip", (current) => ({
              ...current,
              rewardAmount: parseConfigNumber(growthConfigForm.vip_upgrade_bonus_days, 30),
            })),
            syncTaskTemplate("ai-quota-exhausted-relief", (current) => ({
              ...current,
              rewardAmount: parseConfigNumber(growthConfigForm.ai_quota_relief_points_reward, 15),
            })),
            syncTaskTemplate("ai-quota-exhausted-vip-trial", (current) => ({
              ...current,
              rewardAmount: parseConfigNumber(growthConfigForm.ai_quota_relief_vip_days, 1),
            })),
            syncCampaign("vip-upgrade-flash-sale", (current) => ({
              ...current,
              rules: {
                ...current.rules,
                upsellWindowDays,
                discountRate: parseConfigNumber(growthConfigForm.vip_flash_sale_discount_rate, 20),
              },
            })),
          ])
        }

        await Promise.all([loadBootstrap(), loadCampaigns(), loadTaskTemplates()])
      },
    )
  }

  const renderOverview = () => {
    if (!bootstrap) return <Section title={t("marketLoadFailed")}><div className="text-sm text-gray-500">{t("marketLoadFailed")}</div></Section>
    const summary = bootstrap.dashboardSummary
    const trendMax = Math.max(...summary.trends.map((item) => item.invites || 0), 1)
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Stat title={tx("今日新增用户", "New users today")} value={formatNumber(summary.today.newUsers)} />
          <Stat title={tx("今日发放现金", "Cash issued today")} value={`￥${formatNumber(summary.today.cashIssued)}`} />
          <Stat title={tx("今日发放积分", "Points issued today")} value={formatNumber(summary.today.pointsIssued)} />
          <Stat title={tx("提现待审核", "Pending withdrawals")} value={`${summary.today.pendingWithdrawalCount} / ￥${formatNumber(summary.today.pendingWithdrawalAmount)}`} />
        </div>
        <Section
          title={tx("四套增长制度总览", "Growth systems overview")}
          description={tx("把裂变奖励拆成现金、积分、广告激励和会员升级四套制度，方便按业务目标组合运营。", "Split growth into four operating systems so the team can tune acquisition, retention, ad rewards, and VIP conversion separately.")}
        >
          <div className="grid gap-4 xl:grid-cols-2">
            {growthSystems.map((system) => {
              const Icon = system.icon
              return (
                <div key={system.key} className={`rounded-3xl border border-gray-200 bg-gradient-to-br ${system.accentClass} p-5`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-white/90 p-3 text-gray-900 shadow-sm">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-gray-900">{tx(system.title.zh, system.title.en)}</div>
                        <div className="mt-1 max-w-xl text-sm text-gray-600">{tx(system.description.zh, system.description.en)}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <div className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-medium text-gray-700">
                        {tx(system.highlight.zh, system.highlight.en)}
                      </div>
                      <button
                        type="button"
                        className="rounded-xl border border-gray-200 bg-white/90 px-3 py-2 text-xs font-medium text-gray-700"
                        onClick={() => setTab("activity")}
                      >
                        {tx("更多设置", "More settings")}
                      </button>
                      <button
                        type="button"
                        className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-medium text-white"
                        onClick={() => void saveGrowthSystem(system.key)}
                      >
                        {tx("保存数字", "Save values")}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {system.metrics.map((metric) => (
                      <div key={metric.label} className="rounded-2xl border border-white/80 bg-white/85 px-4 py-3 shadow-sm">
                        <div className="text-xs text-gray-500">{metric.label}</div>
                        <div className="mt-1 text-lg font-semibold text-gray-900">{metric.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
                    <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{tx("关键规则", "Key rules")}</div>
                      <div className="mt-3 space-y-3">
                        {system.rules.slice(0, 4).map((rule) => (
                          <label key={rule.key} className="grid gap-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900">{tx(rule.label.zh, rule.label.en)}</div>
                                <div className="text-xs text-gray-500">{tx(rule.description.zh, rule.description.en)}</div>
                              </div>
                              <input
                                className="w-28 shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900"
                                type={rule.valueType === "number" ? "number" : "text"}
                                value={growthConfigForm[rule.key] ?? rule.defaultValue}
                                onChange={(event) => updateGrowthConfigValue(rule.key, event.target.value)}
                              />
                            </div>
                          </label>
                        ))}
                      </div>
                      <div className="mt-3 text-xs text-gray-400">
                        {tx("这里可直接改数字并保存；更多规则可到“活动与任务”继续配置。", "You can edit and save values here. Use Activity for the full rule set.")}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{tx("运营玩法", "Playbooks")}</div>
                      <div className="mt-3 space-y-3">
                        {system.playbooks.map((playbook) => (
                          <div key={playbook.title.zh} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">{tx(playbook.title.zh, playbook.title.en)}</div>
                            <div className="mt-1 text-xs leading-6 text-gray-500">{tx(playbook.description.zh, playbook.description.en)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {system.campaigns.map((campaign) => (
                      <span key={campaign.slug} className={`inline-flex rounded-full border px-3 py-1 text-xs ${statusClass(campaign.status)}`}>
                        {campaign.name}
                      </span>
                    ))}
                    {system.templates.map((template) => (
                      <span key={template.slug} className="inline-flex rounded-full border border-gray-200 bg-white/85 px-3 py-1 text-xs text-gray-700">
                        {template.name}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
        <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
          <Section title={tx("近 7 日拉新趋势", "7-day acquisition trend")} description={tx("按日查看邀请与激活变化", "Daily invite and activation change")}>
            {summary.trends.length === 0 ? (
              <div className="text-sm text-gray-400">{tx("暂无趋势数据", "No trend data")}</div>
            ) : (
              <div>
                <div className="flex h-52 items-end gap-3">
                  {summary.trends.map((item) => (
                    <div key={item.date} className="flex flex-1 flex-col items-center gap-2">
                      <div className="flex h-40 w-full items-end gap-1">
                        <div className="w-1/2 rounded-t bg-blue-500" style={{ height: `${Math.max((item.invites / trendMax) * 100, 6)}%` }} />
                        <div className="w-1/2 rounded-t bg-emerald-400" style={{ height: `${Math.max((item.activated / trendMax) * 100, 4)}%` }} />
                      </div>
                      <div className="text-[11px] text-gray-400">{item.date.slice(5)}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-4 text-xs text-gray-500">
                  <span>{tx("蓝色=邀请", "Blue=invites")}</span>
                  <span>{tx("绿色=激活", "Green=activated")}</span>
                </div>
              </div>
            )}
          </Section>
          <Section title={tx("裂变核心转化漏斗", "Core fission funnel")} description={tx("从点击到激活的核心漏斗", "Main referral funnel from click to activation")}>
            <div className="space-y-5">
              {[
                { label: tx("分享点击", "Referral clicks"), value: summary.funnel.totalClicks, ratio: 100, color: "bg-blue-500" },
                { label: tx("邀请注册", "Invites"), value: summary.funnel.totalInvites, ratio: summary.funnel.totalClicks > 0 ? (summary.funnel.totalInvites / summary.funnel.totalClicks) * 100 : 0, color: "bg-violet-500" },
                { label: tx("激活达标", "Activated"), value: summary.funnel.totalActivated, ratio: summary.funnel.totalInvites > 0 ? (summary.funnel.totalActivated / summary.funnel.totalInvites) * 100 : 0, color: "bg-emerald-500" },
                { label: tx("奖励积分", "Reward credits"), value: summary.funnel.totalRewardCredits, ratio: Math.min(summary.funnel.activationRate, 100), color: "bg-amber-500" },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="text-gray-500">{item.label}</span>
                    <span className="font-semibold text-gray-900">{formatNumber(item.value)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100">
                    <div className={`h-2 rounded-full ${item.color}`} style={{ width: `${Math.max(item.ratio, 6)}%` }} />
                  </div>
                </div>
              ))}
              <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                <div>{tx("注册转化率", "Invite conversion")}: <span className="font-semibold text-gray-900">{summary.funnel.conversionRate}%</span></div>
                <div className="mt-1">{tx("激活转化率", "Activation rate")}: <span className="font-semibold text-gray-900">{summary.funnel.activationRate}%</span></div>
              </div>
            </div>
          </Section>
        </div>
        <Section title={tx("产品事件分布", "Product distribution")} description={tx("按产品线查看事件与用户量", "Events and users by product line")}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-3 py-2">{t("marketColProduct")}</th>
                  <th className="px-3 py-2">{t("marketColEvents")}</th>
                  <th className="px-3 py-2">{t("marketColUsers")}</th>
                </tr>
              </thead>
              <tbody>
                {bootstrap.overview.productDistribution.map((item) => (
                  <tr key={item.product} className="border-b border-gray-50">
                    <td className="px-3 py-3 font-medium text-gray-900">{item.product}</td>
                    <td className="px-3 py-3 text-gray-600">{formatNumber(item.events)}</td>
                    <td className="px-3 py-3 text-gray-600">{formatNumber(item.users)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    )
  }

  const renderAssets = () => (
    <div className="space-y-6">
      <Section title={t("marketAssetAdjustTitle")} description={tx("统一钱包四资产的人工调账入口", "Manual adjustments for the unified wallet")}>
        <div className="grid gap-3 lg:grid-cols-[1.1fr_170px_170px_1fr_auto]">
          <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={tx("输入用户 ID", "Enter user ID")} value={adjustForm.userId} onChange={(event) => setAdjustForm((current) => ({ ...current, userId: event.target.value }))} />
          <select className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" value={adjustForm.assetType} onChange={(event) => setAdjustForm((current) => ({ ...current, assetType: event.target.value }))}>
            {(bootstrap?.constants.assetTypes || ["cash", "points", "ai_quota", "vip_duration"]).map((assetType) => <option key={assetType} value={assetType}>{assetType}</option>)}
          </select>
          <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={tx("数量", "Amount")} value={adjustForm.amount} onChange={(event) => setAdjustForm((current) => ({ ...current, amount: event.target.value }))} />
          <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={tx("备注", "Remark")} value={adjustForm.remark} onChange={(event) => setAdjustForm((current) => ({ ...current, remark: event.target.value }))} />
          <button
            className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!adjustForm.userId.trim() || !Number(adjustForm.amount)}
            onClick={() =>
              void runAction(tx("资产调账已完成", "Asset adjustment saved"), async () => {
                await fetchJson("/api/market-admin/admin/marketing/accounts/adjust", { method: "POST", body: JSON.stringify({ userId: adjustForm.userId, assetType: adjustForm.assetType, amount: Number(adjustForm.amount || 0), remark: adjustForm.remark }) })
                await Promise.all([loadBootstrap(), loadAccounts(), loadLedgers()])
              })
            }
          >
            {t("marketAssetAdjustAction")}
          </button>
        </div>
      </Section>
      <Section
        title={t("marketAssetAccountsTitle")}
        description={tx("查看用户资产、冻结状态与预警", "User balances, frozen assets and warnings")}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input className="w-56 rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm" placeholder={tx("搜索用户", "Search users")} value={assetQuery} onChange={(event) => setAssetQuery(event.target.value)} />
            </div>
            <button className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600" onClick={() => { void loadAccounts(); void loadLedgers() }}>{tx("搜索", "Search")}</button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-3 py-2">{t("marketColUser")}</th>
                <th className="px-3 py-2">{t("marketAssetCash")}</th>
                <th className="px-3 py-2">{t("marketAssetPoints")}</th>
                <th className="px-3 py-2">{t("marketAssetAiQuota")}</th>
                <th className="px-3 py-2">{t("marketAssetVipDuration")}</th>
                <th className="px-3 py-2">{t("marketColWarnings")}</th>
              </tr>
            </thead>
            <tbody>
              {assetRows.map((row) => (
                <tr key={row.user.userId} className="border-b border-gray-50 align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium text-gray-900">{row.user.name || row.user.email || row.user.userId}</div>
                    <div className="text-xs text-gray-400">{row.user.userId}</div>
                  </td>
                  <td className="px-3 py-3 text-gray-600">{formatNumber(row.accounts.cash?.availableBalance || 0)} / {formatNumber(row.accounts.cash?.frozenBalance || 0)}</td>
                  <td className="px-3 py-3 text-gray-600">{formatNumber(row.accounts.points?.availableBalance || 0)} / {formatNumber(row.accounts.points?.frozenBalance || 0)}</td>
                  <td className="px-3 py-3 text-gray-600">{formatNumber(row.accounts.ai_quota?.availableBalance || 0)} / {formatNumber(row.accounts.ai_quota?.frozenBalance || 0)}</td>
                  <td className="px-3 py-3 text-gray-600">{formatNumber(row.accounts.vip_duration?.availableBalance || 0)} / {formatNumber(row.accounts.vip_duration?.frozenBalance || 0)}</td>
                  <td className="px-3 py-3">
                    {row.previewWarnings.length ? row.previewWarnings.map((warning) => (
                      <div key={warning} className="mb-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">{warning}</div>
                    )) : <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{tx("正常", "Healthy")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section
        title={t("marketAssetLedgersTitle")}
        description={tx("所有奖励、冻结、扣减都统一记账", "Unified ledger for rewards, freezes and debits")}
        actions={
          <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={ledgerAssetType} onChange={(event) => { setLedgerAssetType(event.target.value); window.setTimeout(() => void loadLedgers(), 0) }}>
            <option value="all">{tx("全部资产", "All assets")}</option>
            {(bootstrap?.constants.assetTypes || ["cash", "points", "ai_quota", "vip_duration"]).map((assetType) => <option key={assetType} value={assetType}>{assetType}</option>)}
          </select>
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-3 py-2">{t("marketColUserId")}</th>
                <th className="px-3 py-2">{t("marketColAsset")}</th>
                <th className="px-3 py-2">{t("marketColAmount")}</th>
                <th className="px-3 py-2">{t("marketColSource")}</th>
                <th className="px-3 py-2">{t("marketColRemark")}</th>
                <th className="px-3 py-2">{t("marketColTime")}</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((row) => (
                <tr key={row.id} className="border-b border-gray-50">
                  <td className="px-3 py-3 text-gray-600">{row.userId}</td>
                  <td className="px-3 py-3 text-gray-600">{row.assetType}</td>
                  <td className="px-3 py-3 font-medium text-gray-900">{row.direction === "credit" ? "+" : "-"}{formatNumber(row.amount)}</td>
                  <td className="px-3 py-3 text-gray-600">{row.sourceType}</td>
                  <td className="px-3 py-3 text-gray-600">{row.remark || "-"}</td>
                  <td className="px-3 py-3 text-gray-500">{formatDateTime(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
  const renderFission = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat title={t("marketReferralClicks")} value={formatNumber(fission?.overview.totalClicks || 0)} />
        <Stat title={t("marketReferralInvites")} value={formatNumber(fission?.overview.totalInvites || 0)} />
        <Stat title={t("marketReferralActivated")} value={formatNumber(fission?.overview.totalActivated || 0)} />
        <Stat title={t("marketReferralCredits")} value={formatNumber(fission?.overview.totalRewardCredits || 0)} />
      </div>
      <Section
        title={tx("邀请码机制与折扣券配置", "Invite code and discount coupon config")}
        description={tx("邀请码定义合作权益包；折扣券只承接售卖与使用条件，避免重复录入。", "Invite codes define the partnership package, while coupons only handle selling and redemption rules to avoid duplicate setup.")}
      >
        <div className="grid gap-6">
          <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-cyan-50 p-4">
            <div className="text-sm font-semibold text-gray-900">{tx("合作权益说明", "How the partnership package works")}</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/80 bg-white/90 px-4 py-3 text-sm text-gray-600">
                <div className="font-medium text-gray-900">{tx("1. 合作权益包", "1. Partnership package")}</div>
                <div className="mt-1">{tx("定义邀请码、赠送会员时长、关联优惠比例和订单分成。", "Define the invite code, membership grant, linked discount, and commission.")}</div>
              </div>
              <div className="rounded-xl border border-white/80 bg-white/90 px-4 py-3 text-sm text-gray-600">
                <div className="font-medium text-gray-900">{tx("2. 关联优惠券", "2. Linked coupon")}</div>
                <div className="mt-1">{tx("面向合作方带来的目标人群，可单独设置购买价、折扣值和门槛。", "Target the audience brought by the partner with its own price, discount, and minimum spend.")}</div>
              </div>
              <div className="rounded-xl border border-white/80 bg-white/90 px-4 py-3 text-sm text-gray-600">
                <div className="font-medium text-gray-900">{tx("3. 统一分成", "3. Unified commission")}</div>
                <div className="mt-1">{tx("合作方权益、受众优惠和订单分成走同一套配置，后续更容易扩展。", "Partner benefits, audience discounts, and commissions live in one model, so the system stays extensible.")}</div>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Users className="h-4 w-4 text-blue-600" />
              {tx("新增邀请码", "Create invite code")}
            </div>
            <div className="mt-2 text-xs leading-6 text-gray-500">
              {tx("支持手动录入，也可以一键生成邀请码，并在右侧实时查看归属活动、使用上限和失效时间。", "You can enter a code manually or generate one instantly, then preview campaign, usage limits, and expiry on the right.")}
            </div>
            <div className="mt-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-6 text-sky-800">
              {tx("合作方与关联对象现在使用两套分开的邀请码。合作方码承接合作权益，关联对象码承接受众优惠，两者不再混用。", "Partner and linked audience now use separate codes. The partner code carries partner benefits, while the linked audience code carries the audience offer.")}
            </div>
            <div className="mt-4 grid items-start gap-4 min-[1400px]:grid-cols-[minmax(0,1.45fr)_320px]">
              <div className="grid gap-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="mb-4">
                    <div className="text-sm font-semibold text-gray-900">{tx("合作方表单", "Partner form")}</div>
                    <div className="mt-1 text-xs text-gray-500">{tx("填写合作方本人使用的邀请码与权益。", "Set the invite code and benefits used by the partner.")}</div>
                  </div>
                <label className="grid gap-1 text-xs text-gray-500">
                  <span>{tx("合作方邀请码", "Partner invite code")}</span>
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_132px_56px]">
                    <input
                      className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium tracking-[0.08em] text-gray-900"
                      placeholder={tx("例如 PARTNER-AB12CD", "For example PARTNER-AB12CD")}
                      value={inviteCodeForm.code}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                    />
                    <button
                      type="button"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700"
                      onClick={() => setInviteCodeForm((current) => ({ ...current, code: createInviteCode(`${current.campaignSlug || "partner"}-pt`) }))}
                    >
                      {tx("自动生成", "Generate")}
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-600"
                      onClick={() => void copyToClipboard(inviteCodePreview, tx("邀请码已复制", "Invite code copied"))}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </label>
                <label className="grid gap-1 text-xs text-gray-500">
                  <span>{tx("邀请码归属 ID", "Invite owner ID")}</span>
                  <input
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                    placeholder={tx("可留空，作为通用邀请码", "Optional, leave blank for a shared invite code")}
                    value={inviteCodeForm.userId}
                    onChange={(event) => setInviteCodeForm((current) => ({ ...current, userId: event.target.value }))}
                  />
                  <span className="text-[11px] text-gray-400">{tx("和折扣券一样可绑定到指定用户 ID；留空则为公开发放。", "Like coupons, invite codes can be bound to a specific user ID, or left blank for public distribution.")}</span>
                </label>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("合作对象类型", "Partner type")}</span>
                    <select
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      value={normalizePartnerTier(inviteCodeForm.partnerTier)}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, partnerTier: event.target.value as MarketingInvitationCode["partnerTier"] }))}
                    >
                      <option value="partner_package">{tx("合作权益包", "Partnership package")}</option>
                      <option value="general">{tx("通用邀请码", "General invite code")}</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("使用商品", "Product")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      value={inviteCodeForm.partnerProduct}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, partnerProduct: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("商品成本", "Product cost")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      value={inviteCodeForm.productCost}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, productCost: event.target.value }))}
                    />
                    <span className="text-[11px] text-gray-400">{tx("分成会按实付金额减去这里的成本后的净利润计算。", "Commission uses paid amount minus this cost as net profit.")}</span>
                  </label>
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("合作方赠送会员（月）", "Partner membership months")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      value={inviteCodeForm.partnerBenefitMonths}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, partnerBenefitMonths: event.target.value }))}
                    />
                    <span className="text-[11px] text-gray-400">{tx(`约 ${partnerBenefitYears} 年会员`, `About ${partnerBenefitYears} years of membership`)}</span>
                  </label>
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("推广订单分成（%）", "Order commission (%)")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      value={inviteCodeForm.orderCommissionRate}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, orderCommissionRate: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="mt-4 rounded-2xl border border-gray-100 bg-white/80 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{tx("合作方分享", "Partner share")}</div>
                  <div className="mt-2 break-all text-sm text-gray-600">{previewInviteShareTarget.shareUrl}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                      onClick={() => void copyToClipboard(previewInviteShareTarget.shareUrl, tx("邀请链接已复制", "Invite link copied"))}
                    >
                      <span className="flex items-center gap-2"><Link2 className="h-4 w-4" />{tx("复制链接", "Copy link")}</span>
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                      onClick={() => setInviteQrTarget(previewInviteShareTarget)}
                    >
                      <span className="flex items-center gap-2"><QrCode className="h-4 w-4" />{tx("二维码", "QR code")}</span>
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                      onClick={() => void shareInviteTarget(previewInviteShareTarget)}
                    >
                      <span className="flex items-center gap-2"><Share2 className="h-4 w-4" />{tx("分享", "Share")}</span>
                    </button>
                  </div>
                </div>
                </div>

                <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
                  <div className="mb-4">
                    <div className="text-sm font-semibold text-sky-900">{tx("关联对象表单", "Linked audience form")}</div>
                    <div className="mt-1 text-xs text-sky-700">{tx("填写关联对象使用的邀请码与优惠。", "Set the invite code and discount used by the linked audience.")}</div>
                  </div>

                <label className="grid gap-1 text-xs text-gray-500">
                  <span>{tx("关联对象邀请码", "Linked audience invite code")}</span>
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_132px_56px]">
                    <input
                      className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium tracking-[0.08em] text-gray-900"
                      placeholder={tx("例如 AUDIENCE-AB12CD", "For example AUDIENCE-AB12CD")}
                      value={inviteCodeForm.linkedAudienceCode}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, linkedAudienceCode: event.target.value.toUpperCase() }))}
                    />
                    <button
                      type="button"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700"
                      onClick={() => setInviteCodeForm((current) => ({ ...current, linkedAudienceCode: createInviteCode(`${current.campaignSlug || "audience"}-aud`) }))}
                    >
                      {tx("自动生成", "Generate")}
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-600"
                      onClick={() => void copyToClipboard(linkedAudienceCodePreview, tx("邀请码已复制", "Invite code copied"))}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </label>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("关联到合作方邀请码", "Linked partner invite code")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-slate-50 px-3 py-2.5 text-sm text-gray-700"
                      value={inviteCodeForm.code || inviteCodePreview}
                      readOnly
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("使用商品", "Product in use")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-slate-50 px-3 py-2.5 text-sm text-gray-700"
                      value={linkedAudienceProductPreview}
                      readOnly
                    />
                    <span className="text-[11px] text-gray-400">{tx("继承合作权益包里的适用产品", "Inherited from the partnership package product scope")}</span>
                  </label>
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("关联对象优惠比例（%）", "Linked audience discount (%)")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      value={inviteCodeForm.fanDiscountRate}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, fanDiscountRate: event.target.value }))}
                    />
                    <span className="text-[11px] text-gray-400">{tx(`约 ${linkedAudienceFold} 折`, `About ${linkedAudienceFold}x pricing`)}</span>
                  </label>
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("最低消费", "Minimum purchase")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      value={couponConfigForm.minPurchase}
                      onChange={(event) => setCouponConfigForm((current) => ({ ...current, minPurchase: event.target.value }))}
                    />
                    <span className="text-[11px] text-gray-400">{tx("本次创建关联优惠券时会一并写入这个使用门槛", "This threshold will be written into the linked coupon created from this form")}</span>
                  </label>
                </div>
                <div className="mt-6 rounded-2xl border border-gray-100 bg-white/80 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{tx("关联对象分享", "Linked audience share")}</div>
                  <div className="mt-2 break-all text-sm text-gray-600">{previewLinkedAudienceShareTarget.shareUrl}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                      onClick={() => void copyToClipboard(previewLinkedAudienceShareTarget.shareUrl, tx("邀请链接已复制", "Invite link copied"))}
                    >
                      <span className="flex items-center gap-2"><Link2 className="h-4 w-4" />{tx("复制链接", "Copy link")}</span>
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                      onClick={() => setInviteQrTarget(previewLinkedAudienceShareTarget)}
                    >
                      <span className="flex items-center gap-2"><QrCode className="h-4 w-4" />{tx("二维码", "QR code")}</span>
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                      onClick={() => void shareInviteTarget(previewLinkedAudienceShareTarget)}
                    >
                      <span className="flex items-center gap-2"><Share2 className="h-4 w-4" />{tx("分享", "Share")}</span>
                    </button>
                  </div>
                </div>
                </div>

                <div className="hidden">
                  <div className="mb-4">
                    <div className="text-sm font-semibold text-gray-900">{tx("共享规则", "Shared rules")}</div>
                    <div className="mt-1 text-xs text-gray-500">{tx("这部分会同时应用到合作方码与关联对象码。", "These settings apply to both the partner code and the linked audience code.")}</div>
                  </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("归属用户 ID", "Owner user ID")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      placeholder={tx("可留空，作为通用邀请码", "Optional, leave blank for a shared code")}
                      value={inviteCodeForm.userId}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, userId: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("最大使用次数", "Max uses")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      placeholder={tx("留空表示不限次数", "Leave empty for unlimited")}
                      value={inviteCodeForm.maxUses}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, maxUses: event.target.value }))}
                    />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("归属活动", "Campaign")}</span>
                    <select
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      value={inviteCodeForm.campaignSlug}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, campaignSlug: event.target.value }))}
                    >
                      {allCampaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.slug}>{campaign.slug}</option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("失效时间", "Expires at")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      type="datetime-local"
                      value={inviteCodeForm.expiresAt}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, expiresAt: event.target.value }))}
                    />
                  </label>
                </div>

                <div className="hidden">
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("合作对象类型", "Partner type")}</span>
                    <select
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      value={normalizePartnerTier(inviteCodeForm.partnerTier)}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, partnerTier: event.target.value as MarketingInvitationCode["partnerTier"] }))}
                    >
                      <option value="partner_package">{tx("合作权益包", "Partnership package")}</option>
                      <option value="general">{tx("通用邀请码", "General invite code")}</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("使用商品", "Product")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      value={inviteCodeForm.partnerProduct}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, partnerProduct: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("商品成本", "Product cost")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      value={inviteCodeForm.productCost}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, productCost: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("合作方赠送会员（月）", "Partner membership months")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      value={inviteCodeForm.partnerBenefitMonths}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, partnerBenefitMonths: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-gray-500">
                    <span>{tx("关联对象优惠比例（%）", "Linked audience discount (%)")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      value={inviteCodeForm.fanDiscountRate}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, fanDiscountRate: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-gray-500 md:col-span-2">
                    <span>{tx("推广订单分成（%）", "Order commission (%)")}</span>
                    <input
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      value={inviteCodeForm.orderCommissionRate}
                      onChange={(event) => setInviteCodeForm((current) => ({ ...current, orderCommissionRate: event.target.value }))}
                    />
                  </label>
                </div>
                </div>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-4 xl:sticky xl:top-6">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                  {tx("邀请码预览", "Preview")}
                </div>
                <div className="mt-3 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                  <div className="text-xs text-gray-500">{tx("当前将创建的合作方邀请码", "Partner invite code to be created")}</div>
                  <div className="mt-2 break-all text-base font-semibold tracking-[0.1em] text-gray-900 md:text-lg">{inviteCodePreview}</div>
                  <div className="mt-4 text-xs text-gray-500">{tx("关联对象邀请码", "Linked audience invite code")}</div>
                  <div className="mt-2 break-all text-sm font-semibold tracking-[0.08em] text-sky-700 md:text-base">{linkedAudienceCodePreview}</div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-gray-50 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">{tx("活动", "Campaign")}</div>
                      <div className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-gray-900">{selectedInviteCampaign?.name || inviteCodeForm.campaignSlug || "-"}</div>
                      <div className="mt-1 text-xs text-gray-500">{inviteCodeForm.campaignSlug || "-"}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">{tx("归属", "Owner")}</div>
                      <div className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-gray-900">{inviteCodeForm.userId || tx("通用发放", "Shared distribution")}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">{tx("使用规则", "Usage")}</div>
                      <div className="mt-1 text-sm font-medium text-gray-900">{inviteUsagePreview}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">{tx("有效期", "Expiry")}</div>
                      <div className="mt-1 text-sm font-medium text-gray-900">{inviteExpiryPreview}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">{tx("使用商品", "Product")}</div>
                      <div className="mt-1 text-sm font-medium text-gray-900">{inviteCodeForm.partnerProduct || "-"}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">{tx("关联优惠券规则", "Audience coupon rule")}</div>
                      <div className="mt-1 text-sm font-medium text-gray-900">
                        {tx(`购买价 ￥${couponConfigForm.purchasePrice || "0"} / 满 ￥${couponConfigForm.minPurchase || "0"} 可用`, `Price ${couponConfigForm.purchasePrice || "0"} / Min spend ${couponConfigForm.minPurchase || "0"}`)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-3 py-3 sm:col-span-2">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">{tx("合作权益包", "Partnership package")}</div>
                      <div className="mt-1 text-sm font-medium leading-5 text-gray-900">{partnerProgramPreview}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">{tx("使用商品", "Product in use")}</div>
                      <div className="mt-1 text-sm font-medium leading-5 text-gray-900">{linkedAudienceProductPreview}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">{tx("最低消费", "Minimum purchase")}</div>
                      <div className="mt-1 text-sm font-medium leading-5 text-gray-900">{tx(`满 ￥${linkedAudienceMinPurchasePreview} 可用`, `Min spend ${linkedAudienceMinPurchasePreview}`)}</div>
                    </div>
                    <div className="rounded-xl bg-sky-50 px-3 py-3 sm:col-span-2">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-sky-500">{tx("分码规则", "Split-code rule")}</div>
                      <div className="mt-1 text-sm font-medium leading-5 text-sky-900">
                        {tx("合作方邀请码用于合作方本人权益，关联对象邀请码用于关联对象优惠，两个码分开发放。", "The partner invite code is for partner benefits, while the linked audience invite code is for audience discounts. They are issued separately.")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
              <button
                type="button"
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700"
                onClick={applyPartnerPackagePreset}
              >
                {tx("应用合作权益模板", "Apply partnership package template")}
              </button>
              <button className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white" onClick={() => void runAction(tx("合作分码已保存", "Partnership codes saved"), async () => {
              const inviteBoundUserId = inviteCodeForm.userId.trim()
              if (inviteBoundUserId) {
                await validateBoundMarketingUser(inviteBoundUserId)
              }
              const partnerCode = inviteCodeForm.code || inviteCodePreview
              const linkedCode = inviteCodeForm.linkedAudienceCode || linkedAudienceCodePreview
              const inviteExpiresAt = inviteCodeForm.expiresAt ? new Date(inviteCodeForm.expiresAt).toISOString() : null
              const linkedExpiresAt = inviteExpiresAt || (() => {
                const validDays = Number(couponConfigForm.validDays || 0)
                if (!Number.isFinite(validDays) || validDays <= 0) return null
                return new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString()
              })()

              await fetchJson("/api/market-admin/admin/marketing/invitation-codes", {
                method: "POST",
                body: JSON.stringify({
                  code: partnerCode,
                  userId: inviteBoundUserId,
                  campaignSlug: inviteCodeForm.campaignSlug || null,
                  partnerTier: normalizePartnerTier(inviteCodeForm.partnerTier),
                  partnerProduct: inviteCodeForm.partnerProduct || null,
                  productCost: Number(inviteCodeForm.productCost || 0),
                  partnerBenefitMonths: Number(inviteCodeForm.partnerBenefitMonths || 0),
                  fanDiscountRate: Number(inviteCodeForm.fanDiscountRate || 0),
                  orderCommissionRate: Number(inviteCodeForm.orderCommissionRate || 0),
                  maxUses: inviteCodeForm.maxUses ? Number(inviteCodeForm.maxUses) : null,
                  expiresAt: inviteExpiresAt,
                }),
              })
              await fetchJson("/api/market-admin/admin/marketing/coupons", {
                method: "POST",
                body: JSON.stringify({
                  code: linkedCode,
                  userId: inviteBoundUserId,
                  assetType: couponForm.assetType || "cash",
                  audienceType: "linked_audience",
                  partnerProduct: inviteCodeForm.partnerProduct || null,
                  productCost: Number(inviteCodeForm.productCost || 0),
                  sourceInvitationCode: partnerCode,
                  orderCommissionRate: Number(inviteCodeForm.orderCommissionRate || 0),
                  purchasePrice: Number(couponConfigForm.purchasePrice || 0),
                  discountValue: Number(inviteCodeForm.fanDiscountRate || 0),
                  discountType: "percentage",
                  minPurchase: Number(couponConfigForm.minPurchase || 0),
                  expiresAt: linkedExpiresAt,
                }),
              })
              setInviteCodeForm((current) => ({ ...current, code: "", linkedAudienceCode: "", userId: "", maxUses: "1", expiresAt: "" }))
              await Promise.all([loadBootstrap(), loadFission(1)])
            })}>
              {tx("创建合作方与关联对象分码", "Create partner and audience codes")}
              </button>
              <button
                type="button"
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600"
                onClick={() => setInviteCodeForm((current) => ({ ...current, code: "", linkedAudienceCode: "", userId: "", maxUses: "1", expiresAt: "" }))}
              >
                {tx("重置表单", "Reset form")}
              </button>
            </div>
          </div>
        </div>
      </Section>
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <TicketPercent className="h-4 w-4 text-amber-600" />
          {tx("折扣券购买参数", "Discount coupon pricing")}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs text-gray-500">
            <span>{tx("购买价", "Purchase price")}</span>
            <input className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900" value={couponConfigForm.purchasePrice} onChange={(event) => setCouponConfigForm((current) => ({ ...current, purchasePrice: event.target.value }))} />
          </label>
          <label className="grid gap-1 text-xs text-gray-500">
            <span>{tx("默认商品成本", "Default product cost")}</span>
            <input className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900" value={couponConfigForm.productCost} onChange={(event) => setCouponConfigForm((current) => ({ ...current, productCost: event.target.value }))} />
          </label>
          <label className="grid gap-1 text-xs text-gray-500">
            <span>{tx("折扣类型", "Discount type")}</span>
            <select className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900" value={couponConfigForm.discountType} onChange={(event) => setCouponConfigForm((current) => ({ ...current, discountType: event.target.value }))}>
              <option value="percentage">{tx("按比例", "Percentage")}</option>
              <option value="fixed">{tx("减固定金额", "Fixed amount")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-gray-500">
            <span>{tx("折扣值 / 比例", "Discount value / ratio")}</span>
            <input className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900" value={couponConfigForm.discountValue} onChange={(event) => setCouponConfigForm((current) => ({ ...current, discountValue: event.target.value }))} />
          </label>
          <label className="grid gap-1 text-xs text-gray-500">
            <span>{tx("最低消费", "Minimum purchase")}</span>
            <input className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900" value={couponConfigForm.minPurchase} onChange={(event) => setCouponConfigForm((current) => ({ ...current, minPurchase: event.target.value }))} />
          </label>
          <label className="grid gap-1 text-xs text-gray-500 md:col-span-2">
            <span>{tx("默认有效天数", "Default valid days")}</span>
            <input className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900" value={couponConfigForm.validDays} onChange={(event) => setCouponConfigForm((current) => ({ ...current, validDays: event.target.value }))} />
          </label>
          <label className="grid gap-1 text-xs text-gray-500 md:col-span-2">
            <span>{tx("默认绑定用户 ID", "Default bound user ID")}</span>
            <input
              className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
              placeholder={tx("留空表示公开发放", "Leave blank for public distribution")}
              value={couponConfigForm.userId}
              onChange={(event) => {
                const nextUserId = event.target.value
                setCouponConfigForm((current) => ({ ...current, userId: nextUserId }))
                setCouponForm((current) => ({ ...current, userId: nextUserId }))
                setCouponBindingMode(nextUserId.trim() ? "user" : "public")
              }}
            />
            <span className="text-[11px] text-gray-400">{tx("这里必须填写真实用户 ID，留空表示公开发放；保存后，下方新建折扣券会默认带入这个用户 ID。", "Use a real users.id here, or leave it blank for public distribution. Newly created coupons below will reuse this user ID after saving.")}</span>
          </label>
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          {couponConfigForm.discountType === "percentage"
            ? tx(`当前默认折扣：${couponConfigForm.discountValue || "0"}%`, `Current default discount: ${couponConfigForm.discountValue || "0"}%`)
            : tx(`当前默认直减：￥${couponConfigForm.discountValue || "0"}`, `Current default fixed discount: ${couponConfigForm.discountValue || "0"}`)}
        </div>
        <button className="mt-4 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white" onClick={() => void runAction(tx("折扣券配置已保存", "Discount coupon config saved"), async () => {
              const defaultCouponUserId = couponConfigForm.userId.trim()
              if (defaultCouponUserId) {
                await validateBoundMarketingUser(defaultCouponUserId)
              }
              const payloads = [
                { key: "invite_coupon_purchase_price", value: Number(couponConfigForm.purchasePrice || 0), description: tx("邀请折扣券购买价格", "Invite coupon purchase price") },
                { key: "invite_coupon_product_cost", value: Number(couponConfigForm.productCost || 0), description: tx("邀请折扣券商品成本", "Invite coupon product cost") },
                { key: "invite_coupon_discount_type", value: couponConfigForm.discountType, description: tx("邀请折扣券折扣类型", "Invite coupon discount type") },
                { key: "invite_coupon_discount_value", value: Number(couponConfigForm.discountValue || 0), description: tx("邀请折扣券折扣值", "Invite coupon discount value") },
                { key: "invite_coupon_min_purchase", value: Number(couponConfigForm.minPurchase || 0), description: tx("邀请折扣券最低消费门槛", "Invite coupon minimum purchase") },
                { key: "invite_coupon_valid_days", value: Number(couponConfigForm.validDays || 0), description: tx("邀请折扣券有效天数", "Invite coupon valid days") },
                { key: "invite_coupon_default_user_id", value: defaultCouponUserId, description: tx("邀请折扣券默认绑定用户 ID", "Invite coupon default bound user ID") },
              ]
          await Promise.all(payloads.map((payload) => fetchJson("/api/market-admin/admin/marketing/settings", { method: "POST", body: JSON.stringify(payload) })))
          await loadBootstrap()
        })}>
          {tx("保存购买参数", "Save coupon pricing")}
        </button>
      </div>
      <Section
        title={tx("折扣券货架", "Coupon shelf")}
        description={tx("这里只设置券码、售价、折扣和使用门槛；折扣值可单独修改，产品与分成默认继承上方邀请码权益包。", "Only set the coupon code, price, discount, and usage threshold here; discount stays editable, while product and commission inherit from the invite package above by default.")}
      >
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-gray-500 md:col-span-2">
                <span>{tx("折扣券码", "Coupon code")}</span>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_132px_56px]">
                  <input
                    className="min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium tracking-[0.08em] text-gray-900"
                    placeholder={tx("例如 COUPON-AB12CD", "For example COUPON-AB12CD")}
                    value={couponForm.code}
                    onChange={(event) => setCouponForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                  />
                  <button
                    type="button"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700"
                    onClick={() => setCouponForm((current) => ({ ...current, code: createCouponCode(`coupon-${current.assetType || "cash"}`) }))}
                  >
                    {tx("自动生成", "Generate")}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-600"
                    onClick={() => void copyToClipboard(couponCodePreview, tx("折扣券码已复制", "Coupon code copied"))}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                  {tx("未填写时会自动使用这张券码：", "If left blank, this code will be used automatically:")}
                  <span className="ml-2 break-all font-mono font-semibold tracking-[0.08em] text-amber-950">{couponCodePreview}</span>
                </div>
              </label>
              <div className="grid gap-1 text-xs text-gray-500 md:col-span-2">
                <span>{tx("用户绑定", "User binding")}</span>
                <div className="grid gap-3 rounded-2xl border border-dashed border-gray-200 bg-white p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${couponBindingMode === "public" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700"}`}
                      onClick={() => {
                        setCouponBindingMode("public")
                        setCouponForm((current) => ({ ...current, userId: "" }))
                      }}
                    >
                      {tx("公开发放", "Public distribution")}
                    </button>
                    <button
                      type="button"
                      className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${couponBindingMode === "user" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700"}`}
                      onClick={() => setCouponBindingMode("user")}
                    >
                      {tx("绑定指定用户", "Bind to a user")}
                    </button>
                  </div>
                  {couponBindingMode === "user" ? (
                    <div className="grid gap-2">
                      <input
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                        placeholder={tx("输入用户 ID，例如 user_xxx", "Enter a user ID")}
                        value={couponForm.userId}
                        onChange={(event) => setCouponForm((current) => ({ ...current, userId: event.target.value }))}
                      />
                      <div className={`rounded-xl px-3 py-2 text-xs ${couponBoundUser ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-amber-200 bg-amber-50 text-amber-700"}`}>
                        {couponBoundUser
                          ? tx(
                              `已匹配用户：${couponBoundUser.name || couponBoundUser.email || couponBoundUser.userId}（${couponBoundUser.userId}）`,
                              `Matched user: ${couponBoundUser.name || couponBoundUser.email || couponBoundUser.userId} (${couponBoundUser.userId})`,
                            )
                          : tx("请输入真实用户 ID（不是邮箱或昵称）。如果当前页没显示匹配，创建时仍会再校验一次。", "Enter a real user ID, not an email or display name. If no match is shown here, it will still be validated again when you create the coupon.")}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
                      {tx("购买时无需用户 ID，默认公开发放。", "No user ID is needed at purchase time; coupons are created for public distribution by default.")}
                    </div>
                  )}
                </div>
              </div>
              <label className="grid gap-1 text-xs text-gray-500"><span>{tx("资产类型", "Asset type")}</span><select className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm" value={couponForm.assetType} onChange={(event) => setCouponForm((current) => ({ ...current, assetType: event.target.value }))}>
                {(bootstrap?.constants.assetTypes || []).map((assetType) => (
                  <option key={assetType} value={assetType}>{assetType}</option>
                ))}
              </select></label>
              <label className="grid gap-1 text-xs text-gray-500"><span>{tx("优惠券类型", "Coupon type")}</span><select className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm" value={normalizeAudienceType(couponForm.audienceType)} onChange={(event) => setCouponForm((current) => ({ ...current, audienceType: event.target.value as MarketingCoupon["audienceType"] }))}>
                <option value="linked_audience">{tx("关联对象优惠券", "Linked audience coupon")}</option>
                <option value="general">{tx("通用折扣券", "General coupon")}</option>
              </select></label>
              <label className="grid gap-1 text-xs text-gray-500">
                <span>{tx("使用产品", "Usage product")}</span>
                <input
                  className="min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                  placeholder={couponDerivedProduct || tx("默认继承上方产品", "Defaults to the invite package product")}
                  value={couponForm.partnerProduct}
                  onChange={(event) => setCouponForm((current) => ({ ...current, partnerProduct: event.target.value }))}
                />
                <span className="text-[11px] text-gray-400">
                  {tx(
                    "留空时默认继承上方邀请码/合作包产品，填写后可单独覆盖。",
                    "Leave blank to inherit from the invite package product, or enter a value to override it.",
                  )}
                </span>
              </label>
              <div className="grid gap-1 text-xs text-gray-500 md:col-span-2">
                <span>{tx("关联邀请码", "Linked invite code")}</span>
                <select
                  className="min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                  value={couponSelectableSourceInvitationCode}
                  onChange={(event) => setCouponForm((current) => ({ ...current, sourceInvitationCode: event.target.value.toUpperCase() }))}
                >
                  <option value="">
                    {couponAudienceType === "linked_audience"
                      ? tx(
                          `默认当前合作方邀请码${couponDefaultSourceInvitationCode ? ` (${couponDefaultSourceInvitationCode})` : ""}`,
                          `Default to current partner invite${couponDefaultSourceInvitationCode ? ` (${couponDefaultSourceInvitationCode})` : ""}`,
                        )
                      : tx("不关联邀请码", "No linked invite code")}
                  </option>
                  {invitationCodes.map((row) => (
                    <option key={row.id} value={row.code.toUpperCase()}>
                      {`${row.code.toUpperCase()} / ${row.partnerProduct || "-"} / ${formatNumber(row.orderCommissionRate)}%`}
                    </option>
                  ))}
                </select>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                  <input
                    className="min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                    list="coupon-linked-invite-options"
                    placeholder={couponAudienceType === "linked_audience" ? couponDerivedSourceInvitationCode || inviteCodePreview : tx("可选", "Optional")}
                    value={couponForm.sourceInvitationCode}
                    onChange={(event) => setCouponForm((current) => ({ ...current, sourceInvitationCode: event.target.value.toUpperCase() }))}
                  />
                  <button
                    type="button"
                    className="rounded-xl border border-gray-200 px-3 py-2.5 text-left text-sm font-medium leading-5 text-gray-700 whitespace-normal md:max-w-[180px] disabled:cursor-not-allowed disabled:border-gray-100 disabled:text-gray-300"
                    onClick={applyCouponInvitePackage}
                    disabled={!couponLinkedInvitationSource}
                  >
                    {tx("同步邀请码权益", "Apply invite package")}
                  </button>
                </div>
                <datalist id="coupon-linked-invite-options">
                  {invitationCodes.map((row) => (
                    <option key={row.id} value={row.code.toUpperCase()} />
                  ))}
                </datalist>
                {couponLinkedInvitationSource ? (
                  <div className="min-w-0 break-words rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-[11px] leading-5 text-sky-800">
                    {couponLinkedInvitationSource.isDraftCurrentInvite
                      ? tx(
                          `当前将使用表单里的合作方邀请码 ${couponLinkedInvitationSource.code}，商品 ${couponLinkedInvitationSource.partnerProduct || "-"}，成本 ${formatNumber(couponLinkedInvitationSource.productCost)}，折扣 ${formatNumber(couponLinkedInvitationSource.fanDiscountRate)}%，分成 ${formatNumber(couponLinkedInvitationSource.orderCommissionRate)}%`,
                          `Using the current form invite ${couponLinkedInvitationSource.code}: product ${couponLinkedInvitationSource.partnerProduct || "-"}, cost ${formatNumber(couponLinkedInvitationSource.productCost)}, discount ${formatNumber(couponLinkedInvitationSource.fanDiscountRate)}%, commission ${formatNumber(couponLinkedInvitationSource.orderCommissionRate)}%`,
                        )
                      : tx(
                          `已匹配邀请码 ${couponLinkedInvitationSource.code}，商品 ${couponLinkedInvitationSource.partnerProduct || "-"}，成本 ${formatNumber(couponLinkedInvitationSource.productCost)}，折扣 ${formatNumber(couponLinkedInvitationSource.fanDiscountRate)}%，分成 ${formatNumber(couponLinkedInvitationSource.orderCommissionRate)}%`,
                          `Matched invite ${couponLinkedInvitationSource.code}: product ${couponLinkedInvitationSource.partnerProduct || "-"}, cost ${formatNumber(couponLinkedInvitationSource.productCost)}, discount ${formatNumber(couponLinkedInvitationSource.fanDiscountRate)}%, commission ${formatNumber(couponLinkedInvitationSource.orderCommissionRate)}%`,
                        )}
                  </div>
                ) : null}
                <span className="text-[11px] text-gray-400">
                  {tx(
                    "可以直接从已有邀请码中选择，也可以手动输入。留空时，关联对象优惠券会默认关联当前合作方邀请码。",
                    "Choose from existing invite codes or enter one manually. Leave blank to default linked-audience coupons to the current partner invite code.",
                  )}
                </span>
              </div>
              <label className="grid gap-1 text-xs text-gray-500">
                <span>{tx("商品成本", "Product cost")}</span>
                <input
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                  placeholder={couponDerivedProductCost || "0"}
                  value={couponForm.productCost}
                  onChange={(event) => setCouponForm((current) => ({ ...current, productCost: event.target.value }))}
                />
                <span className="text-[11px] text-gray-400">
                  {tx(
                    "留空时默认继承上方合作包/默认成本。分成按实付金额减去成本后的净利润计算。",
                    "Leave blank to inherit the linked package/default cost. Commission is based on paid amount minus product cost.",
                  )}
                </span>
              </label>
              <label className="grid gap-1 text-xs text-gray-500"><span>{tx("购买价", "Purchase price")}</span><input className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm" placeholder={tx("例如 9.9", "For example 9.9")} value={couponForm.purchasePrice} onChange={(event) => setCouponForm((current) => ({ ...current, purchasePrice: event.target.value }))} /></label>
              <label className="grid gap-1 text-xs text-gray-500"><span>{tx("折扣类型", "Discount type")}</span><select className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm" value={couponForm.discountType} onChange={(event) => setCouponForm((current) => ({ ...current, discountType: event.target.value }))}>
                <option value="percentage">{tx("按比例", "Percentage")}</option>
                <option value="fixed">{tx("减固定金额", "Fixed amount")}</option>
              </select></label>
              <label className="grid gap-1 text-xs text-gray-500">
                <span>{tx("折扣值 / 比例", "Discount value / ratio")}</span>
                <input className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm" placeholder={tx("例如 20", "For example 20")} value={couponForm.discountValue} onChange={(event) => setCouponForm((current) => ({ ...current, discountValue: event.target.value }))} />
                <span className="text-[11px] text-gray-400">{tx("可单独修改，不会覆盖上方权益包里的默认折扣。", "You can adjust this value independently without overwriting the invite package default.")}</span>
              </label>
              <label className="grid gap-1 text-xs text-gray-500"><span>{tx("最低消费", "Minimum purchase")}</span><input className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm" placeholder={tx("例如 99", "For example 99")} value={couponForm.minPurchase} onChange={(event) => setCouponForm((current) => ({ ...current, minPurchase: event.target.value }))} /></label>
              <label className="grid gap-1 text-xs text-gray-500"><span>{tx("总可用次数", "Total uses")}</span><input className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm" placeholder={tx("留空表示不限次数", "Leave blank for unlimited uses")} value={couponForm.maxUses} onChange={(event) => setCouponForm((current) => ({ ...current, maxUses: event.target.value }))} /></label>
              <label className="grid gap-1 text-xs text-gray-500 md:col-span-2"><span>{tx("失效时间", "Expires at")}</span><input className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm" type="datetime-local" value={couponForm.expiresAt} onChange={(event) => setCouponForm((current) => ({ ...current, expiresAt: event.target.value }))} /></label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700"
                onClick={applyPartnerPackagePreset}
              >
                {tx("套用合作优惠模板", "Apply linked discount template")}
              </button>
              <button className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white" onClick={() => void runAction(tx("折扣券已创建", "Coupon created"), async () => {
              if (couponBindingMode === "user" && !couponBoundUserId) {
                throw new Error(tx("请输入要绑定的用户 ID", "Enter a user ID to bind"))
              }
              if (couponBindingMode === "user") {
                await validateBoundMarketingUser(couponBoundUserId)
              }

              const fallbackExpireAt = (() => {
                if (couponForm.expiresAt) return new Date(couponForm.expiresAt).toISOString()
                const validDays = Number(couponConfigForm.validDays || 0)
                if (!Number.isFinite(validDays) || validDays <= 0) return null
                return new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString()
              })()

              await fetchJson("/api/market-admin/admin/marketing/coupons", {
                method: "POST",
                body: JSON.stringify({
                  code: couponForm.code || couponCodePreview,
                  userId: couponBoundUserId,
                  assetType: couponForm.assetType,
                  audienceType: couponAudienceType,
                  partnerProduct: couponDerivedProduct || null,
                  productCost: Number(couponForm.productCost || couponDerivedProductCost || 0),
                  sourceInvitationCode: couponDerivedSourceInvitationCode || null,
                  orderCommissionRate: Number(couponDerivedCommissionRate || 0),
                  purchasePrice: Number(couponForm.purchasePrice || 0),
                  discountValue: Number(couponForm.discountValue || 0),
                  discountType: couponForm.discountType,
                  minPurchase: Number(couponForm.minPurchase || 0),
                  maxUses: couponForm.maxUses.trim() ? Number(couponForm.maxUses) : null,
                  expiresAt: fallbackExpireAt,
                }),
              })
              setCouponForm((current) => ({
                ...current,
                code: "",
                userId: couponConfigForm.userId,
                sourceInvitationCode: "",
                productCost: couponConfigForm.productCost,
                purchasePrice: couponConfigForm.purchasePrice,
                discountValue: couponConfigForm.discountValue,
                discountType: couponConfigForm.discountType,
                minPurchase: couponConfigForm.minPurchase,
                maxUses: "1",
                expiresAt: "",
              }))
              setCouponBindingMode(couponConfigForm.userId.trim() ? "user" : "public")
              await loadBootstrap()
            })}>
              {tx("创建折扣券", "Create coupon")}
              </button>
            </div>
          </div>
          <div className="min-w-0 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-xs text-gray-500">{tx("邀请码总数", "Invite codes")}</div>
              <div className="mt-2 text-3xl font-bold text-gray-900">{formatNumber(invitationCodes.length)}</div>
              <div className="mt-2 text-sm text-gray-500">{tx("生效中", "Active")} {formatNumber(invitationCodes.filter((item) => item.status === "active").length)}</div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-xs text-gray-500">{tx("折扣券总数", "Coupons")}</div>
              <div className="mt-2 text-3xl font-bold text-gray-900">{formatNumber(coupons.length)}</div>
              <div className="mt-2 text-sm text-gray-500">{tx("总使用次数", "Total uses")} {formatNumber(couponUsedTotal)}</div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 md:col-span-2">
              <div className="text-xs text-gray-500">{tx("当前折扣预览", "Current coupon preview")}</div>
              <div className="mt-2 text-base font-semibold text-gray-900">
                {couponForm.discountType === "percentage"
                  ? tx(`${couponForm.discountValue || "0"}% 折扣`, `${couponForm.discountValue || "0"}% off`)
                  : tx(`直减 ￥${couponForm.discountValue || "0"}`, `Save ${couponForm.discountValue || "0"}`)}
              </div>
              <div className="mt-1 text-sm text-gray-500">
                {tx(`购买价 ￥${couponForm.purchasePrice || "0"}，最低消费 ￥${couponForm.minPurchase || "0"}`, `Purchase ${couponForm.purchasePrice || "0"}, min spend ${couponForm.minPurchase || "0"}`)}
              </div>
              <div className="mt-1 text-sm text-gray-500">{couponUsagePreview}</div>
            </div>
          </div>
        </div>
      </Section>
      <Section
        title={tx("邀请码与折扣券列表", "Invite codes and coupon list")}
        description={tx("查看当前已发放的邀请码和可售折扣券。", "Review issued invite codes and sellable discount coupons.")}
      >
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="overflow-x-auto">
            <div className="mb-3 text-sm font-semibold text-gray-900">{tx("邀请码", "Invite codes")}</div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-3 py-2">{tx("邀请码", "Code")}</th>
                  <th className="px-3 py-2">{tx("归属", "Owner")}</th>
                  <th className="px-3 py-2">{tx("活动", "Campaign")}</th>
                  <th className="px-3 py-2">{tx("状态", "Status")}</th>
                  <th className="px-3 py-2">{tx("操作", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {invitationCodes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-sm text-gray-400">
                      {tx("当前还没有邀请码数据，可在上方创建后出现在这里。", "No invite codes yet. Create one above and it will appear here.")}
                    </td>
                  </tr>
                ) : (
                invitationCodes.slice(0, 8).map((row) => (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{row.code}</span>
                        <button className="rounded-lg border border-gray-200 p-1 text-gray-500" onClick={() => void copyToClipboard(row.code, tx("邀请码已复制", "Invite code copied"))}>
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="text-xs text-gray-400">{tx("使用", "Uses")} {row.usedCount} / {row.maxUses ?? "∞"}</div>
                      {normalizePartnerTier(row.partnerTier) === "partner_package" ? (
                        <div className="mt-1 text-xs text-blue-600">
                          {tx(
                            `合作方 ${formatNumber(row.partnerBenefitMonths)} 个月会员 / 成本 ${formatNumber(row.productCost)} / 关联对象 ${formatNumber(row.fanDiscountRate)}% 优惠 / 分成 ${formatNumber(row.orderCommissionRate)}%`,
                            `${formatNumber(row.partnerBenefitMonths)} months / cost ${formatNumber(row.productCost)} / ${formatNumber(row.fanDiscountRate)}% off / ${formatNumber(row.orderCommissionRate)}% commission`,
                          )}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-gray-600">{row.userId || "-"}</td>
                    <td className="px-3 py-3 text-gray-600">{row.campaignSlug || "-"}</td>
                    <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusClass(row.status)}`}>{row.status}</span></td>
                    <td className="px-3 py-3">
                      {(() => {
                        const rowShareTarget = buildInviteShareTarget({
                          title: tx("邀请码分享", "Invite share"),
                          code: row.code,
                          helper: tx("当前邀请码的分享链接与二维码。", "Share link and QR code for this invite code."),
                          campaignSlug: row.campaignSlug,
                          product: row.partnerProduct,
                          tier: normalizePartnerTier(row.partnerTier),
                        })

                        return (
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-600 transition hover:bg-gray-50"
                              onClick={() => void copyToClipboard(rowShareTarget.shareUrl, tx("邀请链接已复制", "Invite link copied"))}
                              aria-label={tx("复制邀请链接", "Copy invite link")}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-600 transition hover:bg-gray-50"
                              onClick={() => setInviteQrTarget(rowShareTarget)}
                              aria-label={tx("查看邀请码二维码", "Show invite QR code")}
                            >
                              <QrCode className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-600 transition hover:bg-gray-50"
                              onClick={() => void shareInviteTarget(rowShareTarget)}
                              aria-label={tx("分享邀请码", "Share invite code")}
                            >
                              <Share2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="rounded-lg border border-rose-200 p-1.5 text-rose-600 transition hover:bg-rose-50"
                              onClick={() => void handleDeleteInvitationCode(row)}
                              aria-label={tx("删除邀请码", "Delete invite code")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                ))
                )}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto">
            <div className="mb-3 text-sm font-semibold text-gray-900">{tx("折扣券", "Coupons")}</div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-3 py-2">{tx("券码", "Code")}</th>
                  <th className="px-3 py-2">{tx("折扣", "Discount")}</th>
                  <th className="px-3 py-2">{tx("购买价", "Price")}</th>
                  <th className="px-3 py-2">{tx("使用情况", "Usage")}</th>
                  <th className="px-3 py-2">{tx("最近使用", "Latest usage")}</th>
                  <th className="px-3 py-2">{tx("状态", "Status")}</th>
                  <th className="px-3 py-2">{tx("操作", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {coupons.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-sm text-gray-400">
                      {tx("当前还没有折扣券数据，可在上方创建后出现在这里。", "No coupons yet. Create one above and it will appear here.")}
                    </td>
                  </tr>
                ) : (
                coupons.map((row) => {
                  const usedCount = getCouponUsedCount(row)
                  const remainingUses = getCouponRemainingUses(row)

                  return (
                    <tr key={row.id} className="border-b border-gray-50">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{row.code}</span>
                          <button className="rounded-lg border border-gray-200 p-1 text-gray-500" onClick={() => void copyToClipboard(row.code, tx("折扣券码已复制", "Coupon code copied"))}>
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="text-xs text-gray-400">{tx("最低消费", "Min spend")} {formatNumber(row.minPurchase)}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {row.userId
                            ? tx(`绑定用户 ${row.userId}`, `Bound user ${row.userId}`)
                            : tx("公开发放", "Public distribution")}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {row.sourceInvitationCode
                            ? tx(`关联邀请码 ${row.sourceInvitationCode}`, `Linked invite ${row.sourceInvitationCode}`)
                            : tx("未关联邀请码", "No linked invite code")}
                        </div>
                        <div className="mt-1 text-xs text-blue-600">
                          {tx(
                            `${normalizeAudienceType(row.audienceType) === "linked_audience" ? "关联对象优惠券" : "通用券"} / 成本 ${formatNumber(row.productCost)} / 分成 ${formatNumber(row.orderCommissionRate)}%`,
                            `${normalizeAudienceType(row.audienceType) === "linked_audience" ? "Linked audience coupon" : "General coupon"} / cost ${formatNumber(row.productCost)} / ${formatNumber(row.orderCommissionRate)}% commission`,
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-600">{row.discountType === "percentage" ? `${formatNumber(row.discountValue)}%` : `￥${formatNumber(row.discountValue)}`}</td>
                      <td className="px-3 py-3 text-gray-600">￥{formatNumber(row.purchasePrice)}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900">{usedCount > 0 ? tx("已使用", "Used") : tx("未使用", "Unused")}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {row.maxUses === null
                            ? tx("总可用次数不限", "Unlimited total uses")
                            : tx(`总可用 ${formatNumber(row.maxUses)} 次`, `Total ${formatNumber(row.maxUses)} uses`)}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">{tx(`总使用 ${formatNumber(usedCount)} 次`, `Used ${formatNumber(usedCount)} times`)}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {remainingUses === null
                            ? tx("剩余次数不限", "Unlimited remaining")
                            : tx(`剩余 ${formatNumber(remainingUses)} 次`, `Remaining ${formatNumber(remainingUses)} uses`)}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-sm font-medium text-gray-900">{row.usedByUserId || tx("暂无使用用户", "No usage yet")}</div>
                        <div className="mt-1 break-all text-xs text-gray-500">
                          {row.usedOrderNo ? tx(`订单号 ${row.usedOrderNo}`, `Order ${row.usedOrderNo}`) : tx("订单号 -", "Order -")}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {row.usedAt ? formatDateTime(row.usedAt) : tx("使用时间 -", "Used at -")}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusClass(row.status)}`}>{row.status}</span>
                        <div className="mt-1 text-xs text-gray-400">
                          {row.expiresAt ? tx(`失效 ${formatDateTime(row.expiresAt)}`, `Expires ${formatDateTime(row.expiresAt)}`) : tx("未设置失效时间", "No expiry")}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 transition hover:bg-gray-50"
                            onClick={() => void handleAdjustCouponUsage(row)}
                          >
                            {tx("调整次数", "Adjust usage")}
                          </button>
                          <button
                            className="rounded-lg border border-rose-200 p-1.5 text-rose-600 transition hover:bg-rose-50"
                            onClick={() => void handleDeleteCoupon(row)}
                            aria-label={tx("删除折扣券", "Delete coupon")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
      <Section
        title={tx("裂变与拉新工作台", "Fission workbench")}
        description={tx("筛选邀请关系、渠道与头部邀请人", "Filter referral relations, channels and top inviters")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-gray-100 p-1">
              <button className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${fissionTab === "relations" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`} onClick={() => setFissionTab("relations")}>{tx("邀请关系", "Relations")}</button>
              <button className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${fissionTab === "rewards" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`} onClick={() => setFissionTab("rewards")}>{tx("奖励记录", "Rewards")}</button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input className="w-60 rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm" placeholder={tx("搜索邀请关系", "Search relations")} value={fissionSearch} onChange={(event) => setFissionSearch(event.target.value)} />
            </div>
            <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={fissionStatus} onChange={(event) => setFissionStatus(event.target.value)}>
              <option value="all">{tx("全部状态", "All statuses")}</option>
              {(fission?.statuses || []).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={fissionDatePreset} onChange={(event) => setFissionDatePreset(event.target.value)}>
              <option value="all">{tx("全部时间", "All time")}</option>
              <option value="today">{tx("今天", "Today")}</option>
              <option value="yesterday">{tx("昨天", "Yesterday")}</option>
              <option value="7days">{tx("近7天", "Last 7 days")}</option>
              <option value="30days">{tx("近30天", "Last 30 days")}</option>
              <option value="custom">{tx("指定日期", "Specific date")}</option>
            </select>
            <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50" type="date" disabled={fissionDatePreset !== "custom"} value={fissionDate} onChange={(event) => setFissionDate(event.target.value)} />
            <button className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white" onClick={() => { setFissionPage(1); void loadFission(1) }}>{tx("应用筛选", "Apply")}</button>
          </div>
        }
      >
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div>
            <div className="mb-3 text-sm font-semibold text-gray-900">{t("marketReferralTopTitle")}</div>
            <div className="space-y-2">
                {(fission?.topInviters || []).map((row) => (
                  <div key={`${row.inviterUserId}-${row.referralCode}`} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="font-medium text-gray-900">{row.inviterEmail || row.inviterUserId}</div>
                    <div className="mt-1 text-xs text-gray-400">{row.referralCode || row.inviterUserId}</div>
                    <div className="mt-1 text-xs text-gray-500">{tx("邀请", "Invites")} {row.invitedCount} · {tx("激活", "Activated")} {row.activatedCount} · {tx("奖励", "Rewards")} {formatNumber(row.rewardCredits)}</div>
                  </div>
                ))}
            </div>
          </div>
          <div>
            <div className="mb-3 text-sm font-semibold text-gray-900">{tx("渠道转化概览", "Channel conversion")}</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="px-3 py-2">{t("marketColSource")}</th>
                    <th className="px-3 py-2">{t("marketReferralClicks")}</th>
                    <th className="px-3 py-2">{t("marketReferralInvites")}</th>
                    <th className="px-3 py-2">{tx("转化率", "Conversion")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(fission?.channels || []).map((row) => (
                    <tr key={row.source} className="border-b border-gray-50">
                      <td className="px-3 py-3 font-medium text-gray-900">{row.source}</td>
                      <td className="px-3 py-3 text-gray-600">{formatNumber(row.clicks)}</td>
                      <td className="px-3 py-3 text-gray-600">{formatNumber(row.invites)}</td>
                      <td className="px-3 py-3 text-gray-600">{row.conversionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Section>
      <Section title={t("marketReferralRelationTitle")} description={t("marketReferralRelationDesc")}>
        <div className="overflow-x-auto">
          {fissionTab === "relations" ? (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-3 py-2">{t("marketColInviter")}</th>
                  <th className="px-3 py-2">{t("marketColInvitee")}</th>
                  <th className="px-3 py-2">{tx("分享码", "Share code")}</th>
                  <th className="px-3 py-2">{t("marketColStatus")}</th>
                  <th className="px-3 py-2">{t("marketColTime")}</th>
                </tr>
              </thead>
              <tbody>
                {(fission?.relations.rows || []).map((row) => (
                  <tr key={row.relationId} className="border-b border-gray-50">
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-900">{row.inviterEmail || row.inviterUserId}</div>
                      <div className="text-xs text-gray-400">{row.inviterUserId}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-900">{row.invitedEmail || row.invitedUserId}</div>
                      <div className="text-xs text-gray-400">{row.invitedUserId}</div>
                    </td>
                    <td className="px-3 py-3 text-gray-600">{row.shareCode || "-"}</td>
                    <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusClass(row.status)}`}>{row.status}</span></td>
                    <td className="px-3 py-3 text-gray-500">{formatDateTime(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-3 py-2">{tx("奖励 ID", "Reward ID")}</th>
                  <th className="px-3 py-2">{tx("类型", "Type")}</th>
                  <th className="px-3 py-2">{tx("金额", "Amount")}</th>
                  <th className="px-3 py-2">{tx("状态", "Status")}</th>
                  <th className="px-3 py-2">{tx("时间", "Time")}</th>
                </tr>
              </thead>
              <tbody>
                {(fission?.rewards.rows || []).map((row) => (
                  <tr key={row.rewardId} className="border-b border-gray-50">
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-900">{row.rewardId}</div>
                      <div className="text-xs text-gray-400">{row.relationId || "-"}</div>
                    </td>
                    <td className="px-3 py-3 text-gray-600">{row.rewardType}</td>
                    <td className="px-3 py-3 font-medium text-blue-600">+{row.amount}</td>
                    <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusClass(row.status)}`}>{row.status}</span></td>
                    <td className="px-3 py-3 text-gray-500">{formatDateTime(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {fission ? (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
            <div>
              {fissionTab === "relations" ? (
                <>{tx("共", "Total")} {fission.relations.total} {tx("条关系", "relations")}</>
              ) : (
                <>{tx("共", "Total")} {fission.rewards.total} {tx("条记录", "records")}</>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg border border-gray-200 px-3 py-2 disabled:opacity-40"
                disabled={(fissionTab === "relations" ? fission.relations.page : fission.rewards.page) <= 1}
                onClick={() => {
                  const current = fissionTab === "relations" ? fission.relations.page : fission.rewards.page;
                  const next = Math.max(1, current - 1);
                  setFissionPage(next);
                  void loadFission(next);
                }}
              >
                {tx("上一页", "Prev")}
              </button>
              <span>
                {fissionTab === "relations" ? fission.relations.page : fission.rewards.page} / {" "}
                {Math.max(
                  Math.ceil(
                    (fissionTab === "relations" ? fission.relations.total : fission.rewards.total) /
                      (fissionTab === "relations" ? fission.relations.limit : fission.rewards.limit)
                  ),
                  1
                )}
              </span>
              <button
                className="rounded-lg border border-gray-200 px-3 py-2 disabled:opacity-40"
                disabled={
                  (fissionTab === "relations" ? fission.relations.page : fission.rewards.page) >=
                  Math.max(
                    Math.ceil(
                      (fissionTab === "relations" ? fission.relations.total : fission.rewards.total) /
                        (fissionTab === "relations" ? fission.relations.limit : fission.rewards.limit)
                    ),
                    1
                  )
                }
                onClick={() => {
                  const current = fissionTab === "relations" ? fission.relations.page : fission.rewards.page;
                  const next = current + 1;
                  setFissionPage(next);
                  void loadFission(next);
                }}
              >
                {tx("下一页", "Next")}
              </button>
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  )

  const renderActivity = () => (
    <div className="space-y-6">
      <Section
        title={tx("增长制度配置台", "Growth rules studio")}
        description={tx("这里把用户裂变系统拆成四套可配置制度。保存后会同步更新对应设置项、任务模板和相关活动规则。", "This panel groups the growth engine into four configurable systems. Saving will sync related settings, task templates, and campaign rules.")}
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {growthSystems.map((system) => {
            const Icon = system.icon
            return (
              <div key={system.key} className={`rounded-3xl border border-gray-200 bg-gradient-to-br ${system.accentClass} p-5`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-white/90 p-3 text-gray-900 shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-gray-900">{tx(system.title.zh, system.title.en)}</div>
                      <div className="mt-1 text-sm text-gray-600">{tx(system.description.zh, system.description.en)}</div>
                    </div>
                  </div>
                  <button
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                    onClick={() => void saveGrowthSystem(system.key)}
                  >
                    {tx("保存制度", "Save system")}
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {system.rules.map((rule) => (
                    <label key={rule.key} className="grid gap-1 text-xs text-gray-500">
                      <span>{tx(rule.label.zh, rule.label.en)}</span>
                      <input
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                        type={rule.valueType === "number" ? "number" : "text"}
                        value={growthConfigForm[rule.key] ?? rule.defaultValue}
                        onChange={(event) => updateGrowthConfigValue(rule.key, event.target.value)}
                      />
                      <span className="leading-5 text-gray-400">{tx(rule.description.zh, rule.description.en)}</span>
                    </label>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {system.metrics.map((metric) => (
                    <div key={metric.label} className="rounded-2xl border border-white/80 bg-white/85 px-4 py-3 shadow-sm">
                      <div className="text-xs text-gray-500">{metric.label}</div>
                      <div className="mt-1 text-base font-semibold text-gray-900">{metric.value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{tx("挂载活动", "Campaigns")}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {system.campaigns.map((campaign) => (
                        <span key={campaign.slug} className={`inline-flex rounded-full border px-3 py-1 text-xs ${statusClass(campaign.status)}`}>
                          {campaign.name}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{tx("模板挂载", "Templates")}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {system.templates.map((template) => (
                        <span key={template.slug} className="inline-flex rounded-full border border-gray-200 bg-white/85 px-3 py-1 text-xs text-gray-700">
                          {template.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{tx("最近任务表现", "Recent performance")}</div>
                    <div className="mt-2 space-y-2">
                      {system.recentPerformance.length ? system.recentPerformance.slice(0, 3).map((row) => (
                        <div key={row.templateSlug} className="rounded-2xl border border-white/80 bg-white/85 px-4 py-3 shadow-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{row.templateName}</div>
                              <div className="text-xs text-gray-500">
                                {tx("参与 / 完成", "Participants / completions")} {formatNumber(row.participants)} / {formatNumber(row.completions)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-gray-900">{formatNumber(row.rewardTotal)}</div>
                              <div className="text-xs text-gray-500">{row.conversionRate}%</div>
                            </div>
                          </div>
                        </div>
                      )) : (
                        <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-4 py-3 text-sm text-gray-500">
                          {tx("当前还没有命中该制度的任务表现数据。", "No task performance has been recorded for this system yet.")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
  const renderWithdraw = () => (
    <div className="space-y-6">
      <Section title={tx("提现审批工单池", "Withdrawal work orders")} description={tx("现金满 20 元门槛后进入人工审核", "Cash-outs require the 20-unit threshold and manual review")}>
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
          <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColUserId")} value={withdrawalForm.userId} onChange={(event) => setWithdrawalForm((current) => ({ ...current, userId: event.target.value }))} />
          <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColAmount")} value={withdrawalForm.amount} onChange={(event) => setWithdrawalForm((current) => ({ ...current, amount: event.target.value }))} />
          <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColChannel")} value={withdrawalForm.channel} onChange={(event) => setWithdrawalForm((current) => ({ ...current, channel: event.target.value }))} />
          <button className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white" onClick={() => void runAction(tx("提现工单已创建", "Withdrawal request created"), async () => { await fetchJson("/api/market-admin/admin/marketing/withdrawals", { method: "POST", body: JSON.stringify({ userId: withdrawalForm.userId, amount: Number(withdrawalForm.amount || 0), channel: withdrawalForm.channel }) }); await Promise.all([loadBootstrap(), loadWithdrawals()]) })}>{t("marketWithdrawalsCreateAction")}</button>
        </div>
      </Section>
      <Section
        title={t("marketWithdrawalsListTitle")}
        description={t("marketWithdrawalsListDesc")}
        actions={
          <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={withdrawalStatus} onChange={(event) => { setWithdrawalStatus(event.target.value); void loadWithdrawals(event.target.value) }}>
            <option value="all">{tx("全部状态", "All statuses")}</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="frozen">frozen</option>
          </select>
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-3 py-2">{tx("工单 / 时间", "Ticket / Time")}</th>
                <th className="px-3 py-2">{t("marketColUserId")}</th>
                <th className="px-3 py-2">{t("marketColAmount")}</th>
                <th className="px-3 py-2">{t("marketColStatus")}</th>
                <th className="px-3 py-2">{t("marketColActions")}</th>
              </tr>
            </thead>
            <tbody>
              {withdrawalRows.map((row) => (
                <tr key={row.id} className="border-b border-gray-50">
                  <td className="px-3 py-3"><div className="font-medium text-gray-900">{row.id}</div><div className="text-xs text-gray-400">{formatDateTime(row.requestedAt)}</div></td>
                  <td className="px-3 py-3 text-gray-600">{row.userId}</td>
                  <td className="px-3 py-3 font-medium text-gray-900">￥{formatNumber(row.amount)}</td>
                  <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusClass(row.status)}`}>{row.status}</span></td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      {(["approved", "rejected", "frozen"] as const).map((status) => (
                        <button
                          key={status}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700"
                          onClick={() =>
                            void runAction(tx("提现审核已更新", "Withdrawal updated"), async () => {
                              const reviewNote = window.prompt(tx("请输入审核备注（可选）", "Add an optional review note")) || ""
                              await fetchJson(`/api/market-admin/admin/marketing/withdrawals/${row.id}/review`, { method: "POST", body: JSON.stringify({ status, reviewNote }) })
                              await Promise.all([loadBootstrap(), loadWithdrawals()])
                            })
                          }
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )

  const renderReports = () => (
    <div className="space-y-6">
      <Section title={tx("营销 ROI 每日核算表", "Daily ROI sheet")} description={tx("按天查看裂变投入产出估算", "Daily estimated fission ROI")}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-3 py-2">{tx("日期", "Date")}</th>
                <th className="px-3 py-2">{t("marketReferralClicks")}</th>
                <th className="px-3 py-2">{t("marketReferralInvites")}</th>
                <th className="px-3 py-2">{t("marketReferralActivated")}</th>
                <th className="px-3 py-2">{tx("现金成本", "Cash cost")}</th>
                <th className="px-3 py-2">{tx("积分成本", "Points cost")}</th>
                <th className="px-3 py-2">{tx("预估 ROI", "Estimated ROI")}</th>
              </tr>
            </thead>
            <tbody>
              {(bootstrap?.dashboardSummary.dailyRoi || []).map((row) => (
                <tr key={row.date} className="border-b border-gray-50">
                  <td className="px-3 py-3 font-medium text-gray-900">{row.date}</td>
                  <td className="px-3 py-3 text-gray-600">{formatNumber(row.clicks)}</td>
                  <td className="px-3 py-3 text-gray-600">{formatNumber(row.invites)}</td>
                  <td className="px-3 py-3 text-gray-600">{formatNumber(row.activated)}</td>
                  <td className="px-3 py-3 text-gray-600">￥{formatNumber(row.cashCost)}</td>
                  <td className="px-3 py-3 text-gray-600">{formatNumber(row.pointsCost)}</td>
                  <td className="px-3 py-3 font-semibold text-blue-600">{row.roi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Section title={t("marketReportsAssetsTitle")} description={t("marketReportsAssetsDesc")}>
          <div className="space-y-3">
            {(bootstrap?.reports.assetDistribution || []).map((row) => (
              <div key={row.assetType} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-900">{row.assetType}</div>
                  <div className="text-xs text-gray-500">{tx("用户数", "Users")} {formatNumber(row.userCount)}</div>
                </div>
                <div className="mt-2 text-sm text-gray-600">{tx("可用", "Available")} {formatNumber(row.available)} · {t("marketFrozenLabel")} {formatNumber(row.frozen)}</div>
              </div>
            ))}
          </div>
        </Section>
        <Section title={tx("任务转化与广告库存", "Task conversion & ad inventory")} description={tx("展示广告库存与任务表现", "Ad inventory and task performance")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4"><div className="text-xs text-gray-500">{t("marketAdsInventoryTotal")}</div><div className="mt-1 text-2xl font-semibold text-gray-900">{formatNumber(bootstrap?.adInventory.inventory.total || 0)}</div></div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4"><div className="text-xs text-gray-500">{tx("激励模板", "Reward templates")}</div><div className="mt-1 text-2xl font-semibold text-gray-900">{formatNumber(bootstrap?.adInventory.templates.length || 0)}</div></div>
          </div>
          <div className="mt-4 space-y-2">
            {(bootstrap?.reports.taskPerformance || []).slice(0, 6).map((row) => (
              <div key={row.templateSlug} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900">{row.templateName}</div>
                    <div className="text-xs text-gray-500">{tx("参与 / 完成", "Participants / completions")} {formatNumber(row.participants)} / {formatNumber(row.completions)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900">{formatNumber(row.rewardTotal)}</div>
                    <div className="text-xs text-gray-500">{row.conversionRate}%</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )

  const renderRisk = () => (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <Section title={t("marketRiskListTitle")} description={t("marketRiskListDesc")}>
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-3">
              <select className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" value={riskListForm.listType} onChange={(event) => setRiskListForm((current) => ({ ...current, listType: event.target.value }))}>
                <option value="user">{t("marketRiskTypeUser")}</option>
                <option value="device">{t("marketRiskTypeDevice")}</option>
                <option value="ip">{t("marketRiskTypeIp")}</option>
              </select>
              <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm md:col-span-2" placeholder={t("marketColTargetValue")} value={riskListForm.targetValue} onChange={(event) => setRiskListForm((current) => ({ ...current, targetValue: event.target.value }))} />
            </div>
            <textarea className="min-h-[90px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColReason")} value={riskListForm.reason} onChange={(event) => setRiskListForm((current) => ({ ...current, reason: event.target.value }))} />
            <button className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white" onClick={() => void runAction(tx("风控名单已保存", "Risk list saved"), async () => { await fetchJson("/api/market-admin/admin/marketing/risk-lists", { method: "POST", body: JSON.stringify(riskListForm) }); await Promise.all([loadBootstrap(), loadRiskCenter()]); setRiskListForm((current) => ({ ...current, targetValue: "", reason: "" })) })}>{t("marketRiskSaveList")}</button>
          </div>
          <div className="mt-4 space-y-2">
            {riskListRows.map((row) => (
              <div key={row.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900">{row.targetValue}</div>
                    <div className="text-xs text-gray-500">{row.listType} · {row.reason}</div>
                  </div>
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusClass(row.status)}`}>{row.status}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
        <Section
          title={t("marketRiskEventsTitle")}
          description={t("marketRiskEventsDesc")}
          actions={
            <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={riskStatus} onChange={(event) => { setRiskStatus(event.target.value); void loadRiskCenter(event.target.value) }}>
              <option value="all">{tx("全部状态", "All statuses")}</option>
              <option value="open">open</option>
              <option value="reviewing">reviewing</option>
              <option value="frozen">frozen</option>
              <option value="resolved">resolved</option>
              <option value="dismissed">dismissed</option>
            </select>
          }
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-3 py-2">{t("marketColRiskCode")}</th>
                  <th className="px-3 py-2">{tx("风险级别", "Severity")}</th>
                  <th className="px-3 py-2">{t("marketColDescription")}</th>
                  <th className="px-3 py-2">{t("marketColTime")}</th>
                  <th className="px-3 py-2">{t("marketColActions")}</th>
                </tr>
              </thead>
              <tbody>
                {riskEventRows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-900">{row.riskCode}</div>
                      <div className="text-xs text-gray-400">{row.userId || "-"}</div>
                    </td>
                    <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs ${severityClass(row.severity)}`}>{row.severity}</span></td>
                    <td className="px-3 py-3 text-gray-600">
                      <div>{row.description}</div>
                      <div className="mt-1 text-xs text-gray-400">{row.deviceFingerprint || row.ipHash || "-"}</div>
                    </td>
                    <td className="px-3 py-3 text-gray-500">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {(["resolved", "dismissed", "frozen"] as const).map((status) => (
                          <button
                            key={status}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700"
                            onClick={() =>
                              void runAction(tx("风险事件已更新", "Risk event updated"), async () => {
                                const reviewNote = window.prompt(tx("请输入处置备注（可选）", "Add an optional resolution note")) || ""
                                await fetchJson(`/api/market-admin/admin/marketing/risk-events/${row.id}/resolve`, { method: "POST", body: JSON.stringify({ status, reviewNote }) })
                                await Promise.all([loadBootstrap(), loadRiskCenter()])
                              })
                            }
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-[#f5f6f8] text-gray-800">
      {notice ? <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm text-white shadow-lg">{notice}</div> : null}
      {inviteQrTarget ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4" onClick={() => setInviteQrTarget(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-gray-900">{inviteQrTarget.title}</div>
                <div className="mt-1 text-sm text-gray-500">{inviteQrTarget.helper}</div>
              </div>
              <button type="button" className="rounded-xl border border-gray-200 p-2 text-gray-500" onClick={() => setInviteQrTarget(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-center rounded-3xl border border-gray-100 bg-gray-50 p-5">
              <QRCodeSVG value={inviteQrTarget.shareUrl} size={220} level="H" includeMargin />
            </div>
            <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
              <div className="text-xs text-gray-500">{tx("邀请码", "Invite code")}</div>
              <div className="mt-1 break-all text-base font-semibold text-gray-900">{inviteQrTarget.code}</div>
              <div className="mt-3 text-xs text-gray-500">{tx("分享链接", "Share link")}</div>
              <div className="mt-1 break-all text-sm text-gray-600">{inviteQrTarget.shareUrl}</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                onClick={() => void copyToClipboard(inviteQrTarget.code, tx("邀请码已复制", "Invite code copied"))}
              >
                {tx("复制邀请码", "Copy invite code")}
              </button>
              <button
                type="button"
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                onClick={() => void copyToClipboard(inviteQrTarget.shareUrl, tx("邀请链接已复制", "Invite link copied"))}
              >
                {tx("复制链接", "Copy link")}
              </button>
              <button
                type="button"
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                onClick={() => void shareInviteTarget(inviteQrTarget)}
              >
                {tx("系统分享", "Share")}
              </button>
              <button
                type="button"
                className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white"
                onClick={() => window.open(inviteQrTarget.shareUrl, "_blank", "noopener,noreferrer")}
              >
                {tx("打开邀请页", "Open invite page")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-gray-200 bg-[#f8f9fa]">
        <div className="p-4">
          <div className="rounded-xl border border-gray-200 bg-[#f0f2f5] p-3">
            <h1 className="flex items-center text-[15px] font-bold text-gray-900"><Activity className="mr-2 h-4 w-4 text-blue-600" />{tx("营销中台", "Marketing Center")}</h1>
            <p className="mt-1 text-xs text-gray-500">{tx("统一钱包与增长运营", "Unified wallet and growth ops")}</p>
          </div>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-3">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = tab === item.key
            return (
              <button key={item.key} onClick={() => setTab(item.key)} className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[13.5px] ${active ? "bg-[#1a1a1a] text-white" : "text-gray-600 hover:bg-gray-200 hover:text-gray-900"}`}>
                <span className="flex items-center"><Icon className="mr-2 h-4 w-4" />{item.label}</span>
                {item.key === "withdraw" && pendingWithdrawalCount > 0 ? <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] text-white">{pendingWithdrawalCount}</span> : null}
              </button>
            )
          })}
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
          <div className="font-bold text-gray-800">{navItems.find((item) => item.key === tab)?.label}</div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500"><Shield className="mr-1 inline h-3.5 w-3.5" />{t("marketRegionLabel")}: {region}</div>
            <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600" onClick={() => router.push("/market")}><ArrowLeft className="h-3.5 w-3.5" />{t("marketBackToNav")}</button>
            <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600" onClick={() => void runAction(tx("数据已刷新", "Refreshed"), async () => { await Promise.all([loadBootstrap(), loadFission(fissionPage)]) })}><RefreshCw className={`h-3.5 w-3.5 ${busyLabel ? "animate-spin" : ""}`} />{t("marketRefresh")}</button>
            <button className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white" onClick={() => void runAction(tx("已退出营销后台", "Signed out"), async () => { await fetchJson("/api/market-admin/auth/logout", { method: "POST" }); router.push("/market/login") })}><LogOut className="h-3.5 w-3.5" />{t("marketLogout")}</button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6">
          {busyLabel ? <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{busyLabel}</div> : null}
          {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          {loading ? <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl border border-gray-200 bg-white" />)}</div><div className="h-64 animate-pulse rounded-2xl border border-gray-200 bg-white" /></div> : tab === "overview" ? renderOverview() : tab === "assets" ? renderAssets() : tab === "fission" ? renderFission() : tab === "activity" ? renderActivity() : tab === "withdraw" ? renderWithdraw() : tab === "reports" ? renderReports() : renderRisk()}
        </div>
      </main>
    </div>
  )
}

