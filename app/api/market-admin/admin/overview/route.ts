import { NextRequest, NextResponse } from "next/server"
import { verifyMarketAdminToken } from "@/lib/market/admin-auth"
import { getMarketAdminOverview } from "@/lib/market/referrals"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketAdminToken(request)
  if (!auth.ok) return auth.response

  try {
    const overview = await getMarketAdminOverview()
    return NextResponse.json({ success: true, overview })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load market overview" },
      { status: 500 },
    )
  }
}
