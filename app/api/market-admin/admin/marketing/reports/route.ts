import { NextRequest } from "next/server"
import { getMarketingAdInventorySummary, getMarketingReferralCompatibility, getMarketingReports } from "@/lib/market/marketing"
import { errorJson, successJson, verifyMarketingAdmin } from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    void request
    const [reports, adInventory, referralCompatibility] = await Promise.all([
      getMarketingReports(),
      getMarketingAdInventorySummary(),
      getMarketingReferralCompatibility(),
    ])
    return successJson({ reports, adInventory, referralCompatibility })
  } catch (error) {
    return errorJson(error, "Failed to load marketing reports")
  }
}
