import Link from "next/link"
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react"
import { getDeploymentRegion } from "@/config"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requireMarketAdminSession } from "../../../require-market-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type MarketLocale = "zh" | "en"

function tx(locale: MarketLocale, zh: string, en: string) {
  return locale === "zh" ? zh : en
}

export default async function LeadPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireMarketAdminSession()

  const locale: MarketLocale = getDeploymentRegion() === "CN" ? "zh" : "en"
  const params = await searchParams
  const getValue = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] || "" : value || ""
  }

  const leadId = getValue("id")
  const segment = getValue("segment")
  const platform = getValue("platform")
  const region = getValue("region")
  const organization = getValue("organization")
  const contactName = getValue("contactName")
  const contactRole = getValue("contactRole")
  const contactChannel = getValue("contactChannel")
  const contactValue = getValue("contactValue")
  const sourceLabel = getValue("sourceLabel")

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <Button asChild variant="ghost" size="sm" className="justify-start">
          <Link href="/market/acquisition/distribution">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tx(locale, "返回爬虫任务", "Back to crawler workspace")}
          </Link>
        </Button>

        <Card className="border-none shadow-sm">
          <CardContent className="space-y-5 px-6 py-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm text-muted-foreground">{tx(locale, "安全线索预览", "Safe lead preview")}</div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  {organization || tx(locale, "线索详情", "Lead details")}
                </h1>
                <div className="mt-2 text-sm text-muted-foreground">
                  {tx(
                    locale,
                    "当前页面是站内安全预览，用来替代模拟爬虫阶段的占位外链，避免再打开 example.com 之类的不安全跳转。",
                    "This is an internal safe preview used instead of placeholder crawler links, so the app does not open external example.com-style URLs.",
                  )}
                </div>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                {tx(locale, "站内安全预览", "Internal safe preview")}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border bg-white p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{tx(locale, "线索 ID", "Lead ID")}</div>
                <div className="mt-2 text-sm font-medium">{leadId || "-"}</div>
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{tx(locale, "对象类型", "Segment")}</div>
                <div className="mt-2 text-sm font-medium">{segment || "-"}</div>
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{tx(locale, "平台", "Platform")}</div>
                <div className="mt-2 text-sm font-medium">{platform || "-"}</div>
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{tx(locale, "区域", "Region")}</div>
                <div className="mt-2 text-sm font-medium">{region || "-"}</div>
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{tx(locale, "联系人", "Contact")}</div>
                <div className="mt-2 text-sm font-medium">{contactName || "-"}</div>
                <div className="mt-1 text-xs text-muted-foreground">{contactRole || "-"}</div>
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{tx(locale, "公开来源", "Public source")}</div>
                <div className="mt-2 text-sm font-medium">{sourceLabel || "-"}</div>
              </div>
              <div className="rounded-2xl border bg-white p-4 md:col-span-2">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{tx(locale, "联系方式", "Contact channel")}</div>
                <div className="mt-2 text-sm font-medium">
                  {contactChannel || "-"}: {contactValue || "-"}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
              {tx(
                locale,
                "提示：当前爬虫结果仍是演示数据，所以这里只展示站内安全预览，不直接打开外部站点。后续如果你要接真实来源，我可以再把这块换成受控白名单跳转。",
                "Note: crawler results are still demo data, so this view intentionally stays inside the app. If you later connect real sources, I can switch this to a controlled whitelist-based outbound flow.",
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/market/acquisition/distribution">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {tx(locale, "回到工作区", "Back to workspace")}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/demo" target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {tx(locale, "打开 /demo 素材", "Open /demo assets")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
