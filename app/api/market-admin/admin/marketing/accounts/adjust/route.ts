import { NextRequest } from "next/server"
import { adjustMarketingAsset } from "@/lib/market/marketing"
import { errorJson, readRouteJson, successJson, verifyMarketingAdmin } from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const body = await readRouteJson(request)
    const ledger = await adjustMarketingAsset({
      userId: String(body.userId || ""),
      assetType: String(body.assetType || "points") as "cash" | "points" | "ai_quota" | "vip_duration",
      amount: Number(body.amount || 0),
      remark: String(body.remark || ""),
      operatorId: auth.admin.username,
      expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : body.expiresAt === null ? null : undefined,
      meta: typeof body.meta === "object" && body.meta ? (body.meta as Record<string, unknown>) : undefined,
    })
    return successJson({ ledger })
  } catch (error) {
    return errorJson(error, "Failed to adjust marketing asset")
  }
}
