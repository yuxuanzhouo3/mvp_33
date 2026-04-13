import { NextRequest } from "next/server"
import { getMarketingBootstrapData } from "@/lib/market/marketing"
import { errorJson, successJson, verifyMarketingAdmin } from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const bootstrap = await getMarketingBootstrapData()
    return successJson({ bootstrap })
  } catch (error) {
    return errorJson(error, "Failed to load marketing bootstrap data")
  }
}
