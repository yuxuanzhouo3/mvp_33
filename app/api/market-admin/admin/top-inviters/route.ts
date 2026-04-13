import { NextRequest, NextResponse } from "next/server"
import { verifyMarketAdminToken } from "@/lib/market/admin-auth"
import { getMarketAdminTopInviters } from "@/lib/market/referrals"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketAdminToken(request)
  if (!auth.ok) return auth.response

  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") || 20)
    const inviters = await getMarketAdminTopInviters({ limit })
    return NextResponse.json({ success: true, inviters })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load top inviters" },
      { status: 500 },
    )
  }
}
