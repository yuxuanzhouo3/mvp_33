import { NextRequest } from "next/server"
import { reviewMarketingWithdrawal } from "@/lib/market/marketing"
import { errorJson, readRouteJson, successJson, verifyMarketingAdmin } from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const params = await context.params
    const body = await readRouteJson(request)
    const withdrawal = await reviewMarketingWithdrawal({
      id: params.id,
      status: String(body.status || "frozen") as "approved" | "rejected" | "frozen",
      reviewNote: typeof body.reviewNote === "string" ? body.reviewNote : null,
      operatorId: auth.admin.username,
    })
    return successJson({ withdrawal })
  } catch (error) {
    return errorJson(error, "Failed to review withdrawal")
  }
}
