import { randomUUID } from "crypto"
import { getDatabase } from "@/lib/database/cloudbase-service"
import { resolveDeploymentRegion } from "@/lib/config/deployment-region"
import { getSupabaseAdminForDownloads } from "@/lib/downloads/supabase-admin"
import type {
  AcquisitionBlogger,
  AcquisitionB2BLead,
  AcquisitionVCLead,
  AcquisitionAd,
  AcquisitionBootstrapData,
} from "./acquisition-types"

type RawRow = Record<string, any>

const BLOGGERS_TABLE = "acquisition_bloggers"
const B2B_LEADS_TABLE = "acquisition_b2b_leads"
const VC_LEADS_TABLE = "acquisition_vc_leads"
const ADS_TABLE = "acquisition_ads"

const ALL_ACQUISITION_TABLES = [BLOGGERS_TABLE, B2B_LEADS_TABLE, VC_LEADS_TABLE, ADS_TABLE] as const

function nowIso() {
  return new Date().toISOString()
}

function safeString(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim()
  return normalized || fallback
}

function getRegion() {
  return resolveDeploymentRegion() === "INTL" ? "INTL" : "CN"
}

// ==========================================
// CloudBase helpers (CN stack)
// ==========================================

function isCloudbaseMissingCollection(error: unknown) {
  const message = String((error as any)?.message || "")
  const code = String((error as any)?.code || "")
  return (
    message.includes("Db or Table not exist") ||
    message.includes("DATABASE_COLLECTION_NOT_EXIST") ||
    code.includes("DATABASE_COLLECTION_NOT_EXIST")
  )
}

async function ensureCloudbaseCollections(db: any, names: readonly string[]) {
  for (const name of names) {
    try {
      await db.collection(name).limit(1).get()
    } catch (error) {
      if (!isCloudbaseMissingCollection(error)) throw error
      await db.createCollection(name)
    }
  }
}

async function loadCloudbaseRows(collection: string): Promise<RawRow[]> {
  const db = await getDatabase()
  await ensureCloudbaseCollections(db, [collection])
  const result = await db.collection(collection).get()
  return Array.isArray(result?.data) ? result.data : []
}

async function insertCloudbaseRow(collection: string, row: RawRow): Promise<RawRow> {
  const db = await getDatabase()
  await ensureCloudbaseCollections(db, [collection])
  await db.collection(collection).add(row)
  return row
}

function cloudbaseMatchesFilters(row: RawRow, filters: RawRow) {
  return Object.entries(filters).every(([key, value]) => row?.[key] === value)
}

async function updateCloudbaseRow(collection: string, filters: RawRow, patch: RawRow): Promise<RawRow | null> {
  const db = await getDatabase()
  await ensureCloudbaseCollections(db, [collection])
  const rows = await loadCloudbaseRows(collection)
  const target = rows.find((row) => cloudbaseMatchesFilters(row, filters))
  if (!target?._id) return null
  await db.collection(collection).doc(target._id).update(patch)
  return { ...target, ...patch }
}

// ==========================================
// Supabase helpers (INTL stack)
// ==========================================

async function loadSupabaseRows(table: string): Promise<RawRow[]> {
  const supabase = getSupabaseAdminForDownloads()
  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? data : []
}

async function insertSupabaseRow(table: string, row: RawRow): Promise<RawRow> {
  const supabase = getSupabaseAdminForDownloads()
  const { data, error } = await supabase.from(table).insert(row).select("*").maybeSingle()
  if (error || !data) throw new Error(error?.message || `Failed to insert ${table}`)
  return data
}

async function updateSupabaseRow(table: string, filters: RawRow, patch: RawRow): Promise<RawRow | null> {
  const supabase = getSupabaseAdminForDownloads()
  let query = supabase.from(table).update(patch).select("*")
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value)
  }
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data || null
}

// ==========================================
// Unified CRUD (region-aware)
// ==========================================

async function loadRows(table: string) {
  return getRegion() === "INTL" ? loadSupabaseRows(table) : loadCloudbaseRows(table)
}

async function insertRow(table: string, row: RawRow) {
  return getRegion() === "INTL" ? insertSupabaseRow(table, row) : insertCloudbaseRow(table, row)
}

async function updateRow(table: string, filters: RawRow, patch: RawRow) {
  return getRegion() === "INTL" ? updateSupabaseRow(table, filters, patch) : updateCloudbaseRow(table, filters, patch)
}

// ==========================================
// Row mappers
// ==========================================

function mapBloggerRow(row: RawRow): AcquisitionBlogger {
  return {
    id: safeString(row?.id || row?._id),
    name: safeString(row?.name),
    platform: safeString(row?.platform),
    followers: safeString(row?.followers),
    email: safeString(row?.email),
    status: safeString(row?.status, "未联系"),
    commission: safeString(row?.commission),
    cost: safeString(row?.cost),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function mapB2BLeadRow(row: RawRow): AcquisitionB2BLead {
  return {
    id: safeString(row?.id || row?._id),
    name: safeString(row?.name),
    region: safeString(row?.region),
    contact: safeString(row?.contact),
    email: safeString(row?.email),
    source: safeString(row?.source, "手工录入"),
    status: safeString(row?.status, "初步接触"),
    estValue: safeString(row?.est_value),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function mapVCLeadRow(row: RawRow): AcquisitionVCLead {
  return {
    id: safeString(row?.id || row?._id),
    name: safeString(row?.name),
    region: safeString(row?.region),
    contact: safeString(row?.contact),
    email: safeString(row?.email),
    source: safeString(row?.source, "手工录入"),
    status: safeString(row?.status, "待联系"),
    focus: safeString(row?.focus),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function mapAdRow(row: RawRow): AcquisitionAd {
  return {
    id: safeString(row?.id || row?._id),
    brand: safeString(row?.brand),
    type: safeString(row?.type, "视频广告"),
    duration: safeString(row?.duration, "30s"),
    reward: safeString(row?.reward),
    status: safeString(row?.status, "待审核"),
    views: safeString(row?.views, "0"),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

// ==========================================
// Public API
// ==========================================

// ==========================================
// CN auto-seed (same data as Supabase migration)
// ==========================================

const SEED_BLOGGERS: RawRow[] = [
  { id: "bl-001", name: "科技评测_老马", platform: "B站", followers: "185k", email: "laoma@163.com", status: "已签约", commission: "30%", cost: "¥200/视频" },
  { id: "bl-002", name: "设计日常", platform: "小红书", followers: "42k", email: "hello@qq.com", status: "谈判中", commission: "25%", cost: "¥100/图文" },
  { id: "bl-003", name: "AI工具猎手", platform: "抖音", followers: "120k", email: "hunter@126.com", status: "已发邮件", commission: "20%", cost: "未知" },
]

const SEED_B2B: RawRow[] = [
  { id: "b2b-001", name: "北京某SaaS企业", region: "北京", contact: "张总 (VP)", source: "BD引荐", status: "合同拟定", est_value: "¥50,000" },
  { id: "b2b-002", name: "杭州某电商团队", region: "浙江", contact: "王采购", source: "官网注册", status: "已转化", est_value: "¥12,000" },
]

const SEED_VC: RawRow[] = [
  { id: "vc-001", name: "红杉中国", region: "北京", contact: "Li Wei (合伙人)", source: "BD引荐", status: "初步接触", focus: "AI / SaaS" },
  { id: "vc-002", name: "经纬创投", region: "上海", contact: "David", source: "手工录入", status: "待联系", focus: "前沿科技 / AI" },
]

const SEED_ADS: RawRow[] = [
  { id: "ad-001", brand: "KFC (肯德基)", type: "视频广告", duration: "30s", reward: "1 RMB", status: "投放中", views: "12,450" },
  { id: "ad-002", brand: "某国内云服务", type: "互动广告", duration: "30s", reward: "0.8 RMB", status: "投放中", views: "8,320" },
]

async function ensureCNSeedData(db: any) {
  const now = nowIso()
  const seedMap: Array<{ collection: string; seeds: RawRow[] }> = [
    { collection: BLOGGERS_TABLE, seeds: SEED_BLOGGERS },
    { collection: B2B_LEADS_TABLE, seeds: SEED_B2B },
    { collection: VC_LEADS_TABLE, seeds: SEED_VC },
    { collection: ADS_TABLE, seeds: SEED_ADS },
  ]

  for (const { collection, seeds } of seedMap) {
    const existing = await db.collection(collection).limit(1).get()
    if (Array.isArray(existing?.data) && existing.data.length > 0) continue
    for (const seed of seeds) {
      await db.collection(collection).add({ ...seed, created_at: now, updated_at: now })
    }
  }
}

export async function loadAcquisitionBootstrap(): Promise<AcquisitionBootstrapData> {
  if (getRegion() === "CN") {
    const db = await getDatabase()
    await ensureCloudbaseCollections(db, ALL_ACQUISITION_TABLES)
    await ensureCNSeedData(db)
  }

  const [bloggerRows, b2bRows, vcRows, adRows] = await Promise.all([
    loadRows(BLOGGERS_TABLE),
    loadRows(B2B_LEADS_TABLE),
    loadRows(VC_LEADS_TABLE),
    loadRows(ADS_TABLE),
  ])

  return {
    bloggers: bloggerRows.map(mapBloggerRow),
    b2bLeads: b2bRows.map(mapB2BLeadRow),
    vcLeads: vcRows.map(mapVCLeadRow),
    ads: adRows.map(mapAdRow),
  }
}

export async function insertBlogger(data: {
  name: string
  platform: string
  followers: string
  email: string
  cost: string
  commission: string
}): Promise<AcquisitionBlogger> {
  const now = nowIso()
  const row: RawRow = {
    id: `bl-${randomUUID().slice(0, 8)}`,
    name: data.name,
    platform: data.platform,
    followers: data.followers,
    email: data.email,
    status: "未联系",
    commission: data.commission,
    cost: data.cost,
    created_at: now,
    updated_at: now,
  }
  const result = await insertRow(BLOGGERS_TABLE, row)
  return mapBloggerRow(result)
}

export async function insertB2BLead(data: {
  name: string
  region: string
  contact: string
  email?: string
  estValue: string
}): Promise<AcquisitionB2BLead> {
  const now = nowIso()
  const row: RawRow = {
    id: `b2b-${randomUUID().slice(0, 8)}`,
    name: data.name,
    region: data.region,
    contact: data.contact,
    email: data.email || "",
    source: "手工录入",
    status: "初步接触",
    est_value: data.estValue,
    created_at: now,
    updated_at: now,
  }
  const result = await insertRow(B2B_LEADS_TABLE, row)
  return mapB2BLeadRow(result)
}

export async function updateB2BLeadStatus(id: string, status: string): Promise<AcquisitionB2BLead | null> {
  const result = await updateRow(B2B_LEADS_TABLE, { id }, { status, updated_at: nowIso() })
  return result ? mapB2BLeadRow(result) : null
}

export async function insertVCLead(data: {
  name: string
  region: string
  contact: string
  email?: string
  focus: string
}): Promise<AcquisitionVCLead> {
  const now = nowIso()
  const row: RawRow = {
    id: `vc-${randomUUID().slice(0, 8)}`,
    name: data.name,
    region: data.region,
    contact: data.contact,
    email: data.email || "",
    source: "手工录入",
    status: "待联系",
    focus: data.focus,
    created_at: now,
    updated_at: now,
  }
  const result = await insertRow(VC_LEADS_TABLE, row)
  return mapVCLeadRow(result)
}

export async function updateVCLeadStatus(id: string, status: string): Promise<AcquisitionVCLead | null> {
  const result = await updateRow(VC_LEADS_TABLE, { id }, { status, updated_at: nowIso() })
  return result ? mapVCLeadRow(result) : null
}

export async function insertAd(data: {
  brand: string
  type: string
  duration: string
  reward: string
}): Promise<AcquisitionAd> {
  const now = nowIso()
  const row: RawRow = {
    id: `ad-${randomUUID().slice(0, 8)}`,
    brand: data.brand,
    type: data.type,
    duration: data.duration,
    reward: data.reward,
    status: "待审核",
    views: "0",
    created_at: now,
    updated_at: now,
  }
  const result = await insertRow(ADS_TABLE, row)
  return mapAdRow(result)
}

export async function updateBloggerStatus(id: string, status: string): Promise<AcquisitionBlogger | null> {
  const result = await updateRow(BLOGGERS_TABLE, { id }, { status, updated_at: nowIso() })
  return result ? mapBloggerRow(result) : null
}

export async function updateAd(
  id: string,
  patch: { duration?: string; reward?: string; status?: string },
): Promise<AcquisitionAd | null> {
  const updates: RawRow = { updated_at: nowIso() }
  if (patch.duration !== undefined) updates.duration = patch.duration
  if (patch.reward !== undefined) updates.reward = patch.reward
  if (patch.status !== undefined) updates.status = patch.status
  const result = await updateRow(ADS_TABLE, { id }, updates)
  return result ? mapAdRow(result) : null
}
