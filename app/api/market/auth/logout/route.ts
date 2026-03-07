import { NextRequest, NextResponse } from "next/server"
import { clearMarketAdminSessionCookie } from "@/lib/market/admin-auth"

export const runtime = "nodejs"

export async function POST(_request: NextRequest) {
  const response = NextResponse.json({ success: true })
  clearMarketAdminSessionCookie(response)
  return response
}
