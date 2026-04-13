import { NextRequest, NextResponse } from "next/server"
import { verifyMarketingAdmin } from "@/lib/market/marketing-route"
import { buildSignedOAuthState } from "@/lib/market/direct-publish-accounts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  const clientKey = process.env.DOUYIN_CLIENT_KEY || process.env.MARKET_DOUYIN_CLIENT_KEY || ""
  if (!clientKey) {
    return NextResponse.redirect(new URL("/market/acquisition/distribution?douyin=missing_client_key", request.nextUrl.origin))
  }

  const callbackUrl = new URL("/api/market/admin/acquisition/distribution/douyin/callback", request.nextUrl.origin)
  const state = buildSignedOAuthState({
    platform: "douyin",
    redirectPath: "/market/acquisition/distribution",
  })

  const authorizeUrl = new URL("https://open.douyin.com/platform/oauth/connect/")
  authorizeUrl.searchParams.set("client_key", clientKey)
  authorizeUrl.searchParams.set("response_type", "code")
  authorizeUrl.searchParams.set("scope", "video.create,user_info")
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl.toString())
  authorizeUrl.searchParams.set("state", state)

  return NextResponse.redirect(authorizeUrl)
}
