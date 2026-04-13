import Link from "next/link"
import { headers } from "next/headers"
import { ArrowLeft, Download, ExternalLink, FileText, PlayCircle, Presentation } from "lucide-react"
import { notFound } from "next/navigation"
import { getDeploymentRegion } from "@/config"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { readDemoManifest } from "@/lib/demo-bundle"
import { resolveDemoPreview } from "@/lib/demo-preview"

type DemoLocale = "zh" | "en"

function formatDate(value: string, locale: DemoLocale) {
  return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")
}

function sectionIcon(kind: string) {
  switch (kind) {
    case "ppt":
      return <Presentation className="h-5 w-5 text-fuchsia-600" />
    case "video":
      return <PlayCircle className="h-5 w-5 text-cyan-600" />
    default:
      return <FileText className="h-5 w-5 text-emerald-600" />
  }
}

function resolveRequestOrigin(hostValue: string | null, protoValue: string | null) {
  const host = String(hostValue || "").split(",")[0]?.trim()
  const proto = String(protoValue || "").split(",")[0]?.trim().toLowerCase()

  if (!host) return ""

  try {
    return new URL(`${proto || "https"}://${host}`).origin
  } catch {
    return ""
  }
}

function getCopy(locale: DemoLocale) {
  if (locale === "zh") {
    return {
      back: "返回 /demo",
      title: "资料预览",
      previewTitle: "在线预览",
      browserUnavailable: "当前文件暂时无法直接在线预览",
      browserUnavailableDescription:
        "这类文件现在优先走 Office 在线预览服务。若当前地址还是 localhost、内网地址，或文件没有公网 HTTPS 链接，外部预览服务将无法读取。",
      providerTitle: "预览来源",
      providerMicrosoft: "Microsoft Office Online",
      providerGoogle: "Google Viewer",
      providerBrowser: "浏览器内预览",
      providerNone: "暂不可用",
      publicUrlHint: "在线文档预览要求文件是公网 HTTPS 可访问地址。",
      relatedTitle: "可替代打开的资料",
      download: "下载原文件",
      openSource: "打开原文件",
      openPreview: "打开在线预览",
      openRelated: "打开可预览版本",
      updatedAt: "最近更新时间",
      emptyRelated: "这个资料目前没有可直接预览的配套文件。",
    } as const
  }

  return {
    back: "Back to /demo",
    title: "Asset preview",
    previewTitle: "Live preview",
    browserUnavailable: "This file is not available for online preview right now",
    browserUnavailableDescription:
      "This page now prefers online document viewers. If the current address is still localhost, a private network host, or the file does not have a public HTTPS URL, the external viewer cannot fetch it.",
    providerTitle: "Preview source",
    providerMicrosoft: "Microsoft Office Online",
    providerGoogle: "Google Viewer",
    providerBrowser: "Browser preview",
    providerNone: "Unavailable",
    publicUrlHint: "Online document viewers require the file to be reachable over a public HTTPS URL.",
    relatedTitle: "Related previewable assets",
    download: "Download original file",
    openSource: "Open original file",
    openPreview: "Open online preview",
    openRelated: "Open previewable asset",
    updatedAt: "Last updated",
    emptyRelated: "There is no directly previewable companion asset for this file yet.",
  } as const
}

function providerLabel(
  provider: "browser" | "microsoft-office-online" | "google-viewer" | "none",
  locale: DemoLocale,
) {
  const copy = getCopy(locale)

  switch (provider) {
    case "microsoft-office-online":
      return copy.providerMicrosoft
    case "google-viewer":
      return copy.providerGoogle
    case "browser":
      return copy.providerBrowser
    default:
      return copy.providerNone
  }
}

export default async function DemoItemPreviewPage({
  params,
}: {
  params: Promise<{ itemId: string }> | { itemId: string }
}) {
  const resolvedParams = await Promise.resolve(params)
  const locale: DemoLocale = getDeploymentRegion() === "CN" ? "zh" : "en"
  const copy = getCopy(locale)
  const manifest = await readDemoManifest()

  if (!manifest) {
    notFound()
  }

  const item = manifest.items.find((entry) => entry.id === resolvedParams.itemId)
  if (!item) {
    notFound()
  }

  const headerStore = await headers()
  const requestOrigin = resolveRequestOrigin(
    headerStore.get("x-forwarded-host") || headerStore.get("host"),
    headerStore.get("x-forwarded-proto"),
  )

  const preview = resolveDemoPreview(item, { preferredOrigin: requestOrigin })
  const relatedItems = manifest.items.filter(
    (entry) => entry.id !== item.id && entry.category === item.category && (entry.kind === "pdf" || entry.kind === "html" || entry.kind === "video"),
  )

  return (
    <main className="min-h-screen bg-[#f5efe6] px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center">
          <Button asChild variant="ghost" size="sm">
            <Link href="/demo">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {copy.back}
            </Link>
          </Button>
        </div>

        <section className="rounded-[32px] border border-black/5 bg-white/80 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-black px-3 py-1 text-sm font-medium text-white">
                {sectionIcon(item.kind)}
                {copy.title}
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{item.title}</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 md:text-base">{item.description}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
              <div>
                {copy.updatedAt}: {formatDate(item.updatedAt, locale)}
              </div>
              <div className="mt-2">
                {copy.providerTitle}: {providerLabel(preview.provider, locale)}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {(preview.mode === "inline" || preview.mode === "external") && (
              <Button asChild variant="outline">
                <Link href={preview.src || item.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {preview.mode === "external" ? copy.openPreview : copy.openSource}
                </Link>
              </Button>
            )}
            <Button asChild>
              <a href={item.url} download={item.fileName}>
                <Download className="mr-2 h-4 w-4" />
                {copy.download}
              </a>
            </Button>
          </div>
        </section>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>{copy.previewTitle}</CardTitle>
            <CardDescription>{item.fileName}</CardDescription>
          </CardHeader>
          <CardContent>
            {item.kind === "video" && preview.src && (
              <video controls preload="metadata" className="w-full rounded-2xl border bg-black shadow-sm" src={preview.src} />
            )}

            {(preview.mode === "inline" || preview.mode === "external") &&
              (item.kind === "pdf" || item.kind === "html" || item.kind === "doc" || item.kind === "ppt") &&
              preview.src && (
                <iframe
                  title={item.title}
                  src={preview.src}
                  className="h-[78vh] w-full rounded-2xl border bg-white shadow-sm"
                />
              )}

            {preview.mode === "none" && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12">
                <div className="text-lg font-semibold">{copy.browserUnavailable}</div>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{copy.browserUnavailableDescription}</p>
                {preview.reason === "public-url-required" && (
                  <p className="mt-3 text-sm leading-7 text-slate-600">{copy.publicUrlHint}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>{copy.relatedTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!relatedItems.length && <div className="text-sm text-slate-500">{copy.emptyRelated}</div>}

            {relatedItems.map((relatedItem) => (
              <div
                key={relatedItem.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">{relatedItem.title}</div>
                  <div className="mt-1 text-sm text-slate-600">{relatedItem.fileName}</div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/demo/item/${encodeURIComponent(relatedItem.id)}`} target="_blank">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {copy.openRelated}
                    </Link>
                  </Button>
                  <Button asChild size="sm">
                    <a href={relatedItem.url} download={relatedItem.fileName}>
                      <Download className="mr-2 h-4 w-4" />
                      {copy.download}
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
