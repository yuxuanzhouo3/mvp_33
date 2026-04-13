import { NextRequest } from "next/server"
import { getMarketingFissionData } from "@/lib/market/marketing"
import { errorJson, successJson, verifyMarketingAdmin } from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const fission = await getMarketingFissionData({
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || undefined,
      datePreset: searchParams.get("datePreset") || undefined,
      date: searchParams.get("date") || undefined,
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
    })
    return successJson({ fission })
  } catch (error) {
    return errorJson(error, "Failed to load fission dashboard data")
  }
}
