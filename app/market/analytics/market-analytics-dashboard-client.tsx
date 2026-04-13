"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Activity, ChevronLeft, MessageSquareText, RefreshCcw, UsersRound } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { AnalysisDashboardSummary } from "@/lib/admin/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type DeploymentRegion = "CN" | "INTL"

type MarketAnalyticsData = {
  region: DeploymentRegion
  generatedAt: string
  rangeDays: number
  overview: {
    totalUsers: number
    newUsersInRange: number
    activeUsersInRange: number
    activeUsers7d: number
    activeUsers30d: number
    activeRate7d: number
    activeRate30d: number
    firstUseRate7dForNewUsers30d: number
    avgUsageEventsPerActiveUser30d: number
    medianFirstUseHours: number
    totalUsageEventsInRange: number
  }
  retention: {
    summary: {
      cohortUsers: number
      d1Rate: number
      d3Rate: number
      d7Rate: number
      d14Rate: number
      d30Rate: number
    }
    cohorts: Array<{
      cohortDate: string
      newUsers: number
      d1Rate: number
      d3Rate: number
      d7Rate: number
      d14Rate: number
      d30Rate: number
    }>
  }
  trends: Array<{
    date: string
    newUsers: number
    dau: number
    wau: number
    usageEvents: number
  }>
  habits: {
    byWeekday: Array<{ label: string; events: number; activeUsers: number }>
    byHour: Array<{ label: string; events: number; activeUsers: number }>
    topTools: Array<{ toolId: string; toolName: string; events: number; activeUsers: number; share: number }>
  }
  firstUse: {
    topTools: Array<{ toolId: string; toolName: string; users: number; share: number }>
    latencyDistribution: Array<{ bucket: string; label: string; users: number; share: number }>
  }
  segmentation: {
    recency: Array<{ label: string; users: number; share: number }>
  }
  userAnalysis: AnalysisDashboardSummary
}

type AnalyticsTabKey = "overview" | "retention" | "usage" | "analysis"

const RANGE_OPTIONS = [14, 30, 60, 90] as const
const TABS: Array<{ key: AnalyticsTabKey; label: string }> = [
  { key: "overview", label: "概览" },
  { key: "retention", label: "留存" },
  { key: "usage", label: "活跃与工具" },
  { key: "analysis", label: "用户分析" },
]
const PIE_COLORS = ["#1d4ed8", "#0f766e", "#ca8a04", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#65a30d"]

function pct(value: number) {
  return `${Number(value || 0).toFixed(2)}%`
}

function shortDate(value: string) {
  const [, month, day] = value.split("-")
  return month && day ? `${month}-${day}` : value
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "-"
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

function LoadingDashboard() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  )
}

export function MarketAnalyticsDashboardClient() {
  const router = useRouter()
  const [tab, setTab] = useState<AnalyticsTabKey>("overview")
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [data, setData] = useState<MarketAnalyticsData | null>(null)

  const loadData = useCallback(
    async (nextDays: number) => {
      setLoading(true)
      setError("")
      try {
        const response = await fetch(`/api/market-admin/admin/analytics?days=${nextDays}`, { cache: "no-store" })
        if (response.status === 401) {
          router.replace("/market/login")
          return
        }
        const result = await response.json().catch(() => null)
        if (!response.ok || !result?.success || !result?.analytics) {
          throw new Error(result?.error || "Failed to load analytics")
        }
        setData(result.analytics as MarketAnalyticsData)
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to load analytics")
      } finally {
        setLoading(false)
      }
    },
    [router],
  )

  useEffect(() => {
    void loadData(days)
  }, [days, loadData])

  const analysis = data?.userAnalysis
  const actionItems = useMemo(() => {
    if (!analysis) return []
    const items: string[] = []
    const topCon = analysis.feedback.top_cons[0]
    const topPro = analysis.feedback.top_pros[0]
    const topChurn = analysis.churn_features[0]
    const topSource = analysis.registration_sources[0]
    if (topCon) items.push(`优先处理负面反馈最多的话题“${topCon.topic}”。`)
    if (topPro) items.push(`继续放大正向反馈最多的话题“${topPro.topic}”。`)
    if (topChurn) items.push(`复盘功能“${topChurn.feature_key}”的流失链路，当前流失率 ${pct(topChurn.churn_rate)}。`)
    if (topSource) items.push(`注册来源“${topSource.source}”贡献最高，适合继续加码。`)
    return items
  }, [analysis])

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Button variant="ghost" size="sm" asChild className="-ml-3 mb-2 text-muted-foreground">
              <Link href="/market">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back to market console
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-blue-600 p-3 text-white shadow-lg">
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Market Analytics</h1>
                <p className="text-sm text-muted-foreground">市场运营指标、留存趋势和用户反馈总览。</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((option) => (
              <Button key={option} variant={days === option ? "default" : "outline"} onClick={() => setDays(option)}>
                {option} days
              </Button>
            ))}
            <Button variant="outline" onClick={() => void loadData(days)}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((item) => (
            <Button key={item.key} size="sm" variant={tab === item.key ? "default" : "outline"} onClick={() => setTab(item.key)}>
              {item.label}
            </Button>
          ))}
          {data ? <Badge variant="secondary">{data.region}</Badge> : null}
          {data ? <Badge variant="outline">Generated {formatDateTime(data.generatedAt)}</Badge> : null}
        </div>

        {loading ? <LoadingDashboard /> : null}

        {!loading && error ? (
          <Card>
            <CardHeader>
              <CardTitle>Analytics load failed</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => void loadData(days)}>Try again</Button>
            </CardContent>
          </Card>
        ) : null}

        {!loading && data ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <StatCard title="总用户数" value={data.overview.totalUsers} />
              <StatCard title={`${data.rangeDays} 天新增`} value={data.overview.newUsersInRange} />
              <StatCard title={`${data.rangeDays} 天活跃`} value={data.overview.activeUsersInRange} />
              <StatCard title="7 天活跃率" value={pct(data.overview.activeRate7d)} hint={`${data.overview.activeUsers7d} active users`} />
              <StatCard title="30 天活跃率" value={pct(data.overview.activeRate30d)} hint={`${data.overview.activeUsers30d} active users`} />
              <StatCard title="人均事件数" value={data.overview.avgUsageEventsPerActiveUser30d.toFixed(2)} />
            </div>

            {tab === "overview" ? (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UsersRound className="h-5 w-5 text-blue-600" />
                      用户趋势
                    </CardTitle>
                    <CardDescription>新用户、DAU、WAU 和事件量按天变化。</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.trends}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={shortDate} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="newUsers" stroke="#2563eb" strokeWidth={2} name="New users" />
                        <Line type="monotone" dataKey="dau" stroke="#0f766e" strokeWidth={2} name="DAU" />
                        <Line type="monotone" dataKey="wau" stroke="#ca8a04" strokeWidth={2} name="WAU" />
                        <Line type="monotone" dataKey="usageEvents" stroke="#dc2626" strokeWidth={2} name="Events" />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>首次使用与召回</CardTitle>
                    <CardDescription>帮助判断新用户转化速度和召回空间。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <StatCard title="7 天首次使用率" value={pct(data.overview.firstUseRate7dForNewUsers30d)} />
                    <StatCard title="首次使用中位耗时" value={`${data.overview.medianFirstUseHours.toFixed(1)} h`} />
                    <StatCard title={`${data.rangeDays} 天事件总数`} value={data.overview.totalUsageEventsInRange} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>首次使用路径分布</CardTitle>
                    <CardDescription>看新用户在关键行为前经历了多长时间。</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data.firstUse.latencyDistribution} dataKey="users" nameKey="label" outerRadius={100} label>
                          {data.firstUse.latencyDistribution.map((entry, index) => (
                            <Cell key={`${entry.bucket}_${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>最近活跃分层</CardTitle>
                    <CardDescription>识别高价值和待召回用户群。</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data.segmentation.recency} dataKey="users" nameKey="label" outerRadius={100} label>
                          {data.segmentation.recency.map((entry, index) => (
                            <Cell key={`${entry.label}_${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {tab === "retention" ? (
              <Card>
                <CardHeader>
                  <CardTitle>留存 Cohort 明细</CardTitle>
                  <CardDescription>查看不同 cohort 的 D1 / D3 / D7 / D14 / D30 留存变化。</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>New</TableHead>
                        <TableHead>D1</TableHead>
                        <TableHead>D3</TableHead>
                        <TableHead>D7</TableHead>
                        <TableHead>D14</TableHead>
                        <TableHead>D30</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.retention.cohorts.map((row) => (
                        <TableRow key={row.cohortDate}>
                          <TableCell>{row.cohortDate}</TableCell>
                          <TableCell>{row.newUsers}</TableCell>
                          <TableCell>{pct(row.d1Rate)}</TableCell>
                          <TableCell>{pct(row.d3Rate)}</TableCell>
                          <TableCell>{pct(row.d7Rate)}</TableCell>
                          <TableCell>{pct(row.d14Rate)}</TableCell>
                          <TableCell>{pct(row.d30Rate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : null}

            {tab === "usage" ? (
              <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>按星期活跃分布</CardTitle>
                    <CardDescription>对比不同日期的事件量和活跃用户数。</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.habits.byWeekday}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="events" fill="#2563eb" name="Events" />
                        <Bar dataKey="activeUsers" fill="#0f766e" name="Active users" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>按小时活跃分布</CardTitle>
                    <CardDescription>识别内容触达和活动投放的最佳时段。</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.habits.byHour}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="events" fill="#7c3aed" name="Events" />
                        <Bar dataKey="activeUsers" fill="#ca8a04" name="Active users" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Top tools</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tool</TableHead>
                          <TableHead>Events</TableHead>
                          <TableHead>Users</TableHead>
                          <TableHead>Share</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.habits.topTools.map((tool) => (
                          <TableRow key={tool.toolId}>
                            <TableCell>{tool.toolName}</TableCell>
                            <TableCell>{tool.events}</TableCell>
                            <TableCell>{tool.activeUsers}</TableCell>
                            <TableCell>{pct(tool.share)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>首次使用 Top tools</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tool</TableHead>
                          <TableHead>Users</TableHead>
                          <TableHead>Share</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.firstUse.topTools.map((tool) => (
                          <TableRow key={tool.toolId}>
                            <TableCell>{tool.toolName}</TableCell>
                            <TableCell>{tool.users}</TableCell>
                            <TableCell>{pct(tool.share)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {tab === "analysis" ? (
              <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquareText className="h-5 w-5 text-rose-600" />
                      用户分析摘要
                    </CardTitle>
                    <CardDescription>反馈、来源和聚类视角的关键结论。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <StatCard title="Feedback" value={analysis?.feedback_count || 0} />
                    <StatCard title="Dormant users" value={analysis?.dormant_users || 0} />
                    <StatCard title="Top register source" value={analysis?.registration_sources[0]?.source || "-"} hint={analysis?.registration_sources[0] ? pct(analysis.registration_sources[0].share) : undefined} />
                    <div className="space-y-2">
                      {actionItems.map((item, index) => (
                        <div key={index} className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">{item}</div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>反馈聚类</CardTitle>
                    <CardDescription>按主题查看关键词、情绪和建议。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Topic</TableHead>
                          <TableHead>Sentiment</TableHead>
                          <TableHead>Frequency</TableHead>
                          <TableHead>Suggestion</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(analysis?.clusters || []).slice(0, 8).map((cluster) => (
                          <TableRow key={cluster.id}>
                            <TableCell>{cluster.topic}</TableCell>
                            <TableCell>{cluster.sentiment}</TableCell>
                            <TableCell>{cluster.frequency}</TableCell>
                            <TableCell className="max-w-[320px] whitespace-normal">{cluster.suggestion}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
