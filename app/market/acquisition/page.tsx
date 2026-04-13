import Link from "next/link"
import { ArrowLeft, Radar, Share2 } from "lucide-react"
import { getDeploymentRegion } from "@/config"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requireMarketAdminSession } from "../require-market-session"
import { AcquisitionClient } from "./acquisition-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type MarketLocale = "zh" | "en"

function getCopy(locale: MarketLocale) {
  if (locale === "zh") {
    return {
      back: "返回系统导航",
      title: "获客系统",
      description:
        "这里继续保留原有获客管理页面，并把爬虫线索、/demo 资料读取、分享文案生成和一键转发能力收进 B2B 的爬虫任务模块里。",
      studio: "跳到爬虫工作区",
      studioHint: "直接进入独立的爬虫任务页面，抓线索、读取 /demo 并一键分发",
    } as const
  }

  return {
    back: "Back to market hub",
    title: "Acquisition System",
    description:
      "The acquisition dashboard stays here, and the crawler plus /demo distribution workflow now lives inside the B2B crawler task module.",
    studio: "Jump to crawler workspace",
    studioHint: "Open the dedicated crawler page to collect leads, read /demo assets, and repost",
  } as const
}

export default async function MarketAcquisitionPage() {
  await requireMarketAdminSession()

  const locale: MarketLocale = getDeploymentRegion() === "CN" ? "zh" : "en"
  const copy = getCopy(locale)

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-4 md:px-8 md:py-6">
      <div className="mx-auto max-w-[1400px] space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Button asChild variant="ghost" size="sm" className="justify-start">
            <Link href="/market">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {copy.back}
            </Link>
          </Button>

          <Button asChild>
            <Link href="/market/acquisition/distribution">
              <Radar className="mr-2 h-4 w-4" />
              {copy.studio}
            </Link>
          </Button>
        </div>

        <Card className="border-none shadow-sm">
          <CardContent className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-semibold">{copy.title}</div>
              <div className="mt-1 max-w-3xl text-sm text-muted-foreground">{copy.description}</div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
              <Share2 className="h-3.5 w-3.5" />
              {copy.studioHint}
            </div>
          </CardContent>
        </Card>

        <AcquisitionClient locale={locale} />
      </div>
    </div>
  )
}
