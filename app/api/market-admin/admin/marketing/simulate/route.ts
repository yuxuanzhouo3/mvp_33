import { NextRequest } from "next/server"
import { simulateMarketingEvent } from "@/lib/market/marketing"
import { errorJson, readRouteJson, successJson, verifyMarketingAdmin } from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const body = await readRouteJson(request)
    const result = await simulateMarketingEvent({
      product: String(body.product || "orbitchat") as "orbitchat" | "ai" | "ecommerce",
      eventType: String(body.eventType || "user.login") as
        | "user.login"
        | "referral.registered"
        | "referral.activated"
        | "ad.completed"
        | "order.paid"
        | "subscription.upgraded"
        | "ai.quota.exhausted",
      userId: String(body.userId || ""),
      occurredAt: typeof body.occurredAt === "string" ? body.occurredAt : new Date().toISOString(),
      payload: typeof body.payload === "object" && body.payload ? (body.payload as Record<string, unknown>) : {},
      deviceFingerprint: typeof body.deviceFingerprint === "string" ? body.deviceFingerprint : null,
      ipHash: typeof body.ipHash === "string" ? body.ipHash : null,
      source: typeof body.source === "string" ? body.source : null,
    })
    return successJson({ result })
  } catch (error) {
    return errorJson(error, "Failed to simulate marketing event")
  }
}
