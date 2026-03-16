import { getDatabase } from "@/lib/database/cloudbase-service"
import { createAdminClient } from "@/lib/supabase/admin"
import { derivePlatform, mapAndroidDevices } from "@/lib/market/notifications"

export type DeploymentRegion = "CN" | "INTL"

export type ColdRecallUser = {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  platform?: string | null
  token: string
  region: DeploymentRegion
  lastSeenAt?: string | null
}

export type ColdRecallSnapshot = {
  inactiveTotalCount: number
  eligibleTotalCount: number
  previewLimit: number
  users: ColdRecallUser[]
  reachedProcessingCap: boolean
}

export const COLD_THRESHOLD_DAYS = 7
export const MAX_COLD_USERS = 2000
export const DEFAULT_COLD_PREVIEW_LIMIT = 120

const CLOUDBASE_PAGE_SIZE = 200
const CLOUDBASE_DEVICE_CHUNK_SIZE = 80
const SUPABASE_DEVICE_CHUNK_SIZE = 500

function coldCutoff(): string {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - COLD_THRESHOLD_DAYS)
  return cutoff.toISOString()
}

function toTimestamp(value?: string | null): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function compareByLastSeen(a?: string | null, b?: string | null): number {
  const aTs = toTimestamp(a)
  const bTs = toTimestamp(b)
  if (!aTs && !bTs) return 0
  if (!aTs) return -1
  if (!bTs) return 1
  return aTs - bTs
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function buildCandidateName(user: any): string {
  return String(user?.full_name || user?.name || user?.username || user?.email || user?.id || user?._id || "未命名用户")
}

function sortRawUsers<T extends { last_seen_at?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => compareByLastSeen(a?.last_seen_at, b?.last_seen_at))
}

async function fetchAllCloudbaseRows(collection: any, maxRows: number): Promise<any[]> {
  const rows: any[] = []
  let offset = 0

  while (offset < maxRows) {
    const batchSize = Math.min(CLOUDBASE_PAGE_SIZE, maxRows - offset)
    const result = await collection.skip(offset).limit(batchSize).get()
    const page = Array.isArray(result?.data) ? result.data : []
    if (page.length === 0) break
    rows.push(...page)
    offset += page.length
    if (page.length < batchSize) break
  }

  return rows
}

async function fetchCloudbaseDeviceMap(userIds: string[]): Promise<Map<string, any>> {
  if (userIds.length === 0) return new Map()

  const db = await getDatabase()
  const cmd = db.command
  const devices: any[] = []

  for (const chunk of chunkArray(userIds, CLOUDBASE_DEVICE_CHUNK_SIZE)) {
    const result = await fetchAllCloudbaseRows(
      db.collection("user_devices").where({ user_id: cmd.in(chunk) }),
      MAX_COLD_USERS * 20,
    )
    devices.push(...result)
  }

  return mapAndroidDevices(devices)
}

async function loadCloudbaseColdRecallUsers(previewLimit: number): Promise<ColdRecallSnapshot> {
  const db = await getDatabase()
  const cmd = db.command
  const cutoffIso = coldCutoff()
  const where = cmd.and([
    { region: "cn" },
    cmd.or([
      { last_seen_at: cmd.lte(cutoffIso) },
      { last_seen_at: null },
      { last_seen_at: cmd.exists(false) },
    ]),
  ])

  const countResult = await db.collection("users").where(where).count()
  const inactiveTotalCount = Number(countResult?.total) || 0
  const rows = sortRawUsers(
    await fetchAllCloudbaseRows(
      db.collection("users").where(where),
      Math.min(inactiveTotalCount, MAX_COLD_USERS),
    ),
  )

  const userIds = rows
    .map((user) => String(user?.id || user?._id || "").trim())
    .filter(Boolean)
  const deviceMap = await fetchCloudbaseDeviceMap(userIds)

  const candidates = rows
    .map<ColdRecallUser | null>((user) => {
      const id = String(user?.id || user?._id || "").trim()
      if (!id) return null
      const device = deviceMap.get(id)
      if (!device) return null
      return {
        id,
        name: buildCandidateName(user),
        email: user?.email || null,
        phone: user?.phone || null,
        platform: derivePlatform(device),
        token: String(device?.push_token || "").trim(),
        region: "CN",
        lastSeenAt: user?.last_seen_at || null,
      }
    })
    .filter((item): item is ColdRecallUser => Boolean(item))

  return {
    inactiveTotalCount,
    eligibleTotalCount: candidates.length,
    previewLimit,
    users: candidates.slice(0, previewLimit),
    reachedProcessingCap: inactiveTotalCount > MAX_COLD_USERS,
  }
}

async function fetchSupabaseDeviceMap(userIds: string[]): Promise<Map<string, any>> {
  if (userIds.length === 0) return new Map()

  const supabase = createAdminClient()
  const devices: any[] = []

  for (const chunk of chunkArray(userIds, SUPABASE_DEVICE_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("user_devices")
      .select(
        "user_id, push_token, client_type, device_type, device_brand, device_model, push_token_updated_at, last_active_at, created_at",
      )
      .in("user_id", chunk)

    if (error) throw error
    devices.push(...(data || []))
  }

  return mapAndroidDevices(devices)
}

async function loadSupabaseColdRecallUsers(previewLimit: number): Promise<ColdRecallSnapshot> {
  const supabase = createAdminClient()
  const cutoffIso = coldCutoff()
  const countQuery = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("region", "global")
    .or(`last_seen_at.lte.${cutoffIso},last_seen_at.is.null`)

  if (countQuery.error) throw countQuery.error

  const inactiveTotalCount = Number(countQuery.count) || 0
  const { data: inactiveUsers, error } = await supabase
    .from("users")
    .select("id, full_name, username, email, phone, last_seen_at")
    .eq("region", "global")
    .or(`last_seen_at.lte.${cutoffIso},last_seen_at.is.null`)
    .order("last_seen_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COLD_USERS)

  if (error) throw error

  const rows = inactiveUsers || []
  const userIds = rows.map((user) => user.id).filter(Boolean)
  const deviceMap = await fetchSupabaseDeviceMap(userIds)

  const candidates = rows
    .map<ColdRecallUser | null>((user) => {
      const device = deviceMap.get(user.id)
      if (!device) return null
      return {
        id: user.id,
        name: buildCandidateName(user),
        email: user.email,
        phone: user.phone,
        platform: derivePlatform(device),
        token: String(device?.push_token || "").trim(),
        region: "INTL",
        lastSeenAt: user.last_seen_at || null,
      }
    })
    .filter((item): item is ColdRecallUser => Boolean(item))

  return {
    inactiveTotalCount,
    eligibleTotalCount: candidates.length,
    previewLimit,
    users: candidates.slice(0, previewLimit),
    reachedProcessingCap: inactiveTotalCount > MAX_COLD_USERS,
  }
}

export async function getColdRecallSnapshot(
  region: DeploymentRegion,
  previewLimit = DEFAULT_COLD_PREVIEW_LIMIT,
): Promise<ColdRecallSnapshot> {
  const safePreviewLimit = Math.max(1, Math.min(previewLimit, MAX_COLD_USERS))
  return region === "CN"
    ? loadCloudbaseColdRecallUsers(safePreviewLimit)
    : loadSupabaseColdRecallUsers(safePreviewLimit)
}
