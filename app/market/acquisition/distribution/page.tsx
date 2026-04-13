import Link from "next/link"
import { ArrowLeft, Radar, ShieldCheck } from "lucide-react"
import { getDeploymentRegion } from "@/config"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requireMarketAdminSession } from "../../require-market-session"
import { AcquisitionDistributionClient } from "./distribution-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type MarketLocale = "zh" | "en"

function getCopy(locale: MarketLocale) {
  if (locale === "zh") {
    return {
      back: "返回获客系统",
      title: "公开线索与分发工作区",
      description: "在这里采集公开商务联系方式、读取 /demo 素材、生成合作触达草稿，并把合作后的文章一键分发到自有渠道。",
      hint: "公开线索 / 1000 上限 / 先审后发",
    } as const
  }

  return {
    back: "Back to acquisition system",
    title: "Public lead and distribution workspace",
    description: "Collect public business contacts, read /demo assets, draft outreach, and distribute post-partnership articles across owned channels from one place.",
    hint: "Public leads / 1000 cap / review-first send",
  } as const
}

export default async function MarketAcquisitionDistributionPage() {
  await requireMarketAdminSession()

  const locale: MarketLocale = getDeploymentRegion() === "CN" ? "zh" : "en"
  const copy = getCopy(locale)

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-4 md:px-8 md:py-6">
      <div className="mx-auto max-w-[1400px] space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Button asChild variant="ghost" size="sm" className="justify-start">
            <Link href="/market/acquisition">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {copy.back}
            </Link>
          </Button>
        </div>

        <Card className="border-none shadow-sm">
          <CardContent className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Radar className="h-5 w-5" />
                {copy.title}
              </div>
              <div className="mt-1 max-w-3xl text-sm text-muted-foreground">{copy.description}</div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              {copy.hint}
            </div>
          </CardContent>
        </Card>

        <AcquisitionDistributionClient locale={locale} />
      </div>
    </div>
  )
}
