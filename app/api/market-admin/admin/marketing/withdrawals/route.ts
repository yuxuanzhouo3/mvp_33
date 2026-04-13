import { NextRequest } from "next/server"
import { createMarketingWithdrawalRequest, listMarketingWithdrawals } from "@/lib/market/marketing"
import { errorJson, readRouteJson, successJson, verifyMarketingAdmin } from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const withdrawals = await listMarketingWithdrawals({
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
      userId: searchParams.get("userId") || undefined,
      status: searchParams.get("status") || undefined,
      query: searchParams.get("query") || undefined,
    })
    return successJson({ withdrawals })
  } catch (error) {
    return errorJson(error, "Failed to load marketing withdrawals")
  }
}

export async function POST(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const body = await readRouteJson(request)
    const withdrawal = await createMarketingWithdrawalRequest({
      userId: String(body.userId || ""),
      amount: Number(body.amount || 0),
      channel: typeof body.channel === "string" ? body.channel : undefined,
      meta: typeof body.meta === "object" && body.meta ? (body.meta as Record<string, unknown>) : undefined,
    })
    return successJson({ withdrawal })
  } catch (error) {
    return errorJson(error, "Failed to create withdrawal request")
  }
}
