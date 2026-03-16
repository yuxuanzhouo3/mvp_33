import { NextRequest, NextResponse } from "next/server"
import { verifyMarketAdminToken } from "@/lib/market/admin-auth"
import { resolveDeploymentRegion } from "@/lib/config/deployment-region"
import { getDatabase } from "@/lib/database/cloudbase-service"
import { createAdminClient } from "@/lib/supabase/admin"
import { derivePlatform, mapAndroidDevices } from "@/lib/market/notifications"
import { sendTpnsAndroidNotification } from "@/lib/push/tpns"

type DeploymentRegion = "CN" | "INTL"

const COLD_THRESHOLD_DAYS = 7
const MAX_COLD_USERS = 2000
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
    const tokens = await collectColdTokens(region)
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
        },
        { status: 502 },
      )
    }

    return NextResponse.json({ success: true, sentCount: sent })
  } catch (error) {
    console.error("[market notifications][send] error", error)
    return NextResponse.json(
      { success: false, error: (error as Error)?.message || "推送失败" },
      { status: 500 },
    )
  }
}

async function collectColdTokens(region: DeploymentRegion): Promise<string[]> {
  return region === "CN" ? collectCloudbaseTokens() : collectSupabaseTokens()
}

async function collectCloudbaseTokens(): Promise<string[]> {
  const db = await getDatabase()
  const cmd = db.command
  const cutoffIso = coldCutoff()
  const usersRes = await db
    .collection("users")
    .where(
      cmd.and([
        { region: "cn" },
        cmd.or([{ last_seen_at: cmd.lte(cutoffIso) }, { last_seen_at: cmd.exists(false) }]),
      ]),
    )
    .limit(MAX_COLD_USERS)
    .get()

  const rows: any[] = Array.isArray(usersRes?.data) ? usersRes.data : []
  const userIds = rows
    .map((user) => String(user?.id || user?._id || "").trim())
    .filter(Boolean)
  if (userIds.length === 0) return []

  const devicesRes = await db
    .collection("user_devices")
    .where({ user_id: cmd.in(userIds) })
    .limit(userIds.length * 3)
    .get()

  const deviceMap = mapAndroidDevices((devicesRes?.data || []) as any[])
  return Array.from(deviceMap.values())
    .map((device) => String(device?.push_token || "").trim())
    .filter(Boolean)
}

async function collectSupabaseTokens(): Promise<string[]> {
  const supabase = createAdminClient()
  const cutoffIso = coldCutoff()

  const { data: inactiveUsers, error } = await supabase
    .from("users")
    .select("id, last_seen_at")
    .eq("region", "global")
    .or(`last_seen_at.lte.${cutoffIso},last_seen_at.is.null`)
    .limit(MAX_COLD_USERS)

  if (error) throw error
  const userIds = (inactiveUsers || []).map((user) => user.id).filter(Boolean)
  if (userIds.length === 0) return []

  const { data: devices, error: devicesError } = await supabase
    .from("user_devices")
    .select(
      "user_id, push_token, client_type, device_type, device_brand, device_model, push_token_updated_at, last_active_at, created_at",
    )
    .in("user_id", userIds)

  if (devicesError) throw devicesError

  const deviceMap = mapAndroidDevices(devices || [])
  return Array.from(deviceMap.values())
    .map((device) => String(device?.push_token || "").trim())
    .filter(Boolean)
}

function coldCutoff(): string {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - COLD_THRESHOLD_DAYS)
  return cutoff.toISOString()
}
