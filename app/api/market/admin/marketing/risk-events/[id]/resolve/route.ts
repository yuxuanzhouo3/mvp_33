import { NextRequest } from "next/server"
import { resolveMarketingRiskEvent } from "@/lib/market/marketing"
import { errorJson, readRouteJson, successJson, verifyMarketingAdmin } from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const params = await context.params
    const body = await readRouteJson(request)
    const riskEvent = await resolveMarketingRiskEvent({
      id: params.id,
      status: String(body.status || "resolved") as "open" | "reviewing" | "resolved" | "dismissed" | "frozen",
      reviewNote: typeof body.reviewNote === "string" ? body.reviewNote : null,
      operatorId: auth.admin.username,
    })
    return successJson({ riskEvent })
  } catch (error) {
    return errorJson(error, "Failed to resolve marketing risk event")
  }
}
