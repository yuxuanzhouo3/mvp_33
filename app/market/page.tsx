import Link from "next/link"
import { ArrowRight, BellRing, Megaphone, SendToBack, UsersRound } from "lucide-react"
import { getDeploymentRegion } from "@/config"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireMarketAdminSession } from "./require-market-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type MarketLocale = "zh" | "en"

function getCopy(locale: MarketLocale) {
  if (locale === "zh") {
    return {
      title: "选择要进入的 market 子系统",
      description:
        "这里集中放置 market 后台的核心模块。获客系统现在已经把爬虫线索、/demo 资料读取和社交平台转发整合在同一页里。",
      enter: "进入系统",
      live: "已上线",
      planning: "规划中",
      systems: [
        {
          id: "1",
          title: "用户分析系统",
          description: "围绕留存、活跃、转化与行为路径做用户分析。",
          href: "/market/analytics",
          status: "live",
          icon: UsersRound,
        },
        {
          id: "2",
          title: "产品获客系统",
          description: "管理渠道、线索、合作名单，并在同页完成 /demo 素材分发。",
          href: "/market/acquisition",
          status: "live",
          icon: Megaphone,
        },
        {
          id: "3",
          title: "产品通知系统",
          description: "用于召回、通知、文章推送和自动触达。",
          href: "/market/notifications",
          status: "planning",
          icon: BellRing,
        },
        {
          id: "4",
          title: "营销中台",
          description: "统一管理裂变任务、投放激励、预算与风控。",
          href: "/market/fission",
          status: "live",
          icon: SendToBack,
        },
      ],
    } as const
  }

  return {
    title: "Choose a market subsystem",
    description:
      "This is the entry hub for the market admin stack. The acquisition system now includes crawler leads, /demo asset pickup, and social reposting in the same page.",
    enter: "Open subsystem",
    live: "Live",
    planning: "Planned",
    systems: [
      {
        id: "1",
        title: "User Analytics",
        description: "Analyze retention, activity, conversion, and user behavior flows.",
        href: "/market/analytics",
        status: "live",
        icon: UsersRound,
      },
      {
        id: "2",
        title: "Acquisition System",
        description: "Manage channels, leads, partner lists, and /demo-based social distribution from one place.",
        href: "/market/acquisition",
        status: "live",
        icon: Megaphone,
      },
      {
        id: "3",
        title: "Notification System",
        description: "Handle win-back campaigns, notifications, and automated outreach.",
        href: "/market/notifications",
        status: "planning",
        icon: BellRing,
      },
      {
        id: "4",
        title: "Growth Operations Hub",
        description: "Coordinate referral tasks, incentives, budgets, and guardrails.",
        href: "/market/fission",
        status: "live",
        icon: SendToBack,
      },
    ],
  } as const
}

export default async function MarketAdminPage() {
  await requireMarketAdminSession()

  const locale: MarketLocale = getDeploymentRegion() === "CN" ? "zh" : "en"
  const copy = getCopy(locale)

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-8 md:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border bg-background px-6 py-7 md:px-8 md:py-10">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{copy.title}</h1>
          <p className="mt-2 max-w-4xl text-sm text-muted-foreground md:text-base">{copy.description}</p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {copy.systems.map((system) => (
            <Card key={system.id} className="border border-border/80 shadow-sm">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-muted/40">
                    <system.icon className="h-5 w-5" />
                  </div>
                  <Badge variant={system.status === "live" ? "default" : "secondary"}>
                    {system.status === "live" ? copy.live : copy.planning}
                  </Badge>
                </div>
                <CardTitle className="text-xl">
                  {system.id}. {system.title}
                </CardTitle>
                <CardDescription>{system.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full justify-between">
                  <Link href={system.href}>
                    {copy.enter}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </div>
  )
}
