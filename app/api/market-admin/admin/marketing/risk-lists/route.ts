import { NextRequest } from "next/server"
import { listMarketingRiskLists, saveMarketingRiskList } from "@/lib/market/marketing"
import { errorJson, readRouteJson, successJson, verifyMarketingAdmin } from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const riskLists = await listMarketingRiskLists({
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
      listType: searchParams.get("listType") || undefined,
      status: searchParams.get("status") || undefined,
      query: searchParams.get("query") || undefined,
    })
    return successJson({ riskLists })
  } catch (error) {
    return errorJson(error, "Failed to load marketing risk lists")
  }
}

export async function POST(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const body = await readRouteJson(request)
    const riskList = await saveMarketingRiskList({
      id: typeof body.id === "string" ? body.id : undefined,
      listType: String(body.listType || "user") as "user" | "device" | "ip",
      targetValue: String(body.targetValue || ""),
      status: typeof body.status === "string" ? (body.status as "active" | "disabled") : undefined,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      operatorId: auth.admin.username,
      expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : body.expiresAt === null ? null : undefined,
      meta: typeof body.meta === "object" && body.meta ? (body.meta as Record<string, unknown>) : undefined,
    })
    return successJson({ riskList })
  } catch (error) {
    return errorJson(error, "Failed to save marketing risk list")
  }
}
