import { NextRequest, NextResponse } from "next/server"
import { verifyMarketAdminToken } from "@/lib/market/admin-auth"
import { resolveDeploymentRegion } from "@/lib/config/deployment-region"
import { getColdRecallSnapshot, MAX_COLD_USERS } from "@/lib/market/cold-recall"
import { sendTpnsAndroidNotification } from "@/lib/push/tpns"

const TPNS_BATCH_SIZE = 800

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type TargetType = "test" | "cold"

interface SendRequestBody {
  targetType?: TargetType
  title?: string
  content?: string
  deepLink?: string
  deviceToken?: string
  selectedUserIds?: string[]
}

export async function POST(request: NextRequest) {
  const auth = verifyMarketAdminToken(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as SendRequestBody
  const targetType = (body.targetType || "test") as TargetType
  const title = String(body.title || "").trim()
  const content = String(body.content || "").trim()
  const deepLink = String(body.deepLink || "").trim()

  if (!title || !content || !deepLink) {
    return NextResponse.json(
      { success: false, error: "title、content、deepLink 为必填字段" },
      { status: 400 },
    )
  }

  const region = resolveDeploymentRegion()
  const payload = {
    title,
    content,
    customContent: {
      deepLink,
      targetType,
    },
  }

  if (targetType === "test") {
    const token = String(body.deviceToken || "").trim()
    if (!token) {
      return NextResponse.json(
        { success: false, error: "测试推送需要 deviceToken" },
        { status: 400 },
      )
    }
    try {
      await sendTpnsAndroidNotification([{ token }], payload, region)
      return NextResponse.json({ success: true, sentCount: 1 })
    } catch (error) {
      return NextResponse.json(
        { success: false, error: (error as Error)?.message || "TPNS 推送失败" },
        { status: 500 },
      )
    }
  }

  try {
    const requestedUserIds = Array.isArray(body.selectedUserIds)
      ? body.selectedUserIds.map((value) => String(value || "").trim()).filter(Boolean)
      : []
    const snapshot = await getColdRecallSnapshot(region, MAX_COLD_USERS)
    const targetUsers =
      requestedUserIds.length > 0
        ? snapshot.users.filter((user) => requestedUserIds.includes(user.id))
        : snapshot.users

    const tokens = Array.from(
      new Set(
        targetUsers
          .map((user) => String(user.token || "").trim())
          .filter(Boolean),
      ),
    )

    if (requestedUserIds.length > 0 && targetUsers.length === 0) {
      return NextResponse.json(
        { success: false, error: "未找到可发送的冷召回用户" },
        { status: 400 },
      )
    }

    if (tokens.length === 0) {
      return NextResponse.json({ success: true, sentCount: 0 })
    }

    let sent = 0
    const failures: Error[] = []
    for (let index = 0; index < tokens.length; index += TPNS_BATCH_SIZE) {
      const chunk = tokens.slice(index, index + TPNS_BATCH_SIZE)
      try {
        await sendTpnsAndroidNotification(
          chunk.map((token) => ({ token })),
          payload,
          region,
        )
        sent += chunk.length
      } catch (error) {
        failures.push(error as Error)
      }
    }

    if (failures.length) {
      return NextResponse.json(
        {
          success: false,
          error: failures[0]?.message || "部分 TPNS 请求失败",
          sentCount: sent,
          requestedCount: targetUsers.length,
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      sentCount: sent,
      requestedCount: targetUsers.length,
      sendMode: requestedUserIds.length > 0 ? "selected" : "all",
    })
  } catch (error) {
    console.error("[market notifications][send] error", error)
    return NextResponse.json(
      { success: false, error: (error as Error)?.message || "推送失败" },
      { status: 500 },
    )
  }
}
