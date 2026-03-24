import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { verifyCloudBaseSession } from "@/lib/cloudbase/auth"
import { IS_DOMESTIC_VERSION } from "@/config"
import { getUserInviteCenterData } from "@/lib/market/referrals"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    let userId = ""

    if (IS_DOMESTIC_VERSION) {
      const cloudbaseUser = await verifyCloudBaseSession(request)
      if (!cloudbaseUser?.id) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
      }
      userId = cloudbaseUser.id
    } else {
      const supabase = await createClient()
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      if (error || !user?.id) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
      }
      userId = user.id
    }

    const inviteRewards = await getUserInviteCenterData({
      userId,
      origin: process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin,
    })

    return NextResponse.json({ success: true, inviteRewards })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load invite rewards" },
      { status: 500 },
    )
  }
}
