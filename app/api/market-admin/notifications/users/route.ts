import { NextRequest, NextResponse } from "next/server"
import { verifyMarketAdminToken } from "@/lib/market/admin-auth"
import { resolveDeploymentRegion } from "@/lib/config/deployment-region"
import { getDatabase } from "@/lib/database/cloudbase-service"
import { createAdminClient } from "@/lib/supabase/admin"
import { derivePlatform, mapAndroidDevices } from "@/lib/market/notifications"

type DeploymentRegion = "CN" | "INTL"

type NotificationUser = {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  platform?: string | null
  token: string
  region: DeploymentRegion
  lastSeenAt?: string | null
}

const MIN_QUERY_LENGTH = 2
const MAX_RESULTS = 20

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = verifyMarketAdminToken(request)
  if (!auth.ok) return auth.response

  const query = request.nextUrl.searchParams.get("q")?.trim() || ""
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ success: true, users: [] })
  }

  try {
    const region = resolveDeploymentRegion()
    const users =
      region === "CN"
        ? await searchCloudbaseUsers(query)
        : await searchSupabaseUsers(query)

    return NextResponse.json({ success: true, users })
  } catch (error) {
    console.error("[market notifications][users] error", error)
    return NextResponse.json(
      { success: false, error: (error as Error)?.message || "Failed to search users" },
      { status: 500 },
    )
  }
}

async function searchCloudbaseUsers(query: string): Promise<NotificationUser[]> {
  const db = await getDatabase()
  const cmd = db.command
  const reg = db.RegExp({ regexp: query, options: "i" })

  const result = await db
    .collection("users")
    .where(
      cmd.and([
        { region: "cn" },
        cmd.or([
          { full_name: reg },
          { name: reg },
          { email: reg },
          { phone: reg },
          { username: reg },
          { id: reg },
          { _id: reg },
        ]),
      ]),
    )
    .limit(MAX_RESULTS)
    .get()

  const rows: any[] = Array.isArray(result?.data) ? result.data : []
  const userIds = rows.map((user) => String(user?.id || user?._id || "").trim()).filter(Boolean)
  if (userIds.length === 0) return []

  const latestDevices = await Promise.all(
    userIds.map(async (userId) => {
      const devicesRes = await db
        .collection("user_devices")
        .where({ user_id: userId })
        .orderBy("last_active_at", "desc")
        .limit(20)
        .get()

      const devices: any[] = Array.isArray(devicesRes?.data) ? devicesRes.data : []
      return mapAndroidDevices(devices).get(userId) || null
    }),
  )

  const deviceByUser = new Map<string, any>()
  latestDevices.forEach((device) => {
    const userId = String(device?.user_id || "").trim()
    if (userId && device) {
      deviceByUser.set(userId, device)
    }
  })

  return rows
    .map<NotificationUser | null>((user) => {
      const id = String(user?.id || user?._id || "").trim()
      if (!id) return null
      const device = deviceByUser.get(id)
      if (!device) return null
      return {
        id,
        name: String(user?.full_name || user?.name || user?.username || user?.email || id),
        email: user?.email || null,
        phone: user?.phone || null,
        platform: derivePlatform(device),
        token: String(device?.push_token || "").trim(),
        region: "CN",
        lastSeenAt: user?.last_seen_at || null,
      }
    })
    .filter((item): item is NotificationUser => Boolean(item))
}

async function searchSupabaseUsers(query: string): Promise<NotificationUser[]> {
  const supabase = createAdminClient()
  const pattern = `%${escapeLike(query)}%`
  const { data: users, error } = await supabase
    .from("users")
    .select("id, full_name, username, email, phone, region, last_seen_at")
    .or(
      [
        `full_name.ilike.${pattern}`,
        `username.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
        `id.ilike.${pattern}`,
      ].join(","),
    )
    .eq("region", "global")
    .limit(MAX_RESULTS)

  if (error) throw error
  const rows = users || []
  const userIds = rows.map((user) => user.id).filter(Boolean)
  if (userIds.length === 0) return []

  const { data: devices, error: deviceError } = await supabase
    .from("user_devices")
    .select(
      "user_id, push_token, client_type, device_type, device_brand, device_model, push_token_updated_at, last_active_at, created_at",
    )
    .in("user_id", userIds)

  if (deviceError) throw deviceError
  const deviceByUser = mapAndroidDevices(devices || [])

  return rows
    .map<NotificationUser | null>((user) => {
      const device = deviceByUser.get(user.id)
      if (!device) return null
      return {
        id: user.id,
        name: user.full_name || user.username || user.email || user.id,
        email: user.email,
        phone: user.phone,
        platform: derivePlatform(device),
        token: String(device?.push_token || "").trim(),
        region: "INTL",
        lastSeenAt: user.last_seen_at || null,
      }
    })
    .filter((item): item is NotificationUser => Boolean(item))
}

function escapeLike(value: string): string {
  return value.replace(/%/g, "\\%").replace(/_/g, "\\_")
}
