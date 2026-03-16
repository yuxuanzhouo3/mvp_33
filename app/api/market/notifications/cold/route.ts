import { NextRequest, NextResponse } from "next/server"
import { verifyMarketAdminToken } from "@/lib/market/admin-auth"
import { resolveDeploymentRegion } from "@/lib/config/deployment-region"
import { DEFAULT_COLD_PREVIEW_LIMIT, getColdRecallSnapshot } from "@/lib/market/cold-recall"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = verifyMarketAdminToken(request)
  if (!auth.ok) return auth.response

  const rawLimit = Number(request.nextUrl.searchParams.get("limit") || DEFAULT_COLD_PREVIEW_LIMIT)
  const previewLimit = Number.isFinite(rawLimit) ? rawLimit : DEFAULT_COLD_PREVIEW_LIMIT

  try {
    const region = resolveDeploymentRegion()
    const snapshot = await getColdRecallSnapshot(region, previewLimit)

    return NextResponse.json({
      success: true,
      ...snapshot,
    })
  } catch (error) {
    console.error("[market notifications][cold] error", error)
    return NextResponse.json(
      { success: false, error: (error as Error)?.message || "冷召回用户加载失败" },
      { status: 500 },
    )
  }
}
