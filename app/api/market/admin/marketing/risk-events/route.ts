import { NextRequest } from "next/server"
import { listMarketingRiskEvents } from "@/lib/market/marketing"
import { errorJson, successJson, verifyMarketingAdmin } from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const riskEvents = await listMarketingRiskEvents({
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
      status: searchParams.get("status") || undefined,
      severity: searchParams.get("severity") || undefined,
      query: searchParams.get("query") || undefined,
    })
    return successJson({ riskEvents })
  } catch (error) {
    return errorJson(error, "Failed to load marketing risk events")
  }
}
