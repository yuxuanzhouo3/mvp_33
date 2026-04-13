import { createHash, randomBytes } from "crypto"
import type { NextRequest } from "next/server"
import { getDatabase } from "@/lib/database/cloudbase-service"
import { resolveDeploymentRegion } from "@/lib/config/deployment-region"
import { getSupabaseAdminForDownloads } from "@/lib/downloads/supabase-admin"
import { SupabaseAdminAdapter } from "@/lib/admin/supabase-adapter"
import { CloudBaseAdminAdapter } from "@/lib/admin/cloudbase-adapter"

export type ReferralRegion = "CN" | "INTL"

export const REFERRAL_ATTRIBUTION_COOKIE = "mk_ref"
export const REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

const REFERRAL_LINKS_COLLECTION = "referral_links"
const REFERRAL_CLICKS_COLLECTION = "referral_clicks"
const REFERRAL_RELATIONS_COLLECTION = "referral_relations"
const REFERRAL_REWARDS_COLLECTION = "referral_rewards"
const CN_USERS_COLLECTION = "users"
const CN_CREDIT_TX_COLLECTION = "credit_transactions"

const SHARE_CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ"
const SHARE_CODE_LENGTH = 8
const USER_REFERRAL_CODE_LENGTH = 8

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

const REFERRAL_INVITER_SIGNUP_BONUS = parsePositiveInt(process.env.REFERRAL_INVITER_SIGNUP_BONUS, 60)
const REFERRAL_INVITED_SIGNUP_BONUS = parsePositiveInt(process.env.REFERRAL_INVITED_SIGNUP_BONUS, 20)
const REFERRAL_INVITER_FIRST_USE_BONUS = parsePositiveInt(process.env.REFERRAL_INVITER_FIRST_USE_BONUS, 20)
const REFERRAL_INVITED_FIRST_USE_BONUS = parsePositiveInt(process.env.REFERRAL_INVITED_FIRST_USE_BONUS, 10)

// 推荐注册获得的优惠券折扣 (0.8 表示 8 折)
const REFERRAL_INVITED_COUPON_DISCOUNT = Number(process.env.REFERRAL_INVITED_COUPON_DISCOUNT || "0.8")
const REFERRAL_COUPON_EXPIRE_DAYS = parsePositiveInt(process.env.REFERRAL_COUPON_EXPIRE_DAYS, 30)

function nowIso() {
  return new Date().toISOString()
}

function normalizeShareCode(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64)
}

function normalizeToolSlug(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 64)
}

function normalizeSource(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32)
}

function normalizeUserId(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 128)
}

function toIsoDateKey(value?: string | null) {
  const raw = String(value || "").trim()
  if (!raw) return null

  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function parsePage(value: number | string | undefined, fallback = 1) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.floor(parsed)
}

function parseLimit(value: number | string | undefined, fallback: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(max, Math.floor(parsed))
}

function safeNumber(value: any) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function hashSensitive(value?: string | null) {
  const raw = String(value || "").trim()
  if (!raw) return null
  return createHash("sha256").update(raw).digest("hex").slice(0, 32)
}

function getRegion(): ReferralRegion {
  return resolveDeploymentRegion() === "INTL" ? "INTL" : "CN"
}

function toShareCode(length = SHARE_CODE_LENGTH) {
  const bytes = randomBytes(length)
  let out = ""
  for (let i = 0; i < length; i += 1) {
    out += SHARE_CODE_ALPHABET[bytes[i] % SHARE_CODE_ALPHABET.length]
  }
  return out
}

function withSiteOrigin(origin?: string | null) {
  const base = String(origin || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim()
  return base.endsWith("/") ? base.slice(0, -1) : base
}

async function ensureCloudbaseCollections(db: any, names: string[]) {
  for (const name of names) {
    try {
      await db.collection(name).limit(1).get()
    } catch (error: any) {
      const message = String(error?.message || "")
      const code = String(error?.code || "")
      const missing =
        message.includes("Db or Table not exist") ||
        message.includes("DATABASE_COLLECTION_NOT_EXIST") ||
        code.includes("DATABASE_COLLECTION_NOT_EXIST")

      if (!missing) {
        throw error
      }

      await db.createCollection(name)
    }
  }
}

async function ensureCloudbaseReferralCollections(db: any) {
  await ensureCloudbaseCollections(db, [
    REFERRAL_LINKS_COLLECTION,
    REFERRAL_CLICKS_COLLECTION,
    REFERRAL_RELATIONS_COLLECTION,
    REFERRAL_REWARDS_COLLECTION,
    CN_CREDIT_TX_COLLECTION,
  ])
}

export interface ReferralLinkRecord {
  id: string
  creatorUserId: string
  toolSlug: string
  shareCode: string
  sourceDefault?: string | null
  clickCount: number
  isActive: boolean
  createdAt: string
  expiresAt?: string | null
}

export interface ReferralAttribution {
  shareCode: string
  source?: string | null
  toolSlug?: string | null
  ts: number
}

export interface ReferralStats {
  linkCount: number
  clickCount: number
  invitedCount: number
  conversionRate: number
  rewardCredits: number
  inviterSignupBonus: number
  invitedSignupBonus: number
  inviterFirstUseBonus: number
  invitedFirstUseBonus: number
}

export interface UserInviteCenterData {
  referralCode: string
  shareUrl: string
  clickCount: number
  invitedCount: number
  conversionRate: number
  rewardCredits: number
  inviterSignupBonus: number
  invitedSignupBonus: number
  inviterFirstUseBonus: number
  invitedFirstUseBonus: number
}

export interface ResolvedReferralOwner {
  creatorUserId: string
  shareCode: string
  toolSlug?: string | null
  sourceDefault?: string | null
  isActive: boolean
  codeType: "link" | "referral_code"
}

export interface AdminReferralOverview {
  totalRelations: number
  totalClicks: number
  totalRewardCredits: number
  usersWithReferralCode: number
}

export interface ReferralFirstUseRewardResult {
  handled: boolean
  reason?: "missing_user_id" | "no_relation" | "self_referral" | "relation_incomplete"
  relationId?: string
  inviterUserId?: string
  invitedUserId?: string
  inviterRewardGranted?: boolean
  invitedRewardGranted?: boolean
  alreadyProcessed?: boolean
}

export interface MarketOverviewData {
  totalClicks: number
  totalInvites: number
  totalActivated: number
  totalRewardCredits: number
  signupRewardCredits: number
  firstUseRewardCredits: number
  conversionRate: number
  activationRate: number
  usersWithReferralCode: number
}

export interface MarketTrendPoint {
  date: string
  clicks: number
  invites: number
  activated: number
  rewardCredits: number
}

export interface MarketChannelPoint {
  source: string
  clicks: number
  invites: number
  conversionRate: number
}

export interface MarketTopInviterPoint {
  inviterUserId: string
  inviterEmail: string | null
  referralCode: string | null
  clickCount: number
  invitedCount: number
  activatedCount: number
  rewardCredits: number
}

export interface MarketRelationRow {
  relationId: string
  inviterUserId: string
  inviterEmail: string | null
  invitedUserId: string
  invitedEmail: string | null
  shareCode: string
  toolSlug: string | null
  firstToolId: string | null
  status: string
  createdAt: string
  activatedAt: string | null
}

export interface MarketRewardRow {
  rewardId: string
  relationId: string | null
  userId: string
  userEmail: string | null
  rewardType: string
  amount: number
  status: string
  referenceId: string
  createdAt: string
  grantedAt: string | null
}

export interface MarketListResult<T> {
  page: number
  limit: number
  total: number
  rows: T[]
}

export interface CreateReferralLinkInput {
  creatorUserId: string
  toolSlug: string
  sourceDefault?: string
  origin?: string
}

export interface CreateReferralLinkResult {
  link: ReferralLinkRecord
  shareUrl: string
  referralCode: string
}

function mapIntlLink(row: any): ReferralLinkRecord {
  return {
    id: String(row?.id || ""),
    creatorUserId: String(row?.creator_user_id || ""),
    toolSlug: String(row?.tool_slug || ""),
    shareCode: String(row?.share_code || ""),
    sourceDefault: row?.source_default || null,
    clickCount: Number(row?.click_count || 0),
    isActive: Boolean(row?.is_active),
    createdAt: String(row?.created_at || nowIso()),
    expiresAt: row?.expires_at || null,
  }
}

function mapCnLink(row: any): ReferralLinkRecord {
  return {
    id: String(row?._id || row?.id || ""),
    creatorUserId: String(row?.creator_user_id || ""),
    toolSlug: String(row?.tool_slug || ""),
    shareCode: String(row?.share_code || ""),
    sourceDefault: row?.source_default || null,
    clickCount: Number(row?.click_count || 0),
    isActive: Boolean(row?.is_active !== false),
    createdAt: String(row?.created_at || nowIso()),
    expiresAt: row?.expires_at || null,
  }
}

function mapIntlRelationRow(row: any) {
  return {
    id: String(row?.id || ""),
    inviterUserId: String(row?.inviter_user_id || ""),
    invitedUserId: String(row?.invited_user_id || ""),
    shareCode: String(row?.share_code || ""),
    toolSlug: row?.tool_slug ? String(row.tool_slug) : null,
    firstToolId: row?.first_tool_id ? String(row.first_tool_id) : null,
    status: String(row?.status || "bound"),
    createdAt: String(row?.created_at || nowIso()),
    activatedAt: row?.activated_at ? String(row.activated_at) : null,
  }
}

function mapCnRelationRow(row: any) {
  return {
    id: String(row?._id || row?.id || ""),
    inviterUserId: String(row?.inviter_user_id || ""),
    invitedUserId: String(row?.invited_user_id || ""),
    shareCode: String(row?.share_code || ""),
    toolSlug: row?.tool_slug ? String(row.tool_slug) : null,
    firstToolId: row?.first_tool_id ? String(row.first_tool_id) : null,
    status: String(row?.status || "bound"),
    createdAt: String(row?.created_at || nowIso()),
    activatedAt: row?.activated_at ? String(row.activated_at) : null,
  }
}

function mapIntlRewardRow(row: any) {
  return {
    rewardId: String(row?.id || ""),
    relationId: row?.relation_id ? String(row.relation_id) : null,
    userId: String(row?.user_id || ""),
    rewardType: String(row?.reward_type || ""),
    amount: safeNumber(row?.amount),
    status: String(row?.status || "granted"),
    referenceId: String(row?.reference_id || ""),
    createdAt: String(row?.created_at || nowIso()),
    grantedAt: row?.granted_at ? String(row.granted_at) : null,
  }
}

function mapCnRewardRow(row: any) {
  return {
    rewardId: String(row?._id || row?.id || ""),
    relationId: row?.relation_id ? String(row.relation_id) : null,
    userId: String(row?.user_id || ""),
    rewardType: String(row?.reward_type || ""),
    amount: safeNumber(row?.amount),
    status: String(row?.status || "granted"),
    referenceId: String(row?.reference_id || ""),
    createdAt: String(row?.created_at || nowIso()),
    grantedAt: row?.granted_at ? String(row.granted_at) : null,
  }
}

async function loadIntlUser(userId: string) {
  const supabase = getSupabaseAdminForDownloads()
  const { data, error } = await supabase
    .from("users")
    .select("id,email,credits,referral_code,referred_by")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }
  return data || null
}

async function loadIntlUserByReferralCode(referralCode: string) {
  const code = normalizeShareCode(referralCode)
  if (!code) return null

  const supabase = getSupabaseAdminForDownloads()
  const { data, error } = await supabase
    .from("users")
    .select("id,email,credits,referral_code,referred_by")
    .eq("referral_code", code)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }
  return data || null
}

async function loadCnUserById(userId: string) {
  const db = await getCnDatabase()
  const byBusinessId = await db.collection(CN_USERS_COLLECTION).where({ id: userId }).limit(1).get()
  if (byBusinessId?.data?.[0]) {
    return { db, user: byBusinessId.data[0] }
  }
  const byDocId = await db.collection(CN_USERS_COLLECTION).where({ _id: userId }).limit(1).get()
  return { db, user: byDocId?.data?.[0] || null }
}

async function loadCnUserByReferralCode(referralCode: string) {
  const code = normalizeShareCode(referralCode)
  if (!code) {
    return { db: await getCnDatabase(), user: null }
  }

  const db = await getCnDatabase()
  const result = await db.collection(CN_USERS_COLLECTION).where({ referral_code: code }).limit(1).get()
  return { db, user: result?.data?.[0] || null }
}

async function loadIntlUsersByIds(userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds.map((item) => normalizeUserId(item)).filter(Boolean)))
  if (uniqueIds.length === 0) {
    return new Map<string, { id: string; email: string | null; referralCode: string | null }>()
  }

  const supabase = getSupabaseAdminForDownloads()
  const { data, error } = await supabase
    .from("users")
    .select("id,email,referral_code")
    .in("id", uniqueIds)

  if (error) {
    throw new Error(error.message)
  }

  const map = new Map<string, { id: string; email: string | null; referralCode: string | null }>()
  for (const row of data || []) {
    const id = String((row as any)?.id || "")
    if (!id) continue
    map.set(id, {
      id,
      email: row?.email ? String(row.email) : null,
      referralCode: row?.referral_code ? String((row as any).referral_code) : null,
    })
  }
  return map
}

async function loadCnUsersByIds(userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds.map((item) => normalizeUserId(item)).filter(Boolean)))
  const map = new Map<string, { id: string; email: string | null; referralCode: string | null }>()
  if (uniqueIds.length === 0) return map

  const db = await getCnDatabase()
  const result = await db.collection(CN_USERS_COLLECTION).get()
  const rows = Array.isArray(result?.data) ? result.data : []
  const idSet = new Set(uniqueIds)
  for (const row of rows) {
    const id = String((row as any)?.id || (row as any)?._id || "")
    if (!id || !idSet.has(id)) continue
    map.set(id, {
      id,
      email: row?.email ? String((row as any).email) : null,
      referralCode: row?.referral_code ? String((row as any).referral_code) : null,
    })
  }
  return map
}

async function getCnDatabase() {
  const db = await getDatabase()
  await ensureCloudbaseCollections(db, [CN_USERS_COLLECTION])
  return db
}

async function findUniqueUserReferralCode(region: ReferralRegion) {
  for (let i = 0; i < 12; i += 1) {
    const code = toShareCode(USER_REFERRAL_CODE_LENGTH)
    if (region === "INTL") {
      const supabase = getSupabaseAdminForDownloads()
      const { data, error } = await supabase
        .from("users")
        .select("id")
        .eq("referral_code", code)
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) return code
      continue
    }

    const db = await getCnDatabase()
    const existing = await db.collection(CN_USERS_COLLECTION).where({ referral_code: code }).limit(1).get()
    if (!existing?.data?.[0]) return code
  }

  throw new Error("Failed to generate unique referral code")
}

async function findUniqueShareCode(region: ReferralRegion) {
  for (let i = 0; i < 16; i += 1) {
    const shareCode = toShareCode(SHARE_CODE_LENGTH)
    if (region === "INTL") {
      const supabase = getSupabaseAdminForDownloads()
      const { data, error } = await supabase
        .from("referral_links")
        .select("id")
        .eq("share_code", shareCode)
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) return shareCode
      continue
    }

    const db = await getDatabase()
    await ensureCloudbaseReferralCollections(db)
    const existing = await db.collection(REFERRAL_LINKS_COLLECTION).where({ share_code: shareCode }).limit(1).get()
    if (!existing?.data?.[0]) return shareCode
  }

  throw new Error("Failed to generate unique share code")
}

export async function ensureUserReferralCode(input: { userId: string; userEmail?: string | null }) {
  const userId = String(input.userId || "").trim()
  if (!userId) {
    throw new Error("userId is required")
  }

  const region = getRegion()
  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const user = await loadIntlUser(userId)
    if (!user?.id) {
      throw new Error("User not found")
    }

    const existingCode = normalizeShareCode(user.referral_code)
    if (existingCode) {
      return existingCode
    }

    const referralCode = await findUniqueUserReferralCode("INTL")
    const { error } = await supabase.from("users").update({ referral_code: referralCode }).eq("id", userId)
    if (error) {
      throw new Error(error.message)
    }
    return referralCode
  }

  const { db, user } = await loadCnUserById(userId)
  const fallbackEmail = String(input.userEmail || "").trim().toLowerCase()
  const targetUser =
    user ||
    (fallbackEmail
      ? (await db.collection(CN_USERS_COLLECTION).where({ email: fallbackEmail }).limit(1).get())?.data?.[0]
      : null)

  if (!targetUser?._id) {
    throw new Error("User not found")
  }

  const existingCode = normalizeShareCode(targetUser.referral_code)
  if (existingCode) {
    return existingCode
  }

  const referralCode = await findUniqueUserReferralCode("CN")
  await db.collection(CN_USERS_COLLECTION).doc(targetUser._id).update({
    referral_code: referralCode,
    updatedAt: nowIso(),
    updated_at: new Date(),
  })
  return referralCode
}

export function buildReferralShareUrl(input: { shareCode: string; source?: string | null; origin?: string | null }) {
  const origin = withSiteOrigin(input.origin)
  const code = normalizeShareCode(input.shareCode)
  const source = normalizeSource(input.source)
  if (!code) return `${origin}/`
  if (!source) return `${origin}/r/${code}`
  return `${origin}/r/${code}?source=${encodeURIComponent(source)}`
}

export async function createReferralLink(input: CreateReferralLinkInput): Promise<CreateReferralLinkResult> {
  const creatorUserId = String(input.creatorUserId || "").trim()
  const toolSlug = normalizeToolSlug(input.toolSlug)
  const sourceDefault = normalizeSource(input.sourceDefault)

  if (!creatorUserId || !toolSlug) {
    throw new Error("creatorUserId and toolSlug are required")
  }

  const region = getRegion()
  const referralCode = await ensureUserReferralCode({ userId: creatorUserId })
  const shareCode = await findUniqueShareCode(region)
  const createdAt = nowIso()

  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data, error } = await supabase
      .from("referral_links")
      .insert({
        creator_user_id: creatorUserId,
        tool_slug: toolSlug,
        share_code: shareCode,
        source_default: sourceDefault || null,
        is_active: true,
        click_count: 0,
        created_at: createdAt,
      })
      .select("*")
      .maybeSingle()

    if (error || !data) {
      throw new Error(error?.message || "Failed to create referral link")
    }

    const link = mapIntlLink(data)
    return {
      link,
      shareUrl: buildReferralShareUrl({ shareCode: link.shareCode, source: link.sourceDefault, origin: input.origin }),
      referralCode,
    }
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)
  const result = await db.collection(REFERRAL_LINKS_COLLECTION).add({
    creator_user_id: creatorUserId,
    tool_slug: toolSlug,
    share_code: shareCode,
    source_default: sourceDefault || null,
    is_active: true,
    click_count: 0,
    created_at: createdAt,
    updated_at: createdAt,
  })
  const created = await db.collection(REFERRAL_LINKS_COLLECTION).where({ _id: result.id }).limit(1).get()
  const link = mapCnLink(created?.data?.[0] || {})
  return {
    link,
    shareUrl: buildReferralShareUrl({ shareCode: link.shareCode, source: link.sourceDefault, origin: input.origin }),
    referralCode,
  }
}

export async function listReferralLinksByUser(userId: string, limit = 50): Promise<ReferralLinkRecord[]> {
  const normalizedUserId = String(userId || "").trim()
  if (!normalizedUserId) {
    throw new Error("userId is required")
  }

  const safeLimit = Math.max(1, Math.min(100, Number(limit || 50)))
  const region = getRegion()

  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data, error } = await supabase
      .from("referral_links")
      .select("*")
      .eq("creator_user_id", normalizedUserId)
      .order("created_at", { ascending: false })
      .limit(safeLimit)

    if (error) {
      throw new Error(error.message)
    }
    return (data || []).map(mapIntlLink)
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)
  const result = await db.collection(REFERRAL_LINKS_COLLECTION).where({ creator_user_id: normalizedUserId }).get()
  const rawRows = Array.isArray(result?.data) ? result.data : []
  const rows: ReferralLinkRecord[] = rawRows.map((row: unknown) => mapCnLink(row))
  return rows.sort((a: ReferralLinkRecord, b: ReferralLinkRecord) => (a.createdAt > b.createdAt ? -1 : 1)).slice(0, safeLimit)
}

export async function resolveReferralLinkByShareCode(shareCode: string): Promise<ReferralLinkRecord | null> {
  const code = normalizeShareCode(shareCode)
  if (!code) return null

  const region = getRegion()
  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data, error } = await supabase
      .from("referral_links")
      .select("*")
      .eq("share_code", code)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    return data ? mapIntlLink(data) : null
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)
  const result = await db.collection(REFERRAL_LINKS_COLLECTION).where({ share_code: code }).limit(1).get()
  const row = result?.data?.[0]
  return row ? mapCnLink(row) : null
}

export async function resolveReferralOwnerByShareCode(shareCode: string): Promise<ResolvedReferralOwner | null> {
  const code = normalizeShareCode(shareCode)
  if (!code) return null

  const link = await resolveReferralLinkByShareCode(code)
  if (link?.creatorUserId) {
    return {
      creatorUserId: link.creatorUserId,
      shareCode: link.shareCode,
      toolSlug: link.toolSlug || null,
      sourceDefault: link.sourceDefault || null,
      isActive: link.isActive,
      codeType: "link",
    }
  }

  const region = getRegion()
  if (region === "INTL") {
    const user = await loadIntlUserByReferralCode(code)
    if (!user?.id) return null
    return {
      creatorUserId: String(user.id),
      shareCode: code,
      toolSlug: null,
      sourceDefault: null,
      isActive: true,
      codeType: "referral_code",
    }
  }

  const { user } = await loadCnUserByReferralCode(code)
  if (!user?._id) return null
  return {
    creatorUserId: String(user.id || user._id),
    shareCode: code,
    toolSlug: null,
    sourceDefault: null,
    isActive: true,
    codeType: "referral_code",
  }
}

export function getClientIpFromRequest(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for") || ""
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null
  }
  return request.headers.get("x-real-ip") || null
}

export async function recordReferralClick(input: {
  shareCode: string
  source?: string | null
  ip?: string | null
  userAgent?: string | null
  landingPath?: string | null
}) {
  const code = normalizeShareCode(input.shareCode)
  if (!code) return

  const source = normalizeSource(input.source)
  const createdAt = nowIso()
  const payload = {
    share_code: code,
    source: source || null,
    ip_hash: hashSensitive(input.ip),
    user_agent_hash: hashSensitive(input.userAgent),
    landing_path: String(input.landingPath || "").slice(0, 255) || null,
    created_at: createdAt,
  }

  const region = getRegion()
  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { error } = await supabase.from("referral_clicks").insert(payload)
    if (error) throw new Error(error.message)

    const { data: linkRow, error: loadLinkError } = await supabase
      .from("referral_links")
      .select("id,click_count")
      .eq("share_code", code)
      .maybeSingle()

    if (!loadLinkError && linkRow?.id) {
      await supabase.from("referral_links").update({ click_count: Number(linkRow.click_count || 0) + 1 }).eq("id", linkRow.id)
    }
    return
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)
  await db.collection(REFERRAL_CLICKS_COLLECTION).add(payload)

  const linkResult = await db.collection(REFERRAL_LINKS_COLLECTION).where({ share_code: code }).limit(1).get()
  const link = linkResult?.data?.[0]
  if (link?._id) {
    await db.collection(REFERRAL_LINKS_COLLECTION).doc(link._id).update({
      click_count: Number(link.click_count || 0) + 1,
      updated_at: createdAt,
    })
  }
}

export function encodeReferralAttributionCookie(value: ReferralAttribution) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
}

export function decodeReferralAttributionCookie(value?: string | null): ReferralAttribution | null {
  if (!value) return null
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
    const shareCode = normalizeShareCode(decoded?.shareCode)
    if (!shareCode) return null

    const ts = Number(decoded?.ts || 0)
    const now = Date.now()
    if (!Number.isFinite(ts) || ts <= 0 || now - ts > REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS * 1000) {
      return null
    }

    return {
      shareCode,
      source: normalizeSource(decoded?.source) || null,
      toolSlug: normalizeToolSlug(decoded?.toolSlug) || null,
      ts,
    }
  } catch {
    return null
  }
}

export function extractReferralAttribution(request: NextRequest): ReferralAttribution | null {
  const queryRef = normalizeShareCode(request.nextUrl.searchParams.get("ref"))
  if (queryRef) {
    return {
      shareCode: queryRef,
      source: normalizeSource(request.nextUrl.searchParams.get("source")) || null,
      toolSlug: normalizeToolSlug(request.nextUrl.pathname.split("/")[2] || "") || null,
      ts: Date.now(),
    }
  }

  return decodeReferralAttributionCookie(request.cookies.get(REFERRAL_ATTRIBUTION_COOKIE)?.value || null)
}

async function grantReferralCredits(input: {
  region: ReferralRegion
  userId: string
  amount: number
  referenceId: string
  description: string
}) {
  const amount = Number(input.amount || 0)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { granted: false, alreadyProcessed: false, newCredits: undefined as number | undefined }
  }

  const referenceId = String(input.referenceId || "").trim()
  if (!referenceId) {
    throw new Error("referenceId is required")
  }

  if (input.region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data: existingTx, error: existingError } = await supabase
      .from("credit_transactions")
      .select("id")
      .eq("reference_id", referenceId)
      .maybeSingle()

    if (existingError) throw new Error(existingError.message)
    if (existingTx?.id) {
      return { granted: false, alreadyProcessed: true, newCredits: undefined as number | undefined }
    }

    const user = await loadIntlUser(input.userId)
    if (!user?.id) {
      throw new Error("User not found for reward credits")
    }

    const currentCredits = Number(user.credits || 0)
    const nextCredits = (Number.isFinite(currentCredits) ? currentCredits : 0) + amount

    const { error: txError } = await supabase.from("credit_transactions").insert({
      user_id: input.userId,
      type: "adjustment",
      amount,
      description: input.description,
      reference_id: referenceId,
    })
    if (txError) {
      const duplicate = String(txError.message || "").toLowerCase().includes("duplicate")
      if (duplicate) {
        return { granted: false, alreadyProcessed: true, newCredits: undefined as number | undefined }
      }
      throw new Error(txError.message)
    }

    const { error: updateError } = await supabase.from("users").update({ credits: nextCredits }).eq("id", input.userId)
    if (updateError) {
      await supabase.from("credit_transactions").delete().eq("reference_id", referenceId)
      throw new Error(updateError.message)
    }

    return { granted: true, alreadyProcessed: false, newCredits: nextCredits }
  }

  const { db, user } = await loadCnUserById(input.userId)
  await ensureCloudbaseReferralCollections(db)

  if (!user?._id) {
    throw new Error("User not found for reward credits")
  }

  const existing = await db.collection(CN_CREDIT_TX_COLLECTION).where({ reference_id: referenceId }).limit(1).get()
  if (existing?.data?.[0]) {
    return { granted: false, alreadyProcessed: true, newCredits: undefined as number | undefined }
  }

  const currentCredits = Number(user.credits || 0)
  const nextCredits = (Number.isFinite(currentCredits) ? currentCredits : 0) + amount

  const txResult = await db.collection(CN_CREDIT_TX_COLLECTION).add({
    user_id: String(user.id || user._id),
    type: "referral_reward",
    amount,
    description: input.description,
    reference_id: referenceId,
    created_at: nowIso(),
  })

  try {
    await db.collection(CN_USERS_COLLECTION).doc(user._id).update({
      credits: nextCredits,
      updatedAt: nowIso(),
      updated_at: new Date(),
    })
  } catch (error) {
    if (txResult?.id) {
      await db.collection(CN_CREDIT_TX_COLLECTION).doc(txResult.id).remove().catch(() => null)
    }
    throw error
  }

  return { granted: true, alreadyProcessed: false, newCredits: nextCredits }
}

export async function recordReferralReward(input: {
  region: ReferralRegion
  relationId: string
  userId: string
  rewardType: string
  amount: number
  referenceId: string
  status: "granted" | "pending"
}) {
  if (!input.referenceId || input.amount <= 0) return

  if (input.region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data: existing, error: existingError } = await supabase
      .from("referral_rewards")
      .select("id")
      .eq("reference_id", input.referenceId)
      .maybeSingle()
    if (existingError) throw new Error(existingError.message)
    if (existing?.id) return

    const { error } = await supabase.from("referral_rewards").insert({
      relation_id: input.relationId,
      user_id: input.userId,
      reward_type: input.rewardType,
      amount: input.amount,
      status: input.status,
      reference_id: input.referenceId,
      created_at: nowIso(),
      granted_at: input.status === "granted" ? nowIso() : null,
    })
    if (error) throw new Error(error.message)
    return
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)
  const existing = await db.collection(REFERRAL_REWARDS_COLLECTION).where({ reference_id: input.referenceId }).limit(1).get()
  if (existing?.data?.[0]) return

  await db.collection(REFERRAL_REWARDS_COLLECTION).add({
    relation_id: input.relationId,
    user_id: input.userId,
    reward_type: input.rewardType,
    amount: input.amount,
    status: input.status,
    reference_id: input.referenceId,
    created_at: nowIso(),
    granted_at: input.status === "granted" ? nowIso() : null,
  })
}

async function markReferralClickRegistered(input: {
  region: ReferralRegion
  shareCode: string
  invitedUserId: string
}) {
  const shareCode = normalizeShareCode(input.shareCode)
  const invitedUserId = normalizeUserId(input.invitedUserId)
  if (!shareCode || !invitedUserId) return

  if (input.region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data: clickRow, error: clickError } = await supabase
      .from("referral_clicks")
      .select("id")
      .eq("share_code", shareCode)
      .is("registered_user_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (clickError) {
      throw new Error(clickError.message)
    }

    if (!clickRow?.id) return

    const { error: updateError } = await supabase
      .from("referral_clicks")
      .update({ registered_user_id: invitedUserId })
      .eq("id", clickRow.id)
      .is("registered_user_id", null)

    if (updateError) {
      throw new Error(updateError.message)
    }
    return
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)

  const clicksResult = await db.collection(REFERRAL_CLICKS_COLLECTION).where({ share_code: shareCode }).get()
  const clicks = Array.isArray(clicksResult?.data) ? clicksResult.data : []
  const target = clicks
    .filter((row: any) => !row?.registered_user_id)
    .sort((a: any, b: any) => (String(a?.created_at || "") < String(b?.created_at || "") ? 1 : -1))[0]

  if (!target?._id) return

  await db.collection(REFERRAL_CLICKS_COLLECTION).doc(target._id).update({
    registered_user_id: invitedUserId,
    updated_at: nowIso(),
  })
}

export async function bindReferralFromRequest(input: {
  request: NextRequest
  invitedUserId?: string | null
  invitedEmail?: string | null
}) {
  const invitedUserId = String(input.invitedUserId || "").trim()
  if (!invitedUserId) {
    return { bound: false, reason: "missing_user_id" as const }
  }

  const attribution = extractReferralAttribution(input.request)
  if (!attribution?.shareCode) {
    return { bound: false, reason: "no_attribution" as const }
  }

  const referralOwner = await resolveReferralOwnerByShareCode(attribution.shareCode)
  if (!referralOwner || !referralOwner.isActive) {
    return { bound: false, reason: "invalid_share_code" as const }
  }

  if (referralOwner.creatorUserId === invitedUserId) {
    return { bound: false, reason: "self_referral" as const }
  }

  const region = getRegion()
  const relationCreatedAt = nowIso()
  const relationToolSlug = normalizeToolSlug(attribution.toolSlug || referralOwner.toolSlug || "") || null
  let relationId = ""

  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data: existingRelation, error: existingError } = await supabase
      .from("referral_relations")
      .select("id,inviter_user_id")
      .eq("invited_user_id", invitedUserId)
      .maybeSingle()

    if (existingError) throw new Error(existingError.message)
    if (existingRelation?.id) {
      return { bound: false, reason: "already_bound" as const, relationId: String(existingRelation.id) }
    }

    const { data: createdRelation, error: createError } = await supabase
      .from("referral_relations")
      .insert({
        inviter_user_id: referralOwner.creatorUserId,
        invited_user_id: invitedUserId,
        share_code: referralOwner.shareCode,
        tool_slug: relationToolSlug,
        status: "bound",
        created_at: relationCreatedAt,
      })
      .select("id")
      .maybeSingle()

    if (createError || !createdRelation?.id) {
      throw new Error(createError?.message || "Failed to create referral relation")
    }
    relationId = String(createdRelation.id)

    const invitedUser = await loadIntlUser(invitedUserId)
    if (!invitedUser?.referred_by) {
      await supabase
        .from("users")
        .update({ referred_by: referralOwner.creatorUserId, referred_at: relationCreatedAt })
        .eq("id", invitedUserId)
        .is("referred_by", null)
    }
  } else {
    const db = await getDatabase()
    await ensureCloudbaseReferralCollections(db)

    const existingRelation = await db
      .collection(REFERRAL_RELATIONS_COLLECTION)
      .where({ invited_user_id: invitedUserId })
      .limit(1)
      .get()

    if (existingRelation?.data?.[0]?._id) {
      return { bound: false, reason: "already_bound" as const, relationId: String(existingRelation.data[0]._id) }
    }

    const relationResult = await db.collection(REFERRAL_RELATIONS_COLLECTION).add({
      inviter_user_id: referralOwner.creatorUserId,
      invited_user_id: invitedUserId,
      share_code: referralOwner.shareCode,
      tool_slug: relationToolSlug,
      status: "bound",
      created_at: relationCreatedAt,
    })

    relationId = String(relationResult.id)

    const invitedUserResult = await db.collection(CN_USERS_COLLECTION).where({ id: invitedUserId }).limit(1).get()
    const invitedUser = invitedUserResult?.data?.[0]
    if (invitedUser?._id && !invitedUser?.referred_by) {
      await db.collection(CN_USERS_COLLECTION).doc(invitedUser._id).update({
        referred_by: referralOwner.creatorUserId,
        referred_at: relationCreatedAt,
        updatedAt: relationCreatedAt,
        updated_at: new Date(),
      })
    }
  }

  await markReferralClickRegistered({
    region,
    shareCode: referralOwner.shareCode,
    invitedUserId,
  }).catch(() => null)

  // 为被推荐人发放注册优惠券
  return {
    bound: true,
    relationId,
    shareCode: referralOwner.shareCode,
    inviterUserId: referralOwner.creatorUserId,
    invitedUserId,
    inviterReward: 0,
    invitedReward: 0,
  }
}

/**
 * 为被推荐人发放注册优惠券
 */
export async function grantReferralCoupon(input: {
  region: ReferralRegion
  userId: string
}) {
  const discount = REFERRAL_INVITED_COUPON_DISCOUNT
  if (discount <= 0 || discount >= 1) {
    return { granted: false, reason: "invalid_discount_config" }
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REFERRAL_COUPON_EXPIRE_DAYS)

  try {
    if (input.region === "INTL") {
      const adapter = new SupabaseAdminAdapter()
      await adapter.createCoupon({
        user_id: input.userId,
        discount_ratio: discount,
        expires_at: expiresAt.toISOString(),
      })
    } else {
      const adapter = new CloudBaseAdminAdapter()
      await adapter.createCoupon({
        user_id: input.userId,
        discount_ratio: discount,
        expires_at: expiresAt.toISOString(),
      })
    }
    return { granted: true }
  } catch (error) {
    console.error("[Referrals] Failed to grant referral coupon:", error)
    return { granted: false, reason: "adapter_error" }
  }
}

export async function grantReferralFirstUseReward(input: {
  invitedUserId?: string | null
  toolId?: string | null
}): Promise<ReferralFirstUseRewardResult> {
  const invitedUserId = normalizeUserId(input.invitedUserId)
  if (!invitedUserId) {
    return { handled: false, reason: "missing_user_id" }
  }

  const firstToolId = normalizeToolSlug(input.toolId || "") || null
  const region = getRegion()
  const activatedAt = nowIso()
  let relationId = ""
  let inviterUserId = ""

  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data: relationRow, error: relationError } = await supabase
      .from("referral_relations")
      .select("id,inviter_user_id,invited_user_id,activated_at,first_tool_id")
      .eq("invited_user_id", invitedUserId)
      .maybeSingle()

    if (relationError) throw new Error(relationError.message)
    if (!relationRow?.id) {
      return { handled: false, reason: "no_relation" }
    }

    relationId = String(relationRow.id)
    inviterUserId = normalizeUserId(relationRow.inviter_user_id)
    if (!inviterUserId) {
      return { handled: false, reason: "relation_incomplete", relationId }
    }
    if (inviterUserId === invitedUserId) {
      return { handled: false, reason: "self_referral", relationId }
    }

    const relationPatch: Record<string, any> = {}
    if (!relationRow.activated_at) {
      relationPatch.activated_at = activatedAt
    }
    if (!relationRow.first_tool_id && firstToolId) {
      relationPatch.first_tool_id = firstToolId
    }

    if (Object.keys(relationPatch).length > 0) {
      const { error: updateRelationError } = await supabase
        .from("referral_relations")
        .update(relationPatch)
        .eq("id", relationId)
      if (updateRelationError) throw new Error(updateRelationError.message)
    }
  } else {
    const db = await getDatabase()
    await ensureCloudbaseReferralCollections(db)

    const relationResult = await db.collection(REFERRAL_RELATIONS_COLLECTION).where({ invited_user_id: invitedUserId }).limit(1).get()
    const relationRow = relationResult?.data?.[0] || null
    if (!relationRow?._id) {
      return { handled: false, reason: "no_relation" }
    }

    relationId = String(relationRow._id)
    inviterUserId = normalizeUserId(relationRow.inviter_user_id)
    if (!inviterUserId) {
      return { handled: false, reason: "relation_incomplete", relationId }
    }
    if (inviterUserId === invitedUserId) {
      return { handled: false, reason: "self_referral", relationId }
    }

    const relationPatch: Record<string, any> = {}
    if (!relationRow.activated_at) {
      relationPatch.activated_at = activatedAt
    }
    if (!relationRow.first_tool_id && firstToolId) {
      relationPatch.first_tool_id = firstToolId
    }

    if (Object.keys(relationPatch).length > 0) {
      relationPatch.updated_at = activatedAt
      await db.collection(REFERRAL_RELATIONS_COLLECTION).doc(relationId).update(relationPatch)
    }
  }

  const inviterReferenceId = `ref_first_use_inviter_${relationId}`
  const invitedReferenceId = `ref_first_use_invited_${relationId}`

  const inviterCreditResult = await grantReferralCredits({
    region,
    userId: inviterUserId,
    amount: REFERRAL_INVITER_FIRST_USE_BONUS,
    referenceId: inviterReferenceId,
    description: `Referral first-use reward (inviter): ${invitedUserId}${firstToolId ? ` via ${firstToolId}` : ""}`,
  })

  const invitedCreditResult = await grantReferralCredits({
    region,
    userId: invitedUserId,
    amount: REFERRAL_INVITED_FIRST_USE_BONUS,
    referenceId: invitedReferenceId,
    description: `Referral first-use reward (invited): ${inviterUserId}${firstToolId ? ` via ${firstToolId}` : ""}`,
  })

  if (inviterCreditResult.granted || inviterCreditResult.alreadyProcessed) {
    await recordReferralReward({
      region,
      relationId,
      userId: inviterUserId,
      rewardType: "first_use_inviter",
      amount: REFERRAL_INVITER_FIRST_USE_BONUS,
      referenceId: inviterReferenceId,
      status: "granted",
    })
  }

  if (invitedCreditResult.granted || invitedCreditResult.alreadyProcessed) {
    await recordReferralReward({
      region,
      relationId,
      userId: invitedUserId,
      rewardType: "first_use_invited",
      amount: REFERRAL_INVITED_FIRST_USE_BONUS,
      referenceId: invitedReferenceId,
      status: "granted",
    })
  }

  return {
    handled: true,
    relationId,
    inviterUserId,
    invitedUserId,
    inviterRewardGranted: inviterCreditResult.granted,
    invitedRewardGranted: invitedCreditResult.granted,
    alreadyProcessed: inviterCreditResult.alreadyProcessed && invitedCreditResult.alreadyProcessed,
  }
}

export async function getReferralStatsByUser(userId: string): Promise<ReferralStats> {
  const normalizedUserId = String(userId || "").trim()
  if (!normalizedUserId) {
    throw new Error("userId is required")
  }

  const region = getRegion()

  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data: links, error: linksError } = await supabase
      .from("referral_links")
      .select("share_code,click_count")
      .eq("creator_user_id", normalizedUserId)

    if (linksError) throw new Error(linksError.message)

    const linkCount = Number(links?.length || 0)
    const clickCount = (links || []).reduce((sum: number, row: any) => sum + Number(row?.click_count || 0), 0)

    const { count: invitedCount, error: invitedError } = await supabase
      .from("referral_relations")
      .select("id", { count: "exact", head: true })
      .eq("inviter_user_id", normalizedUserId)

    if (invitedError) throw new Error(invitedError.message)

    const { data: rewards, error: rewardError } = await supabase
      .from("referral_rewards")
      .select("amount")
      .eq("user_id", normalizedUserId)
      .eq("status", "granted")

    if (rewardError) throw new Error(rewardError.message)
    const rewardCredits = (rewards || []).reduce((sum: number, row: any) => sum + Number(row?.amount || 0), 0)

    return {
      linkCount,
      clickCount,
      invitedCount: Number(invitedCount || 0),
      conversionRate: clickCount > 0 ? Number((((invitedCount || 0) / clickCount) * 100).toFixed(2)) : 0,
      rewardCredits,
      inviterSignupBonus: REFERRAL_INVITER_SIGNUP_BONUS,
      invitedSignupBonus: REFERRAL_INVITED_SIGNUP_BONUS,
      inviterFirstUseBonus: REFERRAL_INVITER_FIRST_USE_BONUS,
      invitedFirstUseBonus: REFERRAL_INVITED_FIRST_USE_BONUS,
    }
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)

  const linksResult = await db.collection(REFERRAL_LINKS_COLLECTION).where({ creator_user_id: normalizedUserId }).get()
  const links = linksResult?.data || []
  const linkCount = links.length
  const clickCount = links.reduce((sum: number, row: any) => sum + Number(row?.click_count || 0), 0)

  const relationResult = await db.collection(REFERRAL_RELATIONS_COLLECTION).where({ inviter_user_id: normalizedUserId }).get()
  const invitedCount = Array.isArray(relationResult?.data) ? relationResult.data.length : 0

  const rewardsResult = await db
    .collection(REFERRAL_REWARDS_COLLECTION)
    .where({ user_id: normalizedUserId, status: "granted" })
    .get()
  const rewardCredits = (rewardsResult?.data || []).reduce((sum: number, row: any) => sum + Number(row?.amount || 0), 0)

  return {
    linkCount,
    clickCount,
    invitedCount,
    conversionRate: clickCount > 0 ? Number(((invitedCount / clickCount) * 100).toFixed(2)) : 0,
    rewardCredits,
    inviterSignupBonus: REFERRAL_INVITER_SIGNUP_BONUS,
    invitedSignupBonus: REFERRAL_INVITED_SIGNUP_BONUS,
    inviterFirstUseBonus: REFERRAL_INVITER_FIRST_USE_BONUS,
    invitedFirstUseBonus: REFERRAL_INVITED_FIRST_USE_BONUS,
  }
}

export async function getUserInviteCenterData(input: { userId: string; origin?: string | null }): Promise<UserInviteCenterData> {
  const userId = String(input.userId || "").trim()
  if (!userId) {
    throw new Error("userId is required")
  }

  const region = getRegion()
  const referralCode = await ensureUserReferralCode({ userId })
  const shareUrl = buildReferralShareUrl({
    shareCode: referralCode,
    origin: withSiteOrigin(input.origin),
  })

  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()

    const { count: clickCountRaw, error: clickError } = await supabase
      .from("referral_clicks")
      .select("id", { count: "exact", head: true })
      .eq("share_code", referralCode)
    if (clickError) throw new Error(clickError.message)

    const { count: invitedCountRaw, error: invitedError } = await supabase
      .from("referral_relations")
      .select("id", { count: "exact", head: true })
      .eq("inviter_user_id", userId)
    if (invitedError) throw new Error(invitedError.message)

    const { data: rewards, error: rewardError } = await supabase
      .from("referral_rewards")
      .select("amount")
      .eq("user_id", userId)
      .eq("status", "granted")
    if (rewardError) throw new Error(rewardError.message)

    const clickCount = Number(clickCountRaw || 0)
    const invitedCount = Number(invitedCountRaw || 0)
    const rewardCredits = (rewards || []).reduce((sum: number, row: any) => sum + Number(row?.amount || 0), 0)

    return {
      referralCode,
      shareUrl,
      clickCount,
      invitedCount,
      conversionRate: clickCount > 0 ? Number(((invitedCount / clickCount) * 100).toFixed(2)) : 0,
      rewardCredits,
      inviterSignupBonus: REFERRAL_INVITER_SIGNUP_BONUS,
      invitedSignupBonus: REFERRAL_INVITED_SIGNUP_BONUS,
      inviterFirstUseBonus: REFERRAL_INVITER_FIRST_USE_BONUS,
      invitedFirstUseBonus: REFERRAL_INVITED_FIRST_USE_BONUS,
    }
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)

  const clicksResult = await db.collection(REFERRAL_CLICKS_COLLECTION).where({ share_code: referralCode }).get()
  const clickCount = Array.isArray(clicksResult?.data) ? clicksResult.data.length : 0

  const relationResult = await db.collection(REFERRAL_RELATIONS_COLLECTION).where({ inviter_user_id: userId }).get()
  const invitedCount = Array.isArray(relationResult?.data) ? relationResult.data.length : 0

  const rewardsResult = await db
    .collection(REFERRAL_REWARDS_COLLECTION)
    .where({ user_id: userId, status: "granted" })
    .get()
  const rewardCredits = (rewardsResult?.data || []).reduce((sum: number, row: any) => sum + Number(row?.amount || 0), 0)

  return {
    referralCode,
    shareUrl,
    clickCount,
    invitedCount,
    conversionRate: clickCount > 0 ? Number(((invitedCount / clickCount) * 100).toFixed(2)) : 0,
    rewardCredits,
    inviterSignupBonus: REFERRAL_INVITER_SIGNUP_BONUS,
    invitedSignupBonus: REFERRAL_INVITED_SIGNUP_BONUS,
    inviterFirstUseBonus: REFERRAL_INVITER_FIRST_USE_BONUS,
    invitedFirstUseBonus: REFERRAL_INVITED_FIRST_USE_BONUS,
  }
}

export async function getAdminReferralOverview(): Promise<AdminReferralOverview> {
  const region = getRegion()

  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()

    const { count: totalRelationsRaw, error: relationsError } = await supabase
      .from("referral_relations")
      .select("id", { count: "exact", head: true })
    if (relationsError) throw new Error(relationsError.message)

    const { count: totalClicksRaw, error: clicksError } = await supabase
      .from("referral_clicks")
      .select("id", { count: "exact", head: true })
    if (clicksError) throw new Error(clicksError.message)

    const { count: usersWithCodeRaw, error: usersError } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .not("referral_code", "is", null)
    if (usersError) throw new Error(usersError.message)

    const { data: rewards, error: rewardError } = await supabase
      .from("referral_rewards")
      .select("amount")
      .eq("status", "granted")
    if (rewardError) throw new Error(rewardError.message)

    return {
      totalRelations: Number(totalRelationsRaw || 0),
      totalClicks: Number(totalClicksRaw || 0),
      totalRewardCredits: (rewards || []).reduce((sum: number, row: any) => sum + Number(row?.amount || 0), 0),
      usersWithReferralCode: Number(usersWithCodeRaw || 0),
    }
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)
  await ensureCloudbaseCollections(db, [CN_USERS_COLLECTION])

  const [relationsResult, clicksResult, rewardsResult, usersResult] = await Promise.all([
    db.collection(REFERRAL_RELATIONS_COLLECTION).get(),
    db.collection(REFERRAL_CLICKS_COLLECTION).get(),
    db.collection(REFERRAL_REWARDS_COLLECTION).where({ status: "granted" }).get(),
    db.collection(CN_USERS_COLLECTION).get(),
  ])

  const totalRelations = Array.isArray(relationsResult?.data) ? relationsResult.data.length : 0
  const totalClicks = Array.isArray(clicksResult?.data) ? clicksResult.data.length : 0
  const totalRewardCredits = (rewardsResult?.data || []).reduce((sum: number, row: any) => sum + Number(row?.amount || 0), 0)
  const usersWithReferralCode = (usersResult?.data || []).filter((row: any) => normalizeShareCode(row?.referral_code)).length

  return {
    totalRelations,
    totalClicks,
    totalRewardCredits,
    usersWithReferralCode,
  }
}

function createDateBuckets(days: number) {
  const safeDays = Math.max(1, Math.min(90, Math.floor(days)))
  const buckets: MarketTrendPoint[] = []
  const map = new Map<string, MarketTrendPoint>()
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  for (let i = safeDays - 1; i >= 0; i -= 1) {
    const cursor = new Date(end)
    cursor.setUTCDate(end.getUTCDate() - i)
    const key = cursor.toISOString().slice(0, 10)
    const point: MarketTrendPoint = { date: key, clicks: 0, invites: 0, activated: 0, rewardCredits: 0 }
    buckets.push(point)
    map.set(key, point)
  }

  return { buckets, map, safeDays }
}

export async function getMarketAdminOverview(): Promise<MarketOverviewData> {
  const region = getRegion()

  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()

    const [
      relationCountResult,
      clickCountResult,
      activatedCountResult,
      usersWithCodeResult,
      rewardsResult,
    ] = await Promise.all([
      supabase.from("referral_relations").select("id", { count: "exact", head: true }),
      supabase.from("referral_clicks").select("id", { count: "exact", head: true }),
      supabase.from("referral_relations").select("id", { count: "exact", head: true }).not("activated_at", "is", null),
      supabase.from("users").select("id", { count: "exact", head: true }).not("referral_code", "is", null),
      supabase.from("referral_rewards").select("amount,reward_type").eq("status", "granted"),
    ])

    if (relationCountResult.error) throw new Error(relationCountResult.error.message)
    if (clickCountResult.error) throw new Error(clickCountResult.error.message)
    if (activatedCountResult.error) throw new Error(activatedCountResult.error.message)
    if (usersWithCodeResult.error) throw new Error(usersWithCodeResult.error.message)
    if (rewardsResult.error) throw new Error(rewardsResult.error.message)

    const totalInvites = safeNumber(relationCountResult.count)
    const totalClicks = safeNumber(clickCountResult.count)
    const totalActivated = safeNumber(activatedCountResult.count)

    let totalRewardCredits = 0
    let signupRewardCredits = 0
    let firstUseRewardCredits = 0
    for (const row of rewardsResult.data || []) {
      const amount = safeNumber((row as any)?.amount)
      const type = String((row as any)?.reward_type || "")
      totalRewardCredits += amount
      if (type === "signup_inviter" || type === "signup_invited") {
        signupRewardCredits += amount
      }
      if (type === "first_use_inviter" || type === "first_use_invited") {
        firstUseRewardCredits += amount
      }
    }

    return {
      totalClicks,
      totalInvites,
      totalActivated,
      totalRewardCredits,
      signupRewardCredits,
      firstUseRewardCredits,
      conversionRate: totalClicks > 0 ? Number(((totalInvites / totalClicks) * 100).toFixed(2)) : 0,
      activationRate: totalInvites > 0 ? Number(((totalActivated / totalInvites) * 100).toFixed(2)) : 0,
      usersWithReferralCode: safeNumber(usersWithCodeResult.count),
    }
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)
  await ensureCloudbaseCollections(db, [CN_USERS_COLLECTION])

  const [relationsResult, clicksResult, rewardsResult, usersResult] = await Promise.all([
    db.collection(REFERRAL_RELATIONS_COLLECTION).get(),
    db.collection(REFERRAL_CLICKS_COLLECTION).get(),
    db.collection(REFERRAL_REWARDS_COLLECTION).where({ status: "granted" }).get(),
    db.collection(CN_USERS_COLLECTION).get(),
  ])

  const relations = Array.isArray(relationsResult?.data) ? relationsResult.data : []
  const clicks = Array.isArray(clicksResult?.data) ? clicksResult.data : []
  const rewards = Array.isArray(rewardsResult?.data) ? rewardsResult.data : []
  const users = Array.isArray(usersResult?.data) ? usersResult.data : []

  const totalInvites = relations.length
  const totalClicks = clicks.length
  const totalActivated = relations.filter((row: any) => Boolean(row?.activated_at)).length
  const usersWithReferralCode = users.filter((row: any) => normalizeShareCode(row?.referral_code)).length

  let totalRewardCredits = 0
  let signupRewardCredits = 0
  let firstUseRewardCredits = 0
  for (const row of rewards) {
    const amount = safeNumber((row as any)?.amount)
    const type = String((row as any)?.reward_type || "")
    totalRewardCredits += amount
    if (type === "signup_inviter" || type === "signup_invited") signupRewardCredits += amount
    if (type === "first_use_inviter" || type === "first_use_invited") firstUseRewardCredits += amount
  }

  return {
    totalClicks,
    totalInvites,
    totalActivated,
    totalRewardCredits,
    signupRewardCredits,
    firstUseRewardCredits,
    conversionRate: totalClicks > 0 ? Number(((totalInvites / totalClicks) * 100).toFixed(2)) : 0,
    activationRate: totalInvites > 0 ? Number(((totalActivated / totalInvites) * 100).toFixed(2)) : 0,
    usersWithReferralCode,
  }
}

export async function getMarketAdminTrends(input?: { days?: number | string }): Promise<MarketTrendPoint[]> {
  const region = getRegion()
  const days = parseLimit(input?.days, 14, 90)
  const { buckets, map } = createDateBuckets(days)
  const startDate = buckets[0]?.date ? `${buckets[0].date}T00:00:00.000Z` : nowIso()

  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const [clicksResult, invitesResult, activatedResult, rewardsResult] = await Promise.all([
      supabase.from("referral_clicks").select("created_at").gte("created_at", startDate),
      supabase.from("referral_relations").select("created_at").gte("created_at", startDate),
      supabase.from("referral_relations").select("activated_at").not("activated_at", "is", null).gte("activated_at", startDate),
      supabase.from("referral_rewards").select("created_at,amount").eq("status", "granted").gte("created_at", startDate),
    ])

    if (clicksResult.error) throw new Error(clicksResult.error.message)
    if (invitesResult.error) throw new Error(invitesResult.error.message)
    if (activatedResult.error) throw new Error(activatedResult.error.message)
    if (rewardsResult.error) throw new Error(rewardsResult.error.message)

    for (const row of clicksResult.data || []) {
      const key = toIsoDateKey((row as any)?.created_at)
      const bucket = key ? map.get(key) : null
      if (bucket) bucket.clicks += 1
    }

    for (const row of invitesResult.data || []) {
      const key = toIsoDateKey((row as any)?.created_at)
      const bucket = key ? map.get(key) : null
      if (bucket) bucket.invites += 1
    }

    for (const row of activatedResult.data || []) {
      const key = toIsoDateKey((row as any)?.activated_at)
      const bucket = key ? map.get(key) : null
      if (bucket) bucket.activated += 1
    }

    for (const row of rewardsResult.data || []) {
      const key = toIsoDateKey((row as any)?.created_at)
      const bucket = key ? map.get(key) : null
      if (bucket) bucket.rewardCredits += safeNumber((row as any)?.amount)
    }

    return buckets
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)

  const [clicksResult, relationsResult, rewardsResult] = await Promise.all([
    db.collection(REFERRAL_CLICKS_COLLECTION).get(),
    db.collection(REFERRAL_RELATIONS_COLLECTION).get(),
    db.collection(REFERRAL_REWARDS_COLLECTION).where({ status: "granted" }).get(),
  ])

  const clicks = Array.isArray(clicksResult?.data) ? clicksResult.data : []
  const relations = Array.isArray(relationsResult?.data) ? relationsResult.data : []
  const rewards = Array.isArray(rewardsResult?.data) ? rewardsResult.data : []

  for (const row of clicks) {
    const key = toIsoDateKey((row as any)?.created_at)
    const bucket = key ? map.get(key) : null
    if (bucket) bucket.clicks += 1
  }

  for (const row of relations) {
    const createdKey = toIsoDateKey((row as any)?.created_at)
    const createdBucket = createdKey ? map.get(createdKey) : null
    if (createdBucket) createdBucket.invites += 1

    const activatedKey = toIsoDateKey((row as any)?.activated_at)
    const activatedBucket = activatedKey ? map.get(activatedKey) : null
    if (activatedBucket) activatedBucket.activated += 1
  }

  for (const row of rewards) {
    const key = toIsoDateKey((row as any)?.created_at)
    const bucket = key ? map.get(key) : null
    if (bucket) bucket.rewardCredits += safeNumber((row as any)?.amount)
  }

  return buckets
}

export async function getMarketAdminChannels(input?: { limit?: number | string }): Promise<MarketChannelPoint[]> {
  const region = getRegion()
  const limit = parseLimit(input?.limit, 12, 50)
  const bySource = new Map<string, { clicks: number; invites: number }>()

  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data, error } = await supabase.from("referral_clicks").select("source,registered_user_id")
    if (error) throw new Error(error.message)

    for (const row of data || []) {
      const source = normalizeSource((row as any)?.source) || "unknown"
      const current = bySource.get(source) || { clicks: 0, invites: 0 }
      current.clicks += 1
      if ((row as any)?.registered_user_id) {
        current.invites += 1
      }
      bySource.set(source, current)
    }
  } else {
    const db = await getDatabase()
    await ensureCloudbaseReferralCollections(db)
    const result = await db.collection(REFERRAL_CLICKS_COLLECTION).get()
    const rows = Array.isArray(result?.data) ? result.data : []

    for (const row of rows) {
      const source = normalizeSource((row as any)?.source) || "unknown"
      const current = bySource.get(source) || { clicks: 0, invites: 0 }
      current.clicks += 1
      if ((row as any)?.registered_user_id) {
        current.invites += 1
      }
      bySource.set(source, current)
    }
  }

  return Array.from(bySource.entries())
    .map(([source, metrics]) => ({
      source,
      clicks: metrics.clicks,
      invites: metrics.invites,
      conversionRate: metrics.clicks > 0 ? Number(((metrics.invites / metrics.clicks) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => (b.clicks === a.clicks ? b.invites - a.invites : b.clicks - a.clicks))
    .slice(0, limit)
}

export async function getMarketAdminTopInviters(input?: { limit?: number | string }): Promise<MarketTopInviterPoint[]> {
  const region = getRegion()
  const limit = parseLimit(input?.limit, 20, 100)

  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data: relationRows, error: relationError } = await supabase
      .from("referral_relations")
      .select("inviter_user_id,activated_at")

    if (relationError) throw new Error(relationError.message)

    const metricsByInviter = new Map<string, { invitedCount: number; activatedCount: number; rewardCredits: number; clickCount: number }>()
    for (const row of relationRows || []) {
      const inviterUserId = normalizeUserId((row as any)?.inviter_user_id)
      if (!inviterUserId) continue
      const current = metricsByInviter.get(inviterUserId) || { invitedCount: 0, activatedCount: 0, rewardCredits: 0, clickCount: 0 }
      current.invitedCount += 1
      if ((row as any)?.activated_at) {
        current.activatedCount += 1
      }
      metricsByInviter.set(inviterUserId, current)
    }

    const sortedInviterIds = Array.from(metricsByInviter.entries())
      .sort((a, b) => (b[1].invitedCount === a[1].invitedCount ? b[1].activatedCount - a[1].activatedCount : b[1].invitedCount - a[1].invitedCount))
      .slice(0, limit)
      .map(([inviterUserId]) => inviterUserId)

    if (sortedInviterIds.length === 0) return []

    const usersMap = await loadIntlUsersByIds(sortedInviterIds)
    const referralCodes = Array.from(
      new Set(
        sortedInviterIds
          .map((userId) => usersMap.get(userId)?.referralCode)
          .map((code) => normalizeShareCode(code))
          .filter(Boolean),
      ),
    )

    if (referralCodes.length > 0) {
      const { data: clickRows, error: clickError } = await supabase
        .from("referral_clicks")
        .select("share_code")
        .in("share_code", referralCodes)
      if (clickError) throw new Error(clickError.message)

      const clickByCode = new Map<string, number>()
      for (const row of clickRows || []) {
        const code = normalizeShareCode((row as any)?.share_code)
        if (!code) continue
        clickByCode.set(code, safeNumber(clickByCode.get(code)) + 1)
      }

      for (const inviterUserId of sortedInviterIds) {
        const referralCode = normalizeShareCode(usersMap.get(inviterUserId)?.referralCode)
        if (!referralCode) continue
        const metric = metricsByInviter.get(inviterUserId)
        if (!metric) continue
        metric.clickCount = safeNumber(clickByCode.get(referralCode))
      }
    }

    const { data: rewardRows, error: rewardError } = await supabase
      .from("referral_rewards")
      .select("user_id,amount,status")
      .in("user_id", sortedInviterIds)
      .eq("status", "granted")
    if (rewardError) throw new Error(rewardError.message)

    for (const row of rewardRows || []) {
      const userId = normalizeUserId((row as any)?.user_id)
      const metric = userId ? metricsByInviter.get(userId) : null
      if (!metric) continue
      metric.rewardCredits += safeNumber((row as any)?.amount)
    }

    return sortedInviterIds.map((inviterUserId) => {
      const user = usersMap.get(inviterUserId)
      const metric = metricsByInviter.get(inviterUserId) || { invitedCount: 0, activatedCount: 0, rewardCredits: 0, clickCount: 0 }
      return {
        inviterUserId,
        inviterEmail: user?.email || null,
        referralCode: user?.referralCode || null,
        clickCount: metric.clickCount,
        invitedCount: metric.invitedCount,
        activatedCount: metric.activatedCount,
        rewardCredits: metric.rewardCredits,
      }
    })
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)
  await ensureCloudbaseCollections(db, [CN_USERS_COLLECTION])

  const [relationsResult, rewardsResult, clicksResult] = await Promise.all([
    db.collection(REFERRAL_RELATIONS_COLLECTION).get(),
    db.collection(REFERRAL_REWARDS_COLLECTION).where({ status: "granted" }).get(),
    db.collection(REFERRAL_CLICKS_COLLECTION).get(),
  ])

  const relations = Array.isArray(relationsResult?.data) ? relationsResult.data : []
  const rewards = Array.isArray(rewardsResult?.data) ? rewardsResult.data : []
  const clicks = Array.isArray(clicksResult?.data) ? clicksResult.data : []
  const metricsByInviter = new Map<string, { invitedCount: number; activatedCount: number; rewardCredits: number; clickCount: number }>()

  for (const row of relations) {
    const inviterUserId = normalizeUserId((row as any)?.inviter_user_id)
    if (!inviterUserId) continue
    const current = metricsByInviter.get(inviterUserId) || { invitedCount: 0, activatedCount: 0, rewardCredits: 0, clickCount: 0 }
    current.invitedCount += 1
    if ((row as any)?.activated_at) current.activatedCount += 1
    metricsByInviter.set(inviterUserId, current)
  }

  for (const row of rewards) {
    const userId = normalizeUserId((row as any)?.user_id)
    const current = userId ? metricsByInviter.get(userId) : null
    if (!current) continue
    current.rewardCredits += safeNumber((row as any)?.amount)
  }

  const usersMap = await loadCnUsersByIds(Array.from(metricsByInviter.keys()))
  const clickByCode = new Map<string, number>()
  for (const row of clicks) {
    const shareCode = normalizeShareCode((row as any)?.share_code)
    if (!shareCode) continue
    clickByCode.set(shareCode, safeNumber(clickByCode.get(shareCode)) + 1)
  }

  for (const [inviterUserId, metric] of metricsByInviter.entries()) {
    const referralCode = normalizeShareCode(usersMap.get(inviterUserId)?.referralCode)
    if (!referralCode) continue
    metric.clickCount = safeNumber(clickByCode.get(referralCode))
  }

  return Array.from(metricsByInviter.entries())
    .map(([inviterUserId, metric]) => {
      const user = usersMap.get(inviterUserId)
      return {
        inviterUserId,
        inviterEmail: user?.email || null,
        referralCode: user?.referralCode || null,
        clickCount: metric.clickCount,
        invitedCount: metric.invitedCount,
        activatedCount: metric.activatedCount,
        rewardCredits: metric.rewardCredits,
      }
    })
    .sort((a, b) => (b.invitedCount === a.invitedCount ? b.activatedCount - a.activatedCount : b.invitedCount - a.invitedCount))
    .slice(0, limit)
}

export async function getMarketAdminRelations(input?: {
  page?: number | string
  limit?: number | string
}): Promise<MarketListResult<MarketRelationRow>> {
  const page = parsePage(input?.page, 1)
  const limit = parseLimit(input?.limit, 50, 200)
  const offset = (page - 1) * limit
  const region = getRegion()

  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const [rowsResult, countResult] = await Promise.all([
      supabase
        .from("referral_relations")
        .select("id,inviter_user_id,invited_user_id,share_code,tool_slug,first_tool_id,status,created_at,activated_at")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
      supabase.from("referral_relations").select("id", { count: "exact", head: true }),
    ])

    if (rowsResult.error) throw new Error(rowsResult.error.message)
    if (countResult.error) throw new Error(countResult.error.message)

    const rows = (rowsResult.data || []).map(mapIntlRelationRow)
    const usersMap = await loadIntlUsersByIds(
      rows.flatMap((row: any) => [row.inviterUserId, row.invitedUserId]),
    )

    return {
      page,
      limit,
      total: safeNumber(countResult.count),
      rows: rows.map((row: any) => ({
        relationId: row.id,
        inviterUserId: row.inviterUserId,
        inviterEmail: usersMap.get(row.inviterUserId)?.email || null,
        invitedUserId: row.invitedUserId,
        invitedEmail: usersMap.get(row.invitedUserId)?.email || null,
        shareCode: row.shareCode,
        toolSlug: row.toolSlug,
        firstToolId: row.firstToolId,
        status: row.status,
        createdAt: row.createdAt,
        activatedAt: row.activatedAt,
      })),
    }
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)
  const relationResult = await db.collection(REFERRAL_RELATIONS_COLLECTION).get()
  const relationRows = (Array.isArray(relationResult?.data) ? relationResult.data : []).map(mapCnRelationRow)
  const sorted = relationRows.sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1))
  const paged = sorted.slice(offset, offset + limit)
  const usersMap = await loadCnUsersByIds(paged.flatMap((row: any) => [row.inviterUserId, row.invitedUserId]))

  return {
    page,
    limit,
    total: sorted.length,
    rows: paged.map((row: any) => ({
      relationId: row.id,
      inviterUserId: row.inviterUserId,
      inviterEmail: usersMap.get(row.inviterUserId)?.email || null,
      invitedUserId: row.invitedUserId,
      invitedEmail: usersMap.get(row.invitedUserId)?.email || null,
      shareCode: row.shareCode,
      toolSlug: row.toolSlug,
      firstToolId: row.firstToolId,
      status: row.status,
      createdAt: row.createdAt,
      activatedAt: row.activatedAt,
    })),
  }
}

export async function getMarketAdminRewards(input?: {
  page?: number | string
  limit?: number | string
}): Promise<MarketListResult<MarketRewardRow>> {
  const page = parsePage(input?.page, 1)
  const limit = parseLimit(input?.limit, 50, 200)
  const offset = (page - 1) * limit
  const region = getRegion()

  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const [rowsResult, countResult] = await Promise.all([
      supabase
        .from("referral_rewards")
        .select("id,relation_id,user_id,reward_type,amount,status,reference_id,created_at,granted_at")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
      supabase.from("referral_rewards").select("id", { count: "exact", head: true }),
    ])

    if (rowsResult.error) throw new Error(rowsResult.error.message)
    if (countResult.error) throw new Error(countResult.error.message)

    const rows = (rowsResult.data || []).map(mapIntlRewardRow)
    const usersMap = await loadIntlUsersByIds(rows.map((row: any) => row.userId))

    return {
      page,
      limit,
      total: safeNumber(countResult.count),
      rows: rows.map((row: any) => ({
        rewardId: row.rewardId,
        relationId: row.relationId,
        userId: row.userId,
        userEmail: usersMap.get(row.userId)?.email || null,
        rewardType: row.rewardType,
        amount: row.amount,
        status: row.status,
        referenceId: row.referenceId,
        createdAt: row.createdAt,
        grantedAt: row.grantedAt,
      })),
    }
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)
  const rewardResult = await db.collection(REFERRAL_REWARDS_COLLECTION).get()
  const rewardRows = (Array.isArray(rewardResult?.data) ? rewardResult.data : []).map(mapCnRewardRow)
  const sorted = rewardRows.sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1))
  const paged = sorted.slice(offset, offset + limit)
  const usersMap = await loadCnUsersByIds(paged.map((row: any) => row.userId))

  return {
    page,
    limit,
    total: sorted.length,
    rows: paged.map((row: any) => ({
      rewardId: row.rewardId,
      relationId: row.relationId,
      userId: row.userId,
      userEmail: usersMap.get(row.userId)?.email || null,
      rewardType: row.rewardType,
      amount: row.amount,
      status: row.status,
      referenceId: row.referenceId,
      createdAt: row.createdAt,
      grantedAt: row.grantedAt,
    })),
  }
}

export async function getUserReferralRelations(input: {
  userId: string
  page?: number | string
  limit?: number | string
}): Promise<MarketListResult<MarketRelationRow>> {
  const userId = normalizeUserId(input.userId)
  if (!userId) throw new Error("userId is required")
  const page = parsePage(input.page, 1)
  const limit = parseLimit(input.limit, 20, 100)
  const offset = (page - 1) * limit
  const region = getRegion()

  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const [rowsResult, countResult] = await Promise.all([
      supabase
        .from("referral_relations")
        .select("id,inviter_user_id,invited_user_id,share_code,tool_slug,first_tool_id,status,created_at,activated_at")
        .eq("inviter_user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
      supabase
        .from("referral_relations")
        .select("id", { count: "exact", head: true })
        .eq("inviter_user_id", userId),
    ])

    if (rowsResult.error) throw new Error(rowsResult.error.message)
    if (countResult.error) throw new Error(countResult.error.message)

    const rows = (rowsResult.data || []).map(mapIntlRelationRow)
    const usersMap = await loadIntlUsersByIds(rows.map((row: any) => row.invitedUserId))

    return {
      page,
      limit,
      total: safeNumber(countResult.count),
      rows: rows.map((row: any) => ({
        relationId: row.id,
        inviterUserId: row.inviterUserId,
        inviterEmail: null,
        invitedUserId: row.invitedUserId,
        invitedEmail: usersMap.get(row.invitedUserId)?.email || null,
        shareCode: row.shareCode,
        toolSlug: row.toolSlug,
        firstToolId: row.firstToolId,
        status: row.status,
        createdAt: row.createdAt,
        activatedAt: row.activatedAt,
      })),
    }
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)
  const relationResult = await db.collection(REFERRAL_RELATIONS_COLLECTION).where({ inviter_user_id: userId }).get()
  const relationRows = (Array.isArray(relationResult?.data) ? relationResult.data : []).map(mapCnRelationRow)
  const sorted = relationRows.sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1))
  const paged = sorted.slice(offset, offset + limit)
  const usersMap = await loadCnUsersByIds(paged.map((row: any) => row.invitedUserId))

  return {
    page,
    limit,
    total: sorted.length,
    rows: paged.map((row: any) => ({
      relationId: row.id,
      inviterUserId: row.inviterUserId,
      inviterEmail: null,
      invitedUserId: row.invitedUserId,
      invitedEmail: usersMap.get(row.invitedUserId)?.email || null,
      shareCode: row.shareCode,
      toolSlug: row.toolSlug,
      firstToolId: row.firstToolId,
      status: row.status,
      createdAt: row.createdAt,
      activatedAt: row.activatedAt,
    })),
  }
}

export async function getUserReferralRewards(input: {
  userId: string
  page?: number | string
  limit?: number | string
}): Promise<MarketListResult<MarketRewardRow>> {
  const userId = normalizeUserId(input.userId)
  if (!userId) throw new Error("userId is required")
  const page = parsePage(input.page, 1)
  const limit = parseLimit(input.limit, 20, 100)
  const offset = (page - 1) * limit
  const region = getRegion()

  if (region === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const [rowsResult, countResult] = await Promise.all([
      supabase
        .from("referral_rewards")
        .select("id,relation_id,user_id,reward_type,amount,status,reference_id,created_at,granted_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
      supabase.from("referral_rewards").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ])

    if (rowsResult.error) throw new Error(rowsResult.error.message)
    if (countResult.error) throw new Error(countResult.error.message)

    const rows = (rowsResult.data || []).map(mapIntlRewardRow)

    return {
      page,
      limit,
      total: safeNumber(countResult.count),
      rows: rows.map((row: any) => ({
        rewardId: row.rewardId,
        relationId: row.relationId,
        userId: row.userId,
        userEmail: null,
        rewardType: row.rewardType,
        amount: row.amount,
        status: row.status,
        referenceId: row.referenceId,
        createdAt: row.createdAt,
        grantedAt: row.grantedAt,
      })),
    }
  }

  const db = await getDatabase()
  await ensureCloudbaseReferralCollections(db)
  const rewardResult = await db.collection(REFERRAL_REWARDS_COLLECTION).where({ user_id: userId }).get()
  const rewardRows = (Array.isArray(rewardResult?.data) ? rewardResult.data : []).map(mapCnRewardRow)
  const sorted = rewardRows.sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1))
  const paged = sorted.slice(offset, offset + limit)

  return {
    page,
    limit,
    total: sorted.length,
    rows: paged.map((row: any) => ({
      rewardId: row.rewardId,
      relationId: row.relationId,
      userId: row.userId,
      userEmail: null,
      rewardType: row.rewardType,
      amount: row.amount,
      status: row.status,
      referenceId: row.referenceId,
      createdAt: row.createdAt,
      grantedAt: row.grantedAt,
    })),
  }
}


