"use client"

import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Database,
  DollarSign,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  Target,
  TrendingUp,
  Users,
} from "lucide-react"
import { getTranslation, translations, type Language } from "@/lib/i18n"
import type {
  MarketingAccountBundle,
  MarketingAssetLedger,
  MarketingAssetType,
  MarketingCampaign,
  MarketingEventType,
  MarketingListResult,
  MarketingOverview,
  MarketingProduct,
  MarketingReports,
  MarketingRiskEvent,
  MarketingRiskListItem,
  MarketingSetting,
  MarketingTaskTemplate,
  MarketingWithdrawal,
} from "@/lib/market/marketing-types"

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
  adInventory: {
    inventory: { total: number; active: number; positions: string[]; totalImpressions: number; totalClicks: number }
    templates: MarketingTaskTemplate[]
  }
  dashboardSummary: DashboardSummary
  constants: { assetTypes: MarketingAssetType[]; products: MarketingProduct[]; eventTypes: MarketingEventType[] }
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatDateTime(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "-"
  return date.toLocaleString()
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
  const [simulationOutput, setSimulationOutput] = useState("")

  const [assetQuery, setAssetQuery] = useState("")
  const [ledgerAssetType, setLedgerAssetType] = useState("all")
  const [withdrawalStatus, setWithdrawalStatus] = useState("all")
  const [riskStatus, setRiskStatus] = useState("all")
  const [fissionSearch, setFissionSearch] = useState("")
  const [fissionStatus, setFissionStatus] = useState("all")
  const [fissionDatePreset, setFissionDatePreset] = useState("all")
  const [fissionDate, setFissionDate] = useState("")
  const [fissionPage, setFissionPage] = useState(1)

  const [campaignForm, setCampaignForm] = useState({ id: "", slug: "", name: "", description: "", campaignType: "referral", productScope: "orbitchat,ai", highlight: "", status: "draft" })
  const [taskForm, setTaskForm] = useState({ id: "", slug: "", name: "", description: "", campaignSlug: "", taskType: "manual", eventType: "user.login", rewardAsset: "points", rewardAmount: "10", rewardRecipient: "actor", thresholdValue: "1", thresholdUnit: "times", recurrence: "repeatable", products: "orbitchat", status: "draft" })
  const [adjustForm, setAdjustForm] = useState({ userId: "", assetType: "points", amount: "10", remark: "" })
  const [withdrawalForm, setWithdrawalForm] = useState({ userId: "", amount: "20", channel: "manual" })
  const [riskListForm, setRiskListForm] = useState({ listType: "user", targetValue: "", reason: "" })
  const [simulationForm, setSimulationForm] = useState({ product: "orbitchat", eventType: "user.login", userId: "", source: "market-console", deviceFingerprint: "", ipHash: "", payload: '{\n  "source": "market-console"\n}' })

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

  const loadBootstrap = async () => {
    const response = await fetchJson<{ success: true; bootstrap: BootstrapData }>("/api/market/admin/marketing/bootstrap")
    setBootstrap(response.bootstrap)
    setAccounts(response.bootstrap.accounts)
    setLedgers(response.bootstrap.ledgers)
    setCampaigns(response.bootstrap.campaigns)
    setTaskTemplates(response.bootstrap.taskTemplates)
    setWithdrawals(response.bootstrap.withdrawals)
    setRiskEvents(response.bootstrap.riskEvents)
    setRiskLists(response.bootstrap.riskLists)
    if (!taskForm.campaignSlug && response.bootstrap.campaigns[0]?.slug) {
      setTaskForm((current) => ({ ...current, campaignSlug: response.bootstrap.campaigns[0].slug }))
    }
  }

  const buildFissionQuery = (pageOverride?: number) => {
    const params = new URLSearchParams({ search: fissionSearch, status: fissionStatus, datePreset: fissionDatePreset, page: String(pageOverride ?? fissionPage), limit: "8" })
    if (fissionDate) params.set("date", fissionDate)
    return params
  }

  const loadFission = async (pageOverride?: number) => {
    const response = await fetchJson<{ success: true; fission: FissionData }>(`/api/market/admin/marketing/fission?${buildFissionQuery(pageOverride).toString()}`)
    setFission(response.fission)
  }

  const loadAccounts = async () => {
    const params = new URLSearchParams({ page: "1", limit: "10" })
    if (assetQuery.trim()) params.set("query", assetQuery.trim())
    const response = await fetchJson<{ success: true; accounts: MarketingListResult<MarketingAccountBundle> }>(`/api/market/admin/marketing/accounts?${params.toString()}`)
    setAccounts(response.accounts)
  }

  const loadLedgers = async () => {
    const params = new URLSearchParams({ page: "1", limit: "10" })
    if (assetQuery.trim()) params.set("query", assetQuery.trim())
    if (ledgerAssetType !== "all") params.set("assetType", ledgerAssetType)
    const response = await fetchJson<{ success: true; ledgers: MarketingListResult<MarketingAssetLedger> }>(`/api/market/admin/marketing/ledgers?${params.toString()}`)
    setLedgers(response.ledgers)
  }

  const loadCampaigns = async () => {
    const response = await fetchJson<{ success: true; campaigns: MarketingCampaign[] }>("/api/market/admin/marketing/campaigns")
    setCampaigns(response.campaigns)
  }

  const loadTaskTemplates = async () => {
    const response = await fetchJson<{ success: true; taskTemplates: MarketingTaskTemplate[] }>("/api/market/admin/marketing/task-templates")
    setTaskTemplates(response.taskTemplates)
  }

  const loadWithdrawals = async (nextStatus = withdrawalStatus) => {
    const query = nextStatus === "all" ? "" : `?status=${nextStatus}&page=1&limit=10`
    const response = await fetchJson<{ success: true; withdrawals: MarketingListResult<MarketingWithdrawal> }>(`/api/market/admin/marketing/withdrawals${query}`)
    setWithdrawals(response.withdrawals)
  }

  const loadRiskCenter = async (nextStatus = riskStatus) => {
    const eventQuery = nextStatus === "all" ? "?page=1&limit=10" : `?status=${nextStatus}&page=1&limit=10`
    const [eventsResponse, listsResponse] = await Promise.all([
      fetchJson<{ success: true; riskEvents: MarketingListResult<MarketingRiskEvent> }>(`/api/market/admin/marketing/risk-events${eventQuery}`),
      fetchJson<{ success: true; riskLists: MarketingListResult<MarketingRiskListItem> }>("/api/market/admin/marketing/risk-lists?page=1&limit=10"),
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

  const renderOverview = () => {
    if (!bootstrap) return <Section title={t("marketLoadFailed")}><div className="text-sm text-gray-500">{t("marketLoadFailed")}</div></Section>
    const summary = bootstrap.dashboardSummary
    const trendMax = Math.max(...summary.trends.map((item) => item.invites || 0), 1)
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Stat title={tx("今日新增用户", "New users today")} value={formatNumber(summary.today.newUsers)} />
          <Stat title={tx("今日发放现金", "Cash issued today")} value={`¥${formatNumber(summary.today.cashIssued)}`} />
          <Stat title={tx("今日发放积分", "Points issued today")} value={formatNumber(summary.today.pointsIssued)} />
          <Stat title={tx("提现待审核", "Pending withdrawals")} value={`${summary.today.pendingWithdrawalCount} / ¥${formatNumber(summary.today.pendingWithdrawalAmount)}`} />
        </div>
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
                await fetchJson("/api/market/admin/marketing/accounts/adjust", { method: "POST", body: JSON.stringify({ userId: adjustForm.userId, assetType: adjustForm.assetType, amount: Number(adjustForm.amount || 0), remark: adjustForm.remark }) })
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
        title={tx("裂变与拉新工作台", "Fission workbench")}
        description={tx("筛选邀请关系、渠道与头部邀请人", "Filter referral relations, channels and top inviters")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
        </div>
        {fission ? (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
            <div>{tx("共", "Total")} {fission.relations.total} {tx("条关系", "relations")}</div>
            <div className="flex items-center gap-2">
              <button className="rounded-lg border border-gray-200 px-3 py-2 disabled:opacity-40" disabled={fission.relations.page <= 1} onClick={() => { const next = Math.max(1, fission.relations.page - 1); setFissionPage(next); void loadFission(next) }}>{tx("上一页", "Prev")}</button>
              <span>{fission.relations.page} / {Math.max(Math.ceil(fission.relations.total / fission.relations.limit), 1)}</span>
              <button className="rounded-lg border border-gray-200 px-3 py-2 disabled:opacity-40" disabled={fission.relations.page >= Math.max(Math.ceil(fission.relations.total / fission.relations.limit), 1)} onClick={() => { const next = fission.relations.page + 1; setFissionPage(next); void loadFission(next) }}>{tx("下一页", "Next")}</button>
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  )

  const renderActivity = () => (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Section title={t("marketCampaignsTitle")} description={t("marketCampaignsDesc")}>
          <div className="grid gap-3">
            <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColSlug")} value={campaignForm.slug} onChange={(event) => setCampaignForm((current) => ({ ...current, slug: event.target.value }))} />
            <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColName")} value={campaignForm.name} onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))} />
            <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColHighlight")} value={campaignForm.highlight} onChange={(event) => setCampaignForm((current) => ({ ...current, highlight: event.target.value }))} />
            <textarea className="min-h-[90px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColDescription")} value={campaignForm.description} onChange={(event) => setCampaignForm((current) => ({ ...current, description: event.target.value }))} />
            <div className="grid gap-3 md:grid-cols-3">
              <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColType")} value={campaignForm.campaignType} onChange={(event) => setCampaignForm((current) => ({ ...current, campaignType: event.target.value }))} />
              <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColProducts")} value={campaignForm.productScope} onChange={(event) => setCampaignForm((current) => ({ ...current, productScope: event.target.value }))} />
              <select className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" value={campaignForm.status} onChange={(event) => setCampaignForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="archived">archived</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white" onClick={() => void runAction(tx("活动已保存", "Campaign saved"), async () => { await fetchJson("/api/market/admin/marketing/campaigns", { method: "POST", body: JSON.stringify({ id: campaignForm.id || undefined, slug: campaignForm.slug, name: campaignForm.name, description: campaignForm.description, campaignType: campaignForm.campaignType, productScope: campaignForm.productScope.split(",").map((item) => item.trim()), highlight: campaignForm.highlight, status: campaignForm.status }) }); await Promise.all([loadBootstrap(), loadCampaigns()]); setCampaignForm({ id: "", slug: "", name: "", description: "", campaignType: "referral", productScope: "orbitchat,ai", highlight: "", status: "draft" }) })}>{t("marketCampaignsSaveAction")}</button>
              <button className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600" onClick={() => setCampaignForm({ id: "", slug: "", name: "", description: "", campaignType: "referral", productScope: "orbitchat,ai", highlight: "", status: "draft" })}>{tx("清空", "Reset")}</button>
            </div>
          </div>
        </Section>
        <Section title={t("marketTasksTitle")} description={t("marketTasksDesc")}>
          <div className="grid gap-3">
            <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColSlug")} value={taskForm.slug} onChange={(event) => setTaskForm((current) => ({ ...current, slug: event.target.value }))} />
            <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColName")} value={taskForm.name} onChange={(event) => setTaskForm((current) => ({ ...current, name: event.target.value }))} />
            <textarea className="min-h-[90px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColDescription")} value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} />
            <div className="grid gap-3 md:grid-cols-2">
              <select className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" value={taskForm.campaignSlug} onChange={(event) => setTaskForm((current) => ({ ...current, campaignSlug: event.target.value }))}>
                {(campaigns.length ? campaigns : bootstrap?.campaigns || []).map((campaign) => <option key={campaign.slug} value={campaign.slug}>{campaign.slug}</option>)}
              </select>
              <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColTaskType")} value={taskForm.taskType} onChange={(event) => setTaskForm((current) => ({ ...current, taskType: event.target.value }))} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <select className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" value={taskForm.eventType} onChange={(event) => setTaskForm((current) => ({ ...current, eventType: event.target.value }))}>
                {(bootstrap?.constants.eventTypes || ["user.login"]).map((eventType) => <option key={eventType} value={eventType}>{eventType}</option>)}
              </select>
              <select className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" value={taskForm.rewardAsset} onChange={(event) => setTaskForm((current) => ({ ...current, rewardAsset: event.target.value }))}>
                {(bootstrap?.constants.assetTypes || ["points"]).map((assetType) => <option key={assetType} value={assetType}>{assetType}</option>)}
              </select>
              <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColRewardAmount")} value={taskForm.rewardAmount} onChange={(event) => setTaskForm((current) => ({ ...current, rewardAmount: event.target.value }))} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColRewardRecipient")} value={taskForm.rewardRecipient} onChange={(event) => setTaskForm((current) => ({ ...current, rewardRecipient: event.target.value }))} />
              <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColThreshold")} value={taskForm.thresholdValue} onChange={(event) => setTaskForm((current) => ({ ...current, thresholdValue: event.target.value }))} />
              <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColProducts")} value={taskForm.products} onChange={(event) => setTaskForm((current) => ({ ...current, products: event.target.value }))} />
            </div>
            <div className="flex gap-2">
              <button className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white" onClick={() => void runAction(tx("任务模板已保存", "Task template saved"), async () => { await fetchJson("/api/market/admin/marketing/task-templates", { method: "POST", body: JSON.stringify({ id: taskForm.id || undefined, slug: taskForm.slug, name: taskForm.name, description: taskForm.description, campaignSlug: taskForm.campaignSlug, taskType: taskForm.taskType, eventType: taskForm.eventType, rewardAsset: taskForm.rewardAsset, rewardAmount: Number(taskForm.rewardAmount || 0), rewardRecipient: taskForm.rewardRecipient, thresholdValue: Number(taskForm.thresholdValue || 1), thresholdUnit: taskForm.thresholdUnit, recurrence: taskForm.recurrence, products: taskForm.products.split(",").map((item) => item.trim()), status: taskForm.status }) }); await Promise.all([loadBootstrap(), loadTaskTemplates()]); setTaskForm((current) => ({ ...current, id: "", slug: "", name: "", description: "", rewardAmount: "10", thresholdValue: "1" })) })}>{t("marketTasksSaveAction")}</button>
              <button className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600" onClick={() => setTaskForm((current) => ({ ...current, id: "", slug: "", name: "", description: "", rewardAmount: "10", thresholdValue: "1" }))}>{tx("清空", "Reset")}</button>
            </div>
          </div>
        </Section>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Section title={tx("当前活动列表", "Campaign list")} description={tx("点击任意活动回填表单继续编辑", "Click a campaign to load it into the editor")}>
          <div className="space-y-2">
            {campaigns.map((campaign) => (
              <button key={campaign.id} className="w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-left" onClick={() => setCampaignForm({ id: campaign.id, slug: campaign.slug, name: campaign.name, description: campaign.description, campaignType: campaign.campaignType, productScope: campaign.productScope.join(","), highlight: campaign.highlight, status: campaign.status })}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900">{campaign.name}</div>
                    <div className="mt-1 text-xs text-gray-500">{campaign.slug} · {campaign.highlight || "-"}</div>
                  </div>
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusClass(campaign.status)}`}>{campaign.status}</span>
                </div>
              </button>
            ))}
          </div>
        </Section>
        <Section title={t("marketSimulationTitle")} description={tx("事件模拟作为次级运营动作放在活动页", "Event simulation is exposed as a secondary ops panel")}>
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <select className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" value={simulationForm.product} onChange={(event) => setSimulationForm((current) => ({ ...current, product: event.target.value }))}>
                {(bootstrap?.constants.products || ["orbitchat"]).map((product) => <option key={product} value={product}>{product}</option>)}
              </select>
              <select className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" value={simulationForm.eventType} onChange={(event) => setSimulationForm((current) => ({ ...current, eventType: event.target.value }))}>
                {(bootstrap?.constants.eventTypes || ["user.login"]).map((eventType) => <option key={eventType} value={eventType}>{eventType}</option>)}
              </select>
            </div>
            <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColUserId")} value={simulationForm.userId} onChange={(event) => setSimulationForm((current) => ({ ...current, userId: event.target.value }))} />
            <textarea className="min-h-[120px] rounded-xl border border-gray-200 px-3 py-2.5 font-mono text-sm" value={simulationForm.payload} onChange={(event) => setSimulationForm((current) => ({ ...current, payload: event.target.value }))} />
            <button className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white" onClick={() => void runAction(tx("事件模拟已完成", "Simulation completed"), async () => { const response = await fetchJson<{ success: true; result: unknown }>("/api/market/admin/marketing/simulate", { method: "POST", body: JSON.stringify({ product: simulationForm.product, eventType: simulationForm.eventType, userId: simulationForm.userId, source: simulationForm.source, deviceFingerprint: simulationForm.deviceFingerprint || null, ipHash: simulationForm.ipHash || null, payload: JSON.parse(simulationForm.payload || "{}") }) }); setSimulationOutput(JSON.stringify(response.result, null, 2)); await Promise.all([loadBootstrap(), loadFission(fissionPage), loadRiskCenter(riskStatus)]) })}>{t("marketSimulationRun")}</button>
            {simulationOutput ? <pre className="max-h-72 overflow-auto rounded-xl bg-gray-950 p-4 text-xs text-gray-100">{simulationOutput}</pre> : null}
          </div>
        </Section>
      </div>
    </div>
  )
  const renderWithdraw = () => (
    <div className="space-y-6">
      <Section title={tx("提现审批工单池", "Withdrawal work orders")} description={tx("现金满 20 元门槛后进入人工审核", "Cash-outs require the 20-unit threshold and manual review")}>
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
          <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColUserId")} value={withdrawalForm.userId} onChange={(event) => setWithdrawalForm((current) => ({ ...current, userId: event.target.value }))} />
          <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColAmount")} value={withdrawalForm.amount} onChange={(event) => setWithdrawalForm((current) => ({ ...current, amount: event.target.value }))} />
          <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" placeholder={t("marketColChannel")} value={withdrawalForm.channel} onChange={(event) => setWithdrawalForm((current) => ({ ...current, channel: event.target.value }))} />
          <button className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white" onClick={() => void runAction(tx("提现工单已创建", "Withdrawal request created"), async () => { await fetchJson("/api/market/admin/marketing/withdrawals", { method: "POST", body: JSON.stringify({ userId: withdrawalForm.userId, amount: Number(withdrawalForm.amount || 0), channel: withdrawalForm.channel }) }); await Promise.all([loadBootstrap(), loadWithdrawals()]) })}>{t("marketWithdrawalsCreateAction")}</button>
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
                  <td className="px-3 py-3 font-medium text-gray-900">¥{formatNumber(row.amount)}</td>
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
                              await fetchJson(`/api/market/admin/marketing/withdrawals/${row.id}/review`, { method: "POST", body: JSON.stringify({ status, reviewNote }) })
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
                  <td className="px-3 py-3 text-gray-600">¥{formatNumber(row.cashCost)}</td>
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
            <button className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white" onClick={() => void runAction(tx("风控名单已保存", "Risk list saved"), async () => { await fetchJson("/api/market/admin/marketing/risk-lists", { method: "POST", body: JSON.stringify(riskListForm) }); await Promise.all([loadBootstrap(), loadRiskCenter()]); setRiskListForm((current) => ({ ...current, targetValue: "", reason: "" })) })}>{t("marketRiskSaveList")}</button>
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
                                await fetchJson(`/api/market/admin/marketing/risk-events/${row.id}/resolve`, { method: "POST", body: JSON.stringify({ status, reviewNote }) })
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
            <button className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white" onClick={() => void runAction(tx("已退出营销后台", "Signed out"), async () => { await fetchJson("/api/market/auth/logout", { method: "POST" }); router.push("/market/login") })}><LogOut className="h-3.5 w-3.5" />{t("marketLogout")}</button>
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
