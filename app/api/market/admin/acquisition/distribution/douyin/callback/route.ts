import { NextRequest, NextResponse } from "next/server"
import { errorJson } from "@/lib/market/marketing-route"
import { exchangeDouyinCodeForAccount, readSignedOAuthState } from "@/lib/market/direct-publish-accounts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code") || ""
    const state = request.nextUrl.searchParams.get("state") || ""
    const error = request.nextUrl.searchParams.get("error") || ""

    const parsedState = readSignedOAuthState<{ redirectPath?: string }>(state)
    const redirectTarget = new URL(parsedState.redirectPath || "/market/acquisition/distribution", request.nextUrl.origin)

    if (error) {
      redirectTarget.searchParams.set("douyin", "error")
      redirectTarget.searchParams.set("message", error)
      return NextResponse.redirect(redirectTarget)
    }

    if (!code) {
      redirectTarget.searchParams.set("douyin", "missing_code")
      return NextResponse.redirect(redirectTarget)
    }

    await exchangeDouyinCodeForAccount(code)
    redirectTarget.searchParams.set("douyin", "connected")
    return NextResponse.redirect(redirectTarget)
  } catch (err) {
    return errorJson(err, "Douyin authorization failed")
  }
}
