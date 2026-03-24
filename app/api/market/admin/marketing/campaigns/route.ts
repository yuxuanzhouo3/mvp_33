import { NextRequest } from "next/server"
import { listMarketingCampaigns, saveMarketingCampaign } from "@/lib/market/marketing"
import {
  errorJson,
  parseMarketingCampaignStatus,
  parseMarketingProducts,
  readRouteJson,
  successJson,
  verifyMarketingAdmin,
} from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const campaigns = await listMarketingCampaigns({
      status: searchParams.get("status") || undefined,
      query: searchParams.get("query") || undefined,
    })
    return successJson({ campaigns })
  } catch (error) {
    return errorJson(error, "Failed to load marketing campaigns")
  }
}

export async function POST(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const body = await readRouteJson(request)
    const campaign = await saveMarketingCampaign({
      id: typeof body.id === "string" ? body.id : undefined,
      slug: String(body.slug || ""),
      name: String(body.name || ""),
      description: typeof body.description === "string" ? body.description : undefined,
      campaignType: typeof body.campaignType === "string" ? body.campaignType : undefined,
      productScope: parseMarketingProducts(body.productScope),
      highlight: typeof body.highlight === "string" ? body.highlight : undefined,
      status: parseMarketingCampaignStatus(body.status),
      startAt: typeof body.startAt === "string" ? body.startAt : body.startAt === null ? null : undefined,
      endAt: typeof body.endAt === "string" ? body.endAt : body.endAt === null ? null : undefined,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
      rules: typeof body.rules === "object" && body.rules ? (body.rules as Record<string, unknown>) : undefined,
    })
    return successJson({ campaign })
  } catch (error) {
    return errorJson(error, "Failed to save marketing campaign")
  }
}
