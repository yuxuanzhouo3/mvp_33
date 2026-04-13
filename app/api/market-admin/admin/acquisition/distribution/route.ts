import { NextRequest } from "next/server"
import { errorJson, readRouteJson, successJson, verifyMarketingAdmin } from "@/lib/market/marketing-route"
import {
  loadAcquisitionDistributionBootstrap,
  publishDistributionTarget,
  runAcquisitionCrawler,
  sendOutreachEmailBatch,
} from "@/lib/market/acquisition-distribution"
import { createAcquisitionDistributionFallbackBootstrap } from "@/lib/market/acquisition-distribution-shared"
import type { CrawlerLead } from "@/lib/market/acquisition-distribution-types"
import type { AcquisitionReplyDisposition } from "@/lib/market/acquisition-multichannel-types"
import {
  loadAcquisitionOpsBootstrap,
  persistCrawlerRun,
  promotePartnership,
  saveReplyEvent,
} from "@/lib/market/acquisition-multichannel"

async function loadDistributionPageData() {
  const bootstrap = await loadAcquisitionDistributionBootstrap().catch((error) => {
    console.error("[market/distribution] bootstrap fallback", error)
    return createAcquisitionDistributionFallbackBootstrap({
      leadSource: {
        mode: "missing",
        provider: "bootstrap",
        path: null,
        note: error instanceof Error ? error.message : "Failed to load acquisition distribution bootstrap.",
        capabilities: [],
      },
    })
  })

  const ops = await loadAcquisitionOpsBootstrap().catch((error) => {
    console.error("[market/distribution] ops bootstrap skipped", error)
    return null
  })

  return {
    ...bootstrap,
    ...(ops ? { ops } : {}),
  }
}

function parseReplyDisposition(value: unknown): AcquisitionReplyDisposition {
  const normalized = String(value || "").trim()
  if (normalized === "positive" || normalized === "needs_info" || normalized === "negotiating" || normalized === "negative") {
    return normalized
  }
  return "manual_review"
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const data = await loadDistributionPageData()
    return successJson({ data })
  } catch (error) {
    return errorJson(error, "Failed to load acquisition distribution data")
  }
}

export async function POST(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const body = await readRouteJson(request)
    const action = String(body.action || "")

    if (action === "run_crawler") {
      const input = {
        targetType:
          body.targetType === "blogger" || body.targetType === "vc"
            ? body.targetType
            : "b2b",
        keyword: String(body.keyword || ""),
        platform: String(body.platform || ""),
        region: String(body.region || ""),
        limit: Number(body.limit || 6),
        mode: body.mode === "deep" ? "deep" : "quick",
        locale: body.locale === "zh" ? "zh" : "en",
      } as const
      const result = await runAcquisitionCrawler(input)
      const persisted = await persistCrawlerRun({ input, leads: result, locale: input.locale })
      const data = await loadDistributionPageData()
      return successJson({ result, persisted, data })
    }

    if (action === "send_outreach_email_batch") {
      const leads = Array.isArray(body.leads) ? (body.leads as CrawlerLead[]) : []
      const subject = String(body.subject || "")
      const emailBody = String(body.body || "")
      const locale = body.locale === "zh" ? "zh" : "en"

      if (!subject.trim() || !emailBody.trim()) {
        return errorJson("Missing subject/body", "Subject and body are required.", 400)
      }

      const result = await sendOutreachEmailBatch({
        leads,
        subject,
        body: emailBody,
        locale,
      })
      return successJson({ result })
    }

    if (action === "publish_distribution_target") {
      const result = await publishDistributionTarget({
        targetId: String(body.targetId || ""),
        title: String(body.title || ""),
        text: String(body.text || ""),
        url: String(body.url || ""),
        asset:
          body.asset && typeof body.asset === "object"
            ? {
                id: String((body.asset as { id?: unknown }).id || ""),
                title: String((body.asset as { title?: unknown }).title || ""),
                kind:
                  (body.asset as { kind?: unknown }).kind === "doc" ||
                  (body.asset as { kind?: unknown }).kind === "pdf" ||
                  (body.asset as { kind?: unknown }).kind === "ppt" ||
                  (body.asset as { kind?: unknown }).kind === "html" ||
                  (body.asset as { kind?: unknown }).kind === "video"
                    ? ((body.asset as { kind: "doc" | "pdf" | "ppt" | "html" | "video" }).kind)
                    : "html",
                fileName: String((body.asset as { fileName?: unknown }).fileName || ""),
                url: typeof (body.asset as { url?: unknown }).url === "string" ? String((body.asset as { url?: unknown }).url) : null,
              }
            : undefined,
        locale: body.locale === "zh" ? "zh" : "en",
      })
      return successJson({ result })
    }

    if (action === "save_reply_event") {
      const lead = body.lead as CrawlerLead | undefined
      if (!lead?.id) {
        return errorJson("Missing lead", "Lead is required.", 400)
      }

      const result = await saveReplyEvent({
        lead,
        replyText: String(body.replyText || ""),
        insight: {
          disposition: parseReplyDisposition(body.disposition),
          summary: String(body.summary || ""),
          nextStep: String(body.nextStep || ""),
        },
        locale: body.locale === "zh" ? "zh" : "en",
      })
      const data = await loadDistributionPageData()
      return successJson({ result, data })
    }

    if (action === "promote_partnership") {
      const lead = body.lead as CrawlerLead | undefined
      if (!lead?.id) {
        return errorJson("Missing lead", "Lead is required.", 400)
      }

      const result = await promotePartnership({
        lead,
        replyText: String(body.replyText || ""),
        insight: {
          disposition: parseReplyDisposition(body.disposition),
          summary: String(body.summary || ""),
          nextStep: String(body.nextStep || ""),
        },
        locale: body.locale === "zh" ? "zh" : "en",
        origin: request.nextUrl.origin,
        assetTitle: typeof body.assetTitle === "string" ? body.assetTitle : null,
      })
      const data = await loadDistributionPageData()
      return successJson({ result, data })
    }

    return errorJson("Unknown action", "Unknown action", 400)
  } catch (error) {
    return errorJson(error, "Failed to process acquisition distribution action")
  }
}
