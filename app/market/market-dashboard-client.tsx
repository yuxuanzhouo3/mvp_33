"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCcw, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
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

type TabKey =
  | "overview"
  | "assets"
  | "campaigns"
  | "tasks"
  | "referral"
  | "ads"
  | "withdrawals"
  | "risk"
  | "simulate"
  | "reports"

type MarketingBootstrapData = {
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
    inventory: {
      total: number
      active: number
      positions: string[]
      totalImpressions: number
      totalClicks: number
    }
    templates: MarketingTaskTemplate[]
    advertisements: Array<{
      id: string
      title: string
      position: string
      status: string
      priority: number
      impressionCount: number
      clickCount: number
    }>
  }
  referralCompatibility: {
    overview: {
      totalClicks: number
      totalInvites: number
      totalActivated: number
      totalRewardCredits: number
      conversionRate: number
      activationRate: number
    }
    topInviters: Array<{
      inviterUserId: string
      inviterEmail: string | null
      invitedCount: number
      activatedCount: number
      rewardCredits: number
    }>
    relations: {
      rows: Array<{
        relationId: string
        inviterEmail: string | null
        invitedEmail: string | null
        status: string
        createdAt: string
        activatedAt: string | null
      }>
    }
  }
  constants: {
    assetTypes: MarketingAssetType[]
    products: MarketingProduct[]
    eventTypes: MarketingEventType[]
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "-"
  return date.toLocaleString()
}

function formatAmount(value: number) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function parseJsonInput(value: string) {
  if (!value.trim()) return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

function StatCard({ title, value, hint }: { title: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  )
}

function LoadingShell() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}

export function MarketDashboardClient({ region }: { region: "CN" | "INTL" }) {
  const router = useRouter()
  const language: Language = region === "CN" ? "zh" : "en"
  const t = (key: keyof typeof translations.en) => getTranslation(language, key)

  const [tab, setTab] = useState<TabKey>("overview")
  const [bootstrap, setBootstrap] = useState<MarketingBootstrapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [actionLabel, setActionLabel] = useState("")
  const [simulationOutput, setSimulationOutput] = useState("")

  const [settingForm, setSettingForm] = useState({ key: "withdraw_min_amount", value: "20", description: "" })
  const [campaignForm, setCampaignForm] = useState({ slug: "", name: "", campaignType: "marketing", productScope: "orbitchat,ai", highlight: "", status: "draft", description: "" })
  const [taskForm, setTaskForm] = useState({ slug: "", name: "", campaignSlug: "invite-cash-sprint", taskType: "manual", eventType: "user.login", rewardAsset: "points", rewardAmount: "10", rewardRecipient: "actor", thresholdValue: "1", thresholdUnit: "times", dailyLimit: "", lifetimeLimit: "", recurrence: "repeatable", description: "", products: "orbitchat", status: "draft" })
  const [adjustForm, setAdjustForm] = useState({ userId: "", assetType: "points", amount: "10", remark: "" })
  const [withdrawalForm, setWithdrawalForm] = useState({ userId: "", amount: "20", channel: "manual" })
  const [riskListForm, setRiskListForm] = useState({ listType: "user", targetValue: "", reason: "" })
  const [simulationForm, setSimulationForm] = useState({ product: "orbitchat", eventType: "user.login", userId: "", source: "market-console", deviceFingerprint: "", ipHash: "", payload: '{\n  "source": "market-console"\n}' })

  const assetLabels: Record<MarketingAssetType, string> = {
    cash: t("marketAssetCash"),
    points: t("marketAssetPoints"),
    ai_quota: t("marketAssetAiQuota"),
    vip_duration: t("marketAssetVipDuration"),
  }

  const statusLabels = {
    active: t("marketStatusActive"),
    draft: t("marketStatusDraft"),
    paused: t("marketStatusPaused"),
    archived: t("marketStatusArchived"),
    pending: t("marketStatusPending"),
    approved: t("marketStatusApproved"),
    rejected: t("marketStatusRejected"),
    frozen: t("marketStatusFrozen"),
    resolved: t("marketStatusResolved"),
    dismissed: t("marketStatusDismissed"),
    reviewing: t("marketStatusReviewing"),
    processed: t("marketStatusProcessed"),
    risk_blocked: t("marketStatusRiskBlocked"),
    completed: t("marketStatusCompleted"),
    capped: t("marketStatusCapped"),
    in_progress: t("marketStatusInProgress"),
    open: t("marketStatusOpen"),
  } as Record<string, string>

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: t("marketTabOverview") },
    { key: "assets", label: t("marketTabAssets") },
    { key: "campaigns", label: t("marketTabCampaigns") },
    { key: "tasks", label: t("marketTabTasks") },
    { key: "referral", label: t("marketTabReferral") },
    { key: "ads", label: t("marketTabAds") },
    { key: "withdrawals", label: t("marketTabWithdrawals") },
    { key: "risk", label: t("marketTabRisk") },
    { key: "simulate", label: t("marketTabSimulation") },
    { key: "reports", label: t("marketTabReports") },
  ]

  const renderTabContent = () => {
    if (!bootstrap) {
      return <div className="rounded-2xl border bg-background p-10 text-center text-sm text-muted-foreground">{t("marketLoadFailed")}</div>
    }

    if (tab === "overview") {
      return (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title={t("marketOverviewAssetPool")}
              value={formatAmount(
                bootstrap.overview.assetTotals.cash.available +
                  bootstrap.overview.assetTotals.points.available +
                  bootstrap.overview.assetTotals.ai_quota.available +
                  bootstrap.overview.assetTotals.vip_duration.available,
              )}
              hint={t("marketOverviewAssetHint")}
            />
            <StatCard
              title={t("marketOverviewPendingWithdrawals")}
              value={`${bootstrap.overview.pendingWithdrawals.count} / ${formatAmount(bootstrap.overview.pendingWithdrawals.amount)}`}
              hint={t("marketOverviewPendingHint")}
            />
            <StatCard
              title={t("marketOverviewRiskHits")}
              value={bootstrap.overview.riskSummary.openCount + bootstrap.overview.riskSummary.frozenCount}
              hint={t("marketOverviewRiskHint")}
            />
            <StatCard
              title={t("marketOverviewCampaigns")}
              value={bootstrap.overview.campaignSummary.active}
              hint={t("marketOverviewCampaignHint")}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>{t("marketOverviewAssetsTitle")}</CardTitle>
                <CardDescription>{t("marketOverviewAssetsDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {bootstrap.constants.assetTypes.map((assetType) => (
                  <div key={assetType} className="rounded-xl border bg-muted/30 p-4">
                    <div className="text-xs text-muted-foreground">{assetLabels[assetType]}</div>
                    <div className="mt-1 text-xl font-semibold">{formatAmount(bootstrap.overview.assetTotals[assetType].available)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t("marketFrozenLabel")}: {formatAmount(bootstrap.overview.assetTotals[assetType].frozen)}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("marketOverviewTasksTitle")}</CardTitle>
                <CardDescription>{t("marketOverviewTasksDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <StatCard title={t("marketMetricActiveTemplates")} value={bootstrap.overview.taskSummary.activeTemplates} />
                <StatCard title={t("marketMetricParticipants")} value={bootstrap.overview.taskSummary.participants} />
                <StatCard title={t("marketMetricCompletions")} value={bootstrap.overview.taskSummary.completions} />
                <StatCard title={t("marketMetricConversion")} value={`${bootstrap.overview.taskSummary.conversionRate}%`} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("marketOverviewProductsTitle")}</CardTitle>
              <CardDescription>{t("marketOverviewProductsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("marketColProduct")}</TableHead>
                    <TableHead>{t("marketColEvents")}</TableHead>
                    <TableHead>{t("marketColUsers")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bootstrap.overview.productDistribution.map((item) => (
                    <TableRow key={item.product}>
                      <TableCell>{item.product}</TableCell>
                      <TableCell>{item.events}</TableCell>
                      <TableCell>{item.users}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )
    }

    if (tab === "assets") {
      return (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("marketAssetAdjustTitle")}</CardTitle>
              <CardDescription>{t("marketAssetAdjustDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void runMutation(t("marketAssetAdjustAction"), async () => {
                    await requestJson("/api/market/admin/marketing/accounts/adjust", {
                      method: "POST",
                      body: JSON.stringify({
                        userId: adjustForm.userId,
                        assetType: adjustForm.assetType,
                        amount: Number(adjustForm.amount || 0),
                        remark: adjustForm.remark,
                      }),
                    })
                  })
                }}
              >
                <div className="space-y-2">
                  <Label>{t("marketColUserId")}</Label>
                  <Input value={adjustForm.userId} onChange={(event) => setAdjustForm((current) => ({ ...current, userId: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColAsset")}</Label>
                  <Select value={adjustForm.assetType} onValueChange={(value) => setAdjustForm((current) => ({ ...current, assetType: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {bootstrap.constants.assetTypes.map((assetType) => (
                        <SelectItem key={assetType} value={assetType}>
                          {assetLabels[assetType]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColAmount")}</Label>
                  <Input value={adjustForm.amount} onChange={(event) => setAdjustForm((current) => ({ ...current, amount: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColRemark")}</Label>
                  <Input value={adjustForm.remark} onChange={(event) => setAdjustForm((current) => ({ ...current, remark: event.target.value }))} />
                </div>
                <div className="md:col-span-2 xl:col-span-4">
                  <Button type="submit">{t("marketAssetAdjustAction")}</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("marketAssetAccountsTitle")}</CardTitle>
              <CardDescription>{t("marketAssetAccountsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("marketColUser")}</TableHead>
                    <TableHead>{t("marketAssetCash")}</TableHead>
                    <TableHead>{t("marketAssetPoints")}</TableHead>
                    <TableHead>{t("marketAssetAiQuota")}</TableHead>
                    <TableHead>{t("marketAssetVipDuration")}</TableHead>
                    <TableHead>{t("marketColWarnings")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bootstrap.accounts.rows.map((row) => (
                    <TableRow key={row.user.userId}>
                      <TableCell>
                        <div className="font-medium">{row.user.name}</div>
                        <div className="text-xs text-muted-foreground">{row.user.userId}</div>
                      </TableCell>
                      <TableCell>{formatAmount(row.accounts.cash?.availableBalance || 0)}</TableCell>
                      <TableCell>{formatAmount(row.accounts.points?.availableBalance || 0)}</TableCell>
                      <TableCell>{formatAmount(row.accounts.ai_quota?.availableBalance || 0)}</TableCell>
                      <TableCell>{formatAmount(row.accounts.vip_duration?.availableBalance || 0)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.previewWarnings.join(" / ") || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("marketAssetLedgersTitle")}</CardTitle>
              <CardDescription>{t("marketAssetLedgersDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("marketColUserId")}</TableHead>
                    <TableHead>{t("marketColAsset")}</TableHead>
                    <TableHead>{t("marketColAmount")}</TableHead>
                    <TableHead>{t("marketColStatus")}</TableHead>
                    <TableHead>{t("marketColSource")}</TableHead>
                    <TableHead>{t("marketColTime")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bootstrap.ledgers.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.userId}</TableCell>
                      <TableCell>{assetLabels[row.assetType]}</TableCell>
                      <TableCell>
                        {row.direction === "credit" ? "+" : "-"}
                        {formatAmount(row.amount)}
                      </TableCell>
                      <TableCell>{statusLabels[row.status] || row.status}</TableCell>
                      <TableCell>{row.sourceType}</TableCell>
                      <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )
    }

    if (tab === "campaigns") {
      return (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("marketSettingsTitle")}</CardTitle>
              <CardDescription>{t("marketSettingsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("marketColKey")}</TableHead>
                    <TableHead>{t("marketColValue")}</TableHead>
                    <TableHead>{t("marketColDescription")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bootstrap.settings.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.key}</TableCell>
                      <TableCell>{typeof row.value === "object" ? JSON.stringify(row.value) : String(row.value)}</TableCell>
                      <TableCell>{row.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <form
                className="grid gap-3 md:grid-cols-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void runMutation(t("marketSettingsSaveAction"), async () => {
                    await requestJson("/api/market/admin/marketing/settings", {
                      method: "POST",
                      body: JSON.stringify({
                        key: settingForm.key,
                        value: Number.isNaN(Number(settingForm.value)) ? settingForm.value : Number(settingForm.value),
                        description: settingForm.description,
                      }),
                    })
                  })
                }}
              >
                <div className="space-y-2">
                  <Label>{t("marketColKey")}</Label>
                  <Input value={settingForm.key} onChange={(event) => setSettingForm((current) => ({ ...current, key: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColValue")}</Label>
                  <Input value={settingForm.value} onChange={(event) => setSettingForm((current) => ({ ...current, value: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColDescription")}</Label>
                  <Input value={settingForm.description} onChange={(event) => setSettingForm((current) => ({ ...current, description: event.target.value }))} />
                </div>
                <div className="md:col-span-3">
                  <Button type="submit">{t("marketSettingsSaveAction")}</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("marketCampaignsTitle")}</CardTitle>
              <CardDescription>{t("marketCampaignsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {bootstrap.campaigns.map((campaign) => (
                  <div key={campaign.slug} className="rounded-xl border bg-muted/30 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{campaign.name}</div>
                      <Badge variant="secondary">{statusLabels[campaign.status] || campaign.status}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{campaign.highlight}</div>
                    <div className="mt-3 text-xs">{campaign.productScope.join(", ")}</div>
                  </div>
                ))}
              </div>

              <form
                className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void runMutation(t("marketCampaignsSaveAction"), async () => {
                    await requestJson("/api/market/admin/marketing/campaigns", {
                      method: "POST",
                      body: JSON.stringify({
                        slug: campaignForm.slug,
                        name: campaignForm.name,
                        campaignType: campaignForm.campaignType,
                        productScope: campaignForm.productScope
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                        highlight: campaignForm.highlight,
                        status: campaignForm.status,
                        description: campaignForm.description,
                      }),
                    })
                  })
                }}
              >
                <div className="space-y-2">
                  <Label>{t("marketColSlug")}</Label>
                  <Input value={campaignForm.slug} onChange={(event) => setCampaignForm((current) => ({ ...current, slug: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColName")}</Label>
                  <Input value={campaignForm.name} onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColType")}</Label>
                  <Input value={campaignForm.campaignType} onChange={(event) => setCampaignForm((current) => ({ ...current, campaignType: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColProducts")}</Label>
                  <Input value={campaignForm.productScope} onChange={(event) => setCampaignForm((current) => ({ ...current, productScope: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColHighlight")}</Label>
                  <Input value={campaignForm.highlight} onChange={(event) => setCampaignForm((current) => ({ ...current, highlight: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColStatus")}</Label>
                  <Select value={campaignForm.status} onValueChange={(value) => setCampaignForm((current) => ({ ...current, status: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["draft", "active", "paused", "archived"].map((item) => (
                        <SelectItem key={item} value={item}>
                          {statusLabels[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2 xl:col-span-4">
                  <Label>{t("marketColDescription")}</Label>
                  <Input value={campaignForm.description} onChange={(event) => setCampaignForm((current) => ({ ...current, description: event.target.value }))} />
                </div>
                <div className="md:col-span-2 xl:col-span-4">
                  <Button type="submit">{t("marketCampaignsSaveAction")}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )
    }

    if (tab === "tasks") {
      return (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("marketTasksTitle")}</CardTitle>
              <CardDescription>{t("marketTasksDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("marketColName")}</TableHead>
                    <TableHead>{t("marketColEventType")}</TableHead>
                    <TableHead>{t("marketColReward")}</TableHead>
                    <TableHead>{t("marketColProducts")}</TableHead>
                    <TableHead>{t("marketColStatus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bootstrap.taskTemplates.map((row) => (
                    <TableRow key={row.slug}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.eventType}</TableCell>
                      <TableCell>
                        {formatAmount(row.rewardAmount)} {assetLabels[row.rewardAsset]}
                      </TableCell>
                      <TableCell>{row.products.join(", ")}</TableCell>
                      <TableCell>{statusLabels[row.status] || row.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("marketTasksFormTitle")}</CardTitle>
              <CardDescription>{t("marketTasksFormDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void runMutation(t("marketTasksSaveAction"), async () => {
                    await requestJson("/api/market/admin/marketing/task-templates", {
                      method: "POST",
                      body: JSON.stringify({
                        slug: taskForm.slug,
                        name: taskForm.name,
                        campaignSlug: taskForm.campaignSlug,
                        taskType: taskForm.taskType,
                        eventType: taskForm.eventType,
                        rewardAsset: taskForm.rewardAsset,
                        rewardAmount: Number(taskForm.rewardAmount || 0),
                        rewardRecipient: taskForm.rewardRecipient,
                        thresholdValue: Number(taskForm.thresholdValue || 1),
                        thresholdUnit: taskForm.thresholdUnit,
                        dailyLimit: taskForm.dailyLimit ? Number(taskForm.dailyLimit) : null,
                        lifetimeLimit: taskForm.lifetimeLimit ? Number(taskForm.lifetimeLimit) : null,
                        recurrence: taskForm.recurrence,
                        description: taskForm.description,
                        products: taskForm.products
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                        status: taskForm.status,
                      }),
                    })
                  })
                }}
              >
                <div className="space-y-2">
                  <Label>{t("marketColSlug")}</Label>
                  <Input value={taskForm.slug} onChange={(event) => setTaskForm((current) => ({ ...current, slug: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColName")}</Label>
                  <Input value={taskForm.name} onChange={(event) => setTaskForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColCampaignSlug")}</Label>
                  <Input value={taskForm.campaignSlug} onChange={(event) => setTaskForm((current) => ({ ...current, campaignSlug: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColTaskType")}</Label>
                  <Input value={taskForm.taskType} onChange={(event) => setTaskForm((current) => ({ ...current, taskType: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColEventType")}</Label>
                  <Select value={taskForm.eventType} onValueChange={(value) => setTaskForm((current) => ({ ...current, eventType: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {bootstrap.constants.eventTypes.map((eventType) => (
                        <SelectItem key={eventType} value={eventType}>
                          {eventType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColRewardAsset")}</Label>
                  <Select value={taskForm.rewardAsset} onValueChange={(value) => setTaskForm((current) => ({ ...current, rewardAsset: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {bootstrap.constants.assetTypes.map((assetType) => (
                        <SelectItem key={assetType} value={assetType}>
                          {assetLabels[assetType]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColRewardAmount")}</Label>
                  <Input value={taskForm.rewardAmount} onChange={(event) => setTaskForm((current) => ({ ...current, rewardAmount: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColRewardRecipient")}</Label>
                  <Input value={taskForm.rewardRecipient} onChange={(event) => setTaskForm((current) => ({ ...current, rewardRecipient: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColThreshold")}</Label>
                  <Input value={taskForm.thresholdValue} onChange={(event) => setTaskForm((current) => ({ ...current, thresholdValue: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColProducts")}</Label>
                  <Input value={taskForm.products} onChange={(event) => setTaskForm((current) => ({ ...current, products: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColDailyLimit")}</Label>
                  <Input value={taskForm.dailyLimit} onChange={(event) => setTaskForm((current) => ({ ...current, dailyLimit: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColRecurrence")}</Label>
                  <Input value={taskForm.recurrence} onChange={(event) => setTaskForm((current) => ({ ...current, recurrence: event.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-2 xl:col-span-4">
                  <Label>{t("marketColDescription")}</Label>
                  <Input value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} />
                </div>
                <div className="md:col-span-2 xl:col-span-4">
                  <Button type="submit">{t("marketTasksSaveAction")}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )
    }

    if (tab === "referral") {
      return (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard title={t("marketReferralClicks")} value={bootstrap.referralCompatibility.overview.totalClicks} />
            <StatCard title={t("marketReferralInvites")} value={bootstrap.referralCompatibility.overview.totalInvites} />
            <StatCard title={t("marketReferralActivated")} value={bootstrap.referralCompatibility.overview.totalActivated} />
            <StatCard
              title={t("marketReferralCredits")}
              value={formatAmount(bootstrap.referralCompatibility.overview.totalRewardCredits)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("marketReferralTopTitle")}</CardTitle>
              <CardDescription>{t("marketReferralTopDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("marketColInviter")}</TableHead>
                    <TableHead>{t("marketReferralInvites")}</TableHead>
                    <TableHead>{t("marketReferralActivated")}</TableHead>
                    <TableHead>{t("marketReferralCredits")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bootstrap.referralCompatibility.topInviters.map((row) => (
                    <TableRow key={row.inviterUserId}>
                      <TableCell>{row.inviterEmail || row.inviterUserId}</TableCell>
                      <TableCell>{row.invitedCount}</TableCell>
                      <TableCell>{row.activatedCount}</TableCell>
                      <TableCell>{formatAmount(row.rewardCredits)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("marketReferralRelationTitle")}</CardTitle>
              <CardDescription>{t("marketReferralRelationDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("marketColInviter")}</TableHead>
                    <TableHead>{t("marketColInvitee")}</TableHead>
                    <TableHead>{t("marketColStatus")}</TableHead>
                    <TableHead>{t("marketColTime")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bootstrap.referralCompatibility.relations.rows.map((row) => (
                    <TableRow key={row.relationId}>
                      <TableCell>{row.inviterEmail || "-"}</TableCell>
                      <TableCell>{row.invitedEmail || "-"}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )
    }

    if (tab === "ads") {
      return (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard title={t("marketAdsInventoryTotal")} value={bootstrap.adInventory.inventory.total} />
            <StatCard title={t("marketAdsInventoryActive")} value={bootstrap.adInventory.inventory.active} />
            <StatCard title={t("marketAdsImpressions")} value={bootstrap.adInventory.inventory.totalImpressions} />
            <StatCard title={t("marketAdsClicks")} value={bootstrap.adInventory.inventory.totalClicks} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("marketAdsTemplatesTitle")}</CardTitle>
              <CardDescription>{t("marketAdsTemplatesDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("marketColName")}</TableHead>
                    <TableHead>{t("marketColEventType")}</TableHead>
                    <TableHead>{t("marketColReward")}</TableHead>
                    <TableHead>{t("marketColStatus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bootstrap.adInventory.templates.map((row) => (
                    <TableRow key={row.slug}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.eventType}</TableCell>
                      <TableCell>
                        {formatAmount(row.rewardAmount)} {assetLabels[row.rewardAsset]}
                      </TableCell>
                      <TableCell>{statusLabels[row.status] || row.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("marketAdsInventoryTitle")}</CardTitle>
              <CardDescription>{t("marketAdsInventoryDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("marketColName")}</TableHead>
                    <TableHead>{t("marketColPosition")}</TableHead>
                    <TableHead>{t("marketColStatus")}</TableHead>
                    <TableHead>{t("marketAdsImpressions")}</TableHead>
                    <TableHead>{t("marketAdsClicks")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bootstrap.adInventory.advertisements.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.title}</TableCell>
                      <TableCell>{row.position}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell>{row.impressionCount}</TableCell>
                      <TableCell>{row.clickCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )
    }

    if (tab === "withdrawals") {
      return (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("marketWithdrawalsTitle")}</CardTitle>
              <CardDescription>{t("marketWithdrawalsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3 md:grid-cols-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void runMutation(t("marketWithdrawalsCreateAction"), async () => {
                    await requestJson("/api/market/admin/marketing/withdrawals", {
                      method: "POST",
                      body: JSON.stringify({
                        userId: withdrawalForm.userId,
                        amount: Number(withdrawalForm.amount || 0),
                        channel: withdrawalForm.channel,
                      }),
                    })
                  })
                }}
              >
                <div className="space-y-2">
                  <Label>{t("marketColUserId")}</Label>
                  <Input value={withdrawalForm.userId} onChange={(event) => setWithdrawalForm((current) => ({ ...current, userId: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColAmount")}</Label>
                  <Input value={withdrawalForm.amount} onChange={(event) => setWithdrawalForm((current) => ({ ...current, amount: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColChannel")}</Label>
                  <Input value={withdrawalForm.channel} onChange={(event) => setWithdrawalForm((current) => ({ ...current, channel: event.target.value }))} />
                </div>
                <div className="md:col-span-3">
                  <Button type="submit">{t("marketWithdrawalsCreateAction")}</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("marketWithdrawalsListTitle")}</CardTitle>
              <CardDescription>{t("marketWithdrawalsListDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("marketColUserId")}</TableHead>
                    <TableHead>{t("marketColAmount")}</TableHead>
                    <TableHead>{t("marketColStatus")}</TableHead>
                    <TableHead>{t("marketColTime")}</TableHead>
                    <TableHead>{t("marketColActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bootstrap.withdrawals.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.userId}</TableCell>
                      <TableCell>{formatAmount(row.amount)}</TableCell>
                      <TableCell>{statusLabels[row.status] || row.status}</TableCell>
                      <TableCell>{formatDateTime(row.requestedAt)}</TableCell>
                      <TableCell className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={row.status !== "pending"}
                          onClick={() =>
                            void runMutation(t("marketWithdrawalsApprove"), async () => {
                              await requestJson(`/api/market/admin/marketing/withdrawals/${row.id}/review`, {
                                method: "POST",
                                body: JSON.stringify({ status: "approved", reviewNote: "approved via marketing console" }),
                              })
                            })
                          }
                        >
                          {t("marketWithdrawalsApprove")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={row.status !== "pending"}
                          onClick={() =>
                            void runMutation(t("marketWithdrawalsReject"), async () => {
                              await requestJson(`/api/market/admin/marketing/withdrawals/${row.id}/review`, {
                                method: "POST",
                                body: JSON.stringify({ status: "rejected", reviewNote: "rejected via marketing console" }),
                              })
                            })
                          }
                        >
                          {t("marketWithdrawalsReject")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={row.status !== "pending"}
                          onClick={() =>
                            void runMutation(t("marketWithdrawalsFreeze"), async () => {
                              await requestJson(`/api/market/admin/marketing/withdrawals/${row.id}/review`, {
                                method: "POST",
                                body: JSON.stringify({ status: "frozen", reviewNote: "frozen for manual review" }),
                              })
                            })
                          }
                        >
                          {t("marketWithdrawalsFreeze")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )
    }

    if (tab === "risk") {
      return (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("marketRiskListTitle")}</CardTitle>
              <CardDescription>{t("marketRiskListDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3 md:grid-cols-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void runMutation(t("marketRiskSaveList"), async () => {
                    await requestJson("/api/market/admin/marketing/risk-lists", {
                      method: "POST",
                      body: JSON.stringify({
                        listType: riskListForm.listType,
                        targetValue: riskListForm.targetValue,
                        reason: riskListForm.reason,
                      }),
                    })
                  })
                }}
              >
                <div className="space-y-2">
                  <Label>{t("marketColListType")}</Label>
                  <Select value={riskListForm.listType} onValueChange={(value) => setRiskListForm((current) => ({ ...current, listType: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">{t("marketRiskTypeUser")}</SelectItem>
                      <SelectItem value="device">{t("marketRiskTypeDevice")}</SelectItem>
                      <SelectItem value="ip">{t("marketRiskTypeIp")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColTargetValue")}</Label>
                  <Input value={riskListForm.targetValue} onChange={(event) => setRiskListForm((current) => ({ ...current, targetValue: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColReason")}</Label>
                  <Input value={riskListForm.reason} onChange={(event) => setRiskListForm((current) => ({ ...current, reason: event.target.value }))} />
                </div>
                <div className="md:col-span-3">
                  <Button type="submit">{t("marketRiskSaveList")}</Button>
                </div>
              </form>

              <Table className="mt-4">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("marketColListType")}</TableHead>
                    <TableHead>{t("marketColTargetValue")}</TableHead>
                    <TableHead>{t("marketColStatus")}</TableHead>
                    <TableHead>{t("marketColReason")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bootstrap.riskLists.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.listType}</TableCell>
                      <TableCell>{row.targetValue}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell>{row.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("marketRiskEventsTitle")}</CardTitle>
              <CardDescription>{t("marketRiskEventsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("marketColRiskCode")}</TableHead>
                    <TableHead>{t("marketColUserId")}</TableHead>
                    <TableHead>{t("marketColSeverity")}</TableHead>
                    <TableHead>{t("marketColStatus")}</TableHead>
                    <TableHead>{t("marketColActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bootstrap.riskEvents.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.riskCode}</TableCell>
                      <TableCell>{row.userId || "-"}</TableCell>
                      <TableCell>{row.severity}</TableCell>
                      <TableCell>{statusLabels[row.status] || row.status}</TableCell>
                      <TableCell className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void runMutation(t("marketRiskResolve"), async () => {
                              await requestJson(`/api/market/admin/marketing/risk-events/${row.id}/resolve`, {
                                method: "POST",
                                body: JSON.stringify({ status: "resolved", reviewNote: "resolved via marketing console" }),
                              })
                            })
                          }
                        >
                          {t("marketRiskResolve")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void runMutation(t("marketRiskDismiss"), async () => {
                              await requestJson(`/api/market/admin/marketing/risk-events/${row.id}/resolve`, {
                                method: "POST",
                                body: JSON.stringify({ status: "dismissed", reviewNote: "dismissed via marketing console" }),
                              })
                            })
                          }
                        >
                          {t("marketRiskDismiss")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )
    }

    if (tab === "simulate") {
      return (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("marketSimulationTitle")}</CardTitle>
              <CardDescription>{t("marketSimulationDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void runMutation(t("marketSimulationRun"), async () => {
                    const result = await requestJson("/api/market/admin/marketing/simulate", {
                      method: "POST",
                      body: JSON.stringify({
                        product: simulationForm.product,
                        eventType: simulationForm.eventType,
                        userId: simulationForm.userId,
                        source: simulationForm.source,
                        deviceFingerprint: simulationForm.deviceFingerprint || null,
                        ipHash: simulationForm.ipHash || null,
                        payload: parseJsonInput(simulationForm.payload),
                      }),
                    })
                    setSimulationOutput(JSON.stringify(result.result, null, 2))
                  })
                }}
              >
                <div className="space-y-2">
                  <Label>{t("marketColProduct")}</Label>
                  <Select value={simulationForm.product} onValueChange={(value) => setSimulationForm((current) => ({ ...current, product: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {bootstrap.constants.products.map((product) => (
                        <SelectItem key={product} value={product}>
                          {product}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColEventType")}</Label>
                  <Select value={simulationForm.eventType} onValueChange={(value) => setSimulationForm((current) => ({ ...current, eventType: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {bootstrap.constants.eventTypes.map((eventType) => (
                        <SelectItem key={eventType} value={eventType}>
                          {eventType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColUserId")}</Label>
                  <Input value={simulationForm.userId} onChange={(event) => setSimulationForm((current) => ({ ...current, userId: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColSource")}</Label>
                  <Input value={simulationForm.source} onChange={(event) => setSimulationForm((current) => ({ ...current, source: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColDeviceFingerprint")}</Label>
                  <Input value={simulationForm.deviceFingerprint} onChange={(event) => setSimulationForm((current) => ({ ...current, deviceFingerprint: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("marketColIpHash")}</Label>
                  <Input value={simulationForm.ipHash} onChange={(event) => setSimulationForm((current) => ({ ...current, ipHash: event.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-2 xl:col-span-4">
                  <Label>{t("marketColPayload")}</Label>
                  <Textarea
                    rows={10}
                    value={simulationForm.payload}
                    onChange={(event) => setSimulationForm((current) => ({ ...current, payload: event.target.value }))}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="md:col-span-2 xl:col-span-4">
                  <Button type="submit">{t("marketSimulationRun")}</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("marketSimulationResultTitle")}</CardTitle>
              <CardDescription>{t("marketSimulationResultDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea readOnly rows={18} value={simulationOutput} className="font-mono text-xs" />
            </CardContent>
          </Card>
        </div>
      )
    }

    if (tab === "reports") {
      return (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard title={t("marketReportsPendingAmount")} value={formatAmount(bootstrap.reports.withdrawalStats.pendingAmount)} />
            <StatCard title={t("marketReportsApprovedAmount")} value={formatAmount(bootstrap.reports.withdrawalStats.approvedAmount)} />
            <StatCard title={t("marketReportsRiskCount")} value={bootstrap.reports.riskBreakdown.reduce((sum, item) => sum + item.count, 0)} />
            <StatCard title={t("marketReportsRecentEvents")} value={bootstrap.reports.recentEvents.length} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("marketReportsAssetsTitle")}</CardTitle>
              <CardDescription>{t("marketReportsAssetsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("marketColAsset")}</TableHead>
                    <TableHead>{t("marketColAvailable")}</TableHead>
                    <TableHead>{t("marketFrozenLabel")}</TableHead>
                    <TableHead>{t("marketColUsers")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bootstrap.reports.assetDistribution.map((row) => (
                    <TableRow key={row.assetType}>
                      <TableCell>{assetLabels[row.assetType]}</TableCell>
                      <TableCell>{formatAmount(row.available)}</TableCell>
                      <TableCell>{formatAmount(row.frozen)}</TableCell>
                      <TableCell>{row.userCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("marketReportsTasksTitle")}</CardTitle>
              <CardDescription>{t("marketReportsTasksDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("marketColName")}</TableHead>
                    <TableHead>{t("marketMetricParticipants")}</TableHead>
                    <TableHead>{t("marketMetricCompletions")}</TableHead>
                    <TableHead>{t("marketColReward")}</TableHead>
                    <TableHead>{t("marketMetricConversion")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bootstrap.reports.taskPerformance.map((row) => (
                    <TableRow key={row.templateSlug}>
                      <TableCell>{row.templateName}</TableCell>
                      <TableCell>{row.participants}</TableCell>
                      <TableCell>{row.completions}</TableCell>
                      <TableCell>{formatAmount(row.rewardTotal)}</TableCell>
                      <TableCell>{row.conversionRate}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("marketReportsRiskTitle")}</CardTitle>
              <CardDescription>{t("marketReportsRiskDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("marketColRiskCode")}</TableHead>
                    <TableHead>{t("marketColCount")}</TableHead>
                    <TableHead>{t("marketColHighSeverity")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bootstrap.reports.riskBreakdown.map((row) => (
                    <TableRow key={row.riskCode}>
                      <TableCell>{row.riskCode}</TableCell>
                      <TableCell>{row.count}</TableCell>
                      <TableCell>{row.highSeverityCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )
    }

    return null
  }

  async function requestJson(url: string, options?: RequestInit) {
    const response = await fetch(url, {
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    })

    if (response.status === 401) {
      router.replace("/market/login")
      throw new Error("Unauthorized")
    }

    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result?.success) {
      throw new Error(result?.error || t("marketActionFailed"))
    }
    return result
  }

  async function loadBootstrap() {
    setLoading(true)
    setError("")
    try {
      const result = await requestJson("/api/market/admin/marketing/bootstrap")
      startTransition(() => {
        setBootstrap(result.bootstrap as MarketingBootstrapData)
      })
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : t("marketLoadFailed")
      if (message !== "Unauthorized") setError(message)
    } finally {
      setLoading(false)
    }
  }

  async function runMutation(label: string, action: () => Promise<void>) {
    setActionLabel(label)
    setNotice("")
    setError("")
    try {
      await action()
      setNotice(t("marketActionSuccess"))
      await loadBootstrap()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("marketActionFailed"))
    } finally {
      setActionLabel("")
    }
  }

  useEffect(() => {
    void loadBootstrap()
  }, [])

  async function logout() {
    await fetch("/api/market/auth/logout", { method: "POST" }).catch(() => null)
    router.replace("/market/login")
  }

  if (loading && !bootstrap) {
    return (
      <div className="min-h-screen bg-muted/20 p-6">
        <LoadingShell />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="flex h-14 items-center justify-between border-b bg-background px-6">
        <div className="font-semibold">{t("marketCenterTitle")}</div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("marketRegionLabel")}: {region}
          </Badge>
          <Button variant="outline" onClick={() => void loadBootstrap()} disabled={loading || isPending} className="gap-1.5">
            <RefreshCcw className="h-4 w-4" />
            {loading ? t("marketRefreshing") : t("marketRefresh")}
          </Button>
          <Button asChild variant="outline">
            <Link href="/market">{t("marketBackToNav")}</Link>
          </Button>
          <Button variant="destructive" onClick={logout}>
            {t("marketLogout")}
          </Button>
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-56px)]">
        <aside className="w-60 border-r bg-background p-3">
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="text-sm font-semibold">{t("marketCenterTitle")}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t("marketCenterSubtitle")}</div>
          </div>
          <div className="mt-3 space-y-1">
            {tabs.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${tab === item.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 p-6 space-y-4">
          {error ? <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {notice ? <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
          {actionLabel ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {t("marketRunningAction")}: {actionLabel}
            </div>
          ) : null}

          {renderTabContent()}
        </main>
      </div>
    </div>
  )
}
