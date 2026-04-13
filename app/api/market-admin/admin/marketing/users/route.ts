import { NextRequest } from "next/server"
import { getMarketingUserById } from "@/lib/market/marketing"
import { errorJson, successJson, verifyMarketingAdmin } from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const userId = request.nextUrl.searchParams.get("userId")?.trim() || ""
    if (!userId) {
      return errorJson(new Error("userId is required"), "userId is required", 400)
    }

    const user = await getMarketingUserById(userId)
    return successJson({ user })
  } catch (error) {
    return errorJson(error, "Failed to lookup marketing user")
  }
}
