import { NextRequest } from "next/server"
import { listMarketingAssetLedgers } from "@/lib/market/marketing"
import { errorJson, successJson, verifyMarketingAdmin } from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const ledgers = await listMarketingAssetLedgers({
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
      userId: searchParams.get("userId") || undefined,
      assetType: searchParams.get("assetType") || undefined,
      query: searchParams.get("query") || undefined,
    })
    return successJson({ ledgers })
  } catch (error) {
    return errorJson(error, "Failed to load marketing ledgers")
  }
}
