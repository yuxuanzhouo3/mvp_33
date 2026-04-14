import { randomUUID } from "crypto"
import { getDatabase } from "@/lib/database/cloudbase-service"
import { resolveDeploymentRegion } from "@/lib/config/deployment-region"
import { getSupabaseAdminForDownloads } from "@/lib/downloads/supabase-admin"
import {
  getDefaultMarketingCampaigns,
  getDefaultMarketingSettings,
  getDefaultMarketingTaskTemplates,
} from "@/lib/market/marketing-defaults"
import type {
  MarketingAccountBundle,
  MarketingAssetAccount,
  MarketingAssetLedger,
  MarketingAssetType,
  MarketingCampaign,
  MarketingCoupon,
  MarketingEventLog,
  MarketingEventType,
  MarketingInvitationCode,
  MarketingListResult,
  MarketingOverview,
  MarketingProduct,
  MarketingRegion,
  MarketingReports,
  MarketingRiskEvent,
  MarketingRiskListItem,
  MarketingSetting,
  MarketingSimulationInput,
  MarketingSimulationResult,
  MarketingTaskTemplate,
  MarketingUserLite,
  MarketingUserTask,
  MarketingWithdrawal,
} from "@/lib/market/marketing-types"
import {
  getMarketAdminChannels,
  getMarketAdminOverview,
  getMarketAdminRelations,
  getMarketAdminRewards,
  getMarketAdminTopInviters,
  getMarketAdminTrends,
} from "@/lib/market/referrals"
import type {
  MarketChannelPoint,
  MarketRelationRow,
  MarketRewardRow,
  MarketTopInviterPoint,
  MarketTrendPoint,
} from "@/lib/market/referrals"

const USERS_COLLECTION = "users"
const USER_DEVICES_COLLECTION = "user_devices"
const ADVERTISEMENTS_COLLECTION = "advertisements"
const MARKETING_SETTINGS_COLLECTION = "marketing_settings"
const MARKETING_ACCOUNTS_COLLECTION = "marketing_asset_accounts"
const MARKETING_LEDGERS_COLLECTION = "marketing_asset_ledgers"
const MARKETING_CAMPAIGNS_COLLECTION = "marketing_campaigns"
const MARKETING_TASKS_COLLECTION = "marketing_task_templates"
const MARKETING_USER_TASKS_COLLECTION = "marketing_user_tasks"
const MARKETING_EVENTS_COLLECTION = "marketing_event_logs"
const MARKETING_WITHDRAWALS_COLLECTION = "marketing_withdrawals"
const MARKETING_RISK_EVENTS_COLLECTION = "marketing_risk_events"
const MARKETING_RISK_LISTS_COLLECTION = "marketing_risk_lists"
const MARKETING_INVITATION_CODES_COLLECTION = "marketing_invitation_codes"
const MARKETING_COUPONS_COLLECTION = "marketing_coupons"

const ALL_MARKETING_COLLECTIONS = [
  MARKETING_SETTINGS_COLLECTION,
  MARKETING_ACCOUNTS_COLLECTION,
  MARKETING_LEDGERS_COLLECTION,
  MARKETING_CAMPAIGNS_COLLECTION,
  MARKETING_TASKS_COLLECTION,
  MARKETING_USER_TASKS_COLLECTION,
  MARKETING_EVENTS_COLLECTION,
  MARKETING_WITHDRAWALS_COLLECTION,
  MARKETING_RISK_EVENTS_COLLECTION,
  MARKETING_RISK_LISTS_COLLECTION,
  MARKETING_INVITATION_CODES_COLLECTION,
  MARKETING_COUPONS_COLLECTION,
] as const

const ASSET_TYPES: MarketingAssetType[] = ["cash", "points", "ai_quota", "vip_duration"]
const ENSURE_CACHE_MS = 10_000

let ensureSeedDataPromise: Promise<void> | null = null
let ensureAllUserAssetAccountsPromise: Promise<void> | null = null
let lastSeedEnsuredAt = 0
let lastAccountEnsureAt = 0

type JsonRecord = Record<string, unknown>
type RawRow = Record<string, any>

export interface MarketingDailyRoiRow {
  date: string
  clicks: number
  invites: number
  activated: number
  cashCost: number
  pointsCost: number
  roi: string
}

export interface MarketingDashboardSummary {
  today: {
    newUsers: number
    cashIssued: number
    pointsIssued: number
    pendingWithdrawalCount: number
    pendingWithdrawalAmount: number
    riskHits: number
    activeCampaigns: number
  }
  trends: MarketTrendPoint[]
  funnel: {
    totalClicks: number
    totalInvites: number
    totalActivated: number
    totalRewardCredits: number
    conversionRate: number
    activationRate: number
  }
  dailyRoi: MarketingDailyRoiRow[]
}

export interface MarketingFissionData {
  overview: {
    totalClicks: number
    totalInvites: number
    totalActivated: number
    totalRewardCredits: number
    conversionRate: number
    activationRate: number
  }
  trends: MarketTrendPoint[]
  channels: MarketChannelPoint[]
  topInviters: MarketTopInviterPoint[]
  relations: MarketingListResult<MarketRelationRow>
  rewards: MarketingListResult<MarketRewardRow>
  statuses: string[]
  filters: {
    search: string
    status: string
    datePreset: string
    date: string
  }
}

function nowIso() {
  return new Date().toISOString()
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function safeString(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim()
  return normalized || fallback
}

function toDateKey(value: string | null | undefined) {
  const raw = safeString(value)
  if (!raw) return ""
  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) return ""
  return date.toISOString().slice(0, 10)
}

function matchesSearchValue(value: string, query: string) {
  if (!query) return true
  return value.toLowerCase().includes(query.toLowerCase())
}

function getDatePresetRange(datePreset?: string | null, date?: string | null) {
  const preset = safeString(datePreset, "all")
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999))
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))

  if (preset === "today") {
    return { start: startOfToday, end }
  }

  if (preset === "yesterday") {
    const yesterday = new Date(startOfToday)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const yesterdayEnd = new Date(end)
    yesterdayEnd.setUTCDate(yesterdayEnd.getUTCDate() - 1)
    return { start: yesterday, end: yesterdayEnd }
  }

  if (preset === "7days" || preset === "30days") {
    const start = new Date(startOfToday)
    start.setUTCDate(start.getUTCDate() - (preset === "7days" ? 6 : 29))
    return { start, end }
  }

  if (preset === "custom") {
    const raw = safeString(date)
    if (!raw) return null
    const start = new Date(`${raw}T00:00:00.000Z`)
    const customEnd = new Date(`${raw}T23:59:59.999Z`)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(customEnd.getTime())) return null
    return { start, end: customEnd }
  }

  return null
}

function matchesDatePreset(value: string | null | undefined, datePreset?: string | null, date?: string | null) {
  const range = getDatePresetRange(datePreset, date)
  if (!range) return true
  const target = new Date(String(value || ""))
  if (!Number.isFinite(target.getTime())) return false
  return target >= range.start && target <= range.end
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as JsonRecord
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => safeString(value))
        .filter(Boolean),
    ),
  )
}

function toTimestamp(value: string | null | undefined) {
  const parsed = Date.parse(String(value || ""))
  return Number.isFinite(parsed) ? parsed : 0
}

function pickPreferredCampaign(existing: MarketingCampaign, candidate: MarketingCampaign) {
  const candidateUpdatedAt = toTimestamp(candidate.updatedAt)
  const existingUpdatedAt = toTimestamp(existing.updatedAt)
  if (candidateUpdatedAt !== existingUpdatedAt) {
    return candidateUpdatedAt > existingUpdatedAt ? candidate : existing
  }

  const candidateCreatedAt = toTimestamp(candidate.createdAt)
  const existingCreatedAt = toTimestamp(existing.createdAt)
  if (candidateCreatedAt !== existingCreatedAt) {
    return candidateCreatedAt > existingCreatedAt ? candidate : existing
  }

  return candidate
}

function dedupeCampaignRows(rows: MarketingCampaign[]) {
  const deduped: MarketingCampaign[] = []
  const slugIndex = new Map<string, number>()
  const idIndex = new Map<string, number>()

  for (const row of rows) {
    const slug = safeString(row.slug)
    const id = safeString(row.id)
    const existingIndex =
      (slug ? slugIndex.get(slug) : undefined) ??
      (id ? idIndex.get(id) : undefined)

    if (existingIndex === undefined) {
      const index = deduped.push(row) - 1
      if (slug) slugIndex.set(slug, index)
      if (id) idIndex.set(id, index)
      continue
    }

    const existing = deduped[existingIndex]
    const next = pickPreferredCampaign(existing, row)
    deduped[existingIndex] = next

    for (const value of uniqueStrings([existing.slug, row.slug, next.slug])) {
      slugIndex.set(value, existingIndex)
    }
    for (const value of uniqueStrings([existing.id, row.id, next.id])) {
      idIndex.set(value, existingIndex)
    }
  }

  return deduped
}

function normalizePartnerTier(value: unknown): MarketingInvitationCode["partnerTier"] {
  const normalized = safeString(value, "general")
  if (normalized === "blogger_partner" || normalized === "partner_package") {
    return "partner_package"
  }
  return "general"
}

function normalizeAudienceType(value: unknown): MarketingCoupon["audienceType"] {
  const normalized = safeString(value, "general")
  if (normalized === "blogger_fans" || normalized === "linked_audience") {
    return "linked_audience"
  }
  return "general"
}

function normalizeCouponMaxUses(value: unknown, fallback = 1): number | null {
  if (value === null) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return Math.max(1, Math.floor(fallback))
  return Math.floor(parsed)
}

function normalizeCouponUsedCount(value: unknown, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return Math.max(0, Math.floor(fallback))
  }
  return Math.floor(parsed)
}

function getCouponUsedCountValue(value: unknown, fallbackStatus?: MarketingCoupon["status"]) {
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.floor(parsed)
  }
  return fallbackStatus === "used" ? 1 : 0
}

function resolveMarketingCouponStatus(input: {
  requestedStatus?: MarketingCoupon["status"]
  currentStatus?: MarketingCoupon["status"]
  expiresAt?: string | null
  maxUses: number | null
  usedCount: number
}) {
  if (input.requestedStatus === "revoked" || (!input.requestedStatus && input.currentStatus === "revoked")) {
    return "revoked" as const
  }

  const isExpired = input.expiresAt ? new Date(input.expiresAt) < new Date() : false
  if (input.requestedStatus === "expired" || isExpired) {
    return "expired" as const
  }

  if (input.maxUses !== null && input.usedCount >= input.maxUses) {
    return "used" as const
  }

  return "available" as const
}

function normalizeProducts(value: unknown): MarketingProduct[] {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)

  const allowed = new Set<MarketingProduct>(["orbitchat", "ai", "ecommerce"])
  return uniqueStrings(items as string[]).filter((item): item is MarketingProduct => allowed.has(item as MarketingProduct))
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

function getRegion(): MarketingRegion {
  return resolveDeploymentRegion() === "INTL" ? "INTL" : "CN"
}

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
      if (!isCloudbaseMissingCollection(error)) {
        throw error
      }
      await db.createCollection(name)
    }
  }
}

async function loadSupabaseRows(table: string): Promise<RawRow[]> {
  const supabase = getSupabaseAdminForDownloads()
  const { data, error } = await supabase.from(table).select("*")
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? data : []
}

async function findSupabaseRow(table: string, filters: RawRow): Promise<RawRow | null> {
  const supabase = getSupabaseAdminForDownloads()
  let query = supabase.from(table).select("*")
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value)
  }
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data || null
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

async function deleteSupabaseRow(table: string, filters: RawRow): Promise<boolean> {
  const supabase = getSupabaseAdminForDownloads()
  let query = supabase.from(table).delete()
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value)
  }
  const { error } = await query
  if (error) throw new Error(error.message)
  return true
}

async function loadCloudbaseRows(collection: string): Promise<RawRow[]> {
  const db = await getDatabase()
  await ensureCloudbaseCollections(db, [collection])
  const result = await db.collection(collection).get()
  return Array.isArray(result?.data) ? result.data : []
}

function cloudbaseMatchesFilters(row: RawRow, filters: RawRow) {
  return Object.entries(filters).every(([key, value]) => row?.[key] === value)
}

async function findCloudbaseRow(collection: string, filters: RawRow): Promise<RawRow | null> {
  const rows = await loadCloudbaseRows(collection)
  return rows.find((row) => cloudbaseMatchesFilters(row, filters)) || null
}

async function insertCloudbaseRow(collection: string, row: RawRow): Promise<RawRow> {
  const db = await getDatabase()
  await ensureCloudbaseCollections(db, [collection])
  await db.collection(collection).add(row)
  return row
}

async function updateCloudbaseRow(collection: string, filters: RawRow, patch: RawRow): Promise<RawRow | null> {
  const db = await getDatabase()
  await ensureCloudbaseCollections(db, [collection])
  const rows = await loadCloudbaseRows(collection)
  const target = rows.find((row) => cloudbaseMatchesFilters(row, filters))
  if (!target?._id) return null
  await db.collection(collection).doc(target._id).update(patch)
  return {
    ...target,
    ...patch,
  }
}

async function deleteCloudbaseRow(collection: string, filters: RawRow): Promise<boolean> {
  const db = await getDatabase()
  await ensureCloudbaseCollections(db, [collection])
  const rows = await loadCloudbaseRows(collection)
  const target = rows.find((row) => cloudbaseMatchesFilters(row, filters))
  if (!target?._id) return false
  await db.collection(collection).doc(target._id).remove()
  return true
}

async function loadRows(tableOrCollection: string) {
  if (getRegion() === "INTL") {
    return loadSupabaseRows(tableOrCollection)
  }
  return loadCloudbaseRows(tableOrCollection)
}

async function findRow(tableOrCollection: string, filters: RawRow) {
  if (getRegion() === "INTL") {
    return findSupabaseRow(tableOrCollection, filters)
  }
  return findCloudbaseRow(tableOrCollection, filters)
}

async function insertRow(tableOrCollection: string, row: RawRow) {
  if (getRegion() === "INTL") {
    return insertSupabaseRow(tableOrCollection, row)
  }
  return insertCloudbaseRow(tableOrCollection, row)
}

async function updateRow(tableOrCollection: string, filters: RawRow, patch: RawRow) {
  if (getRegion() === "INTL") {
    return updateSupabaseRow(tableOrCollection, filters, patch)
  }
  return updateCloudbaseRow(tableOrCollection, filters, patch)
}

async function deleteRow(tableOrCollection: string, filters: RawRow) {
  if (getRegion() === "INTL") {
    return deleteSupabaseRow(tableOrCollection, filters)
  }
  return deleteCloudbaseRow(tableOrCollection, filters)
}

function toSettingRow(setting: MarketingSetting): RawRow {
  return {
    id: setting.id,
    key: setting.key,
    value: setting.value,
    description: setting.description,
    created_at: setting.createdAt,
    updated_at: setting.updatedAt,
  }
}

function mapSettingRow(row: RawRow): MarketingSetting {
  return {
    id: safeString(row?.id || row?._id),
    key: safeString(row?.key),
    value: row?.value,
    description: safeString(row?.description),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function toCampaignRow(campaign: MarketingCampaign): RawRow {
  return {
    id: campaign.id,
    slug: campaign.slug,
    name: campaign.name,
    description: campaign.description,
    campaign_type: campaign.campaignType,
    product_scope: campaign.productScope,
    highlight: campaign.highlight,
    status: campaign.status,
    start_at: campaign.startAt,
    end_at: campaign.endAt,
    sort_order: campaign.sortOrder,
    rules: campaign.rules,
    created_at: campaign.createdAt,
    updated_at: campaign.updatedAt,
  }
}

function mapCampaignRow(row: RawRow): MarketingCampaign {
  return {
    id: safeString(row?.id || row?._id),
    slug: safeString(row?.slug),
    name: safeString(row?.name),
    description: safeString(row?.description),
    campaignType: safeString(row?.campaign_type),
    productScope: normalizeProducts(row?.product_scope),
    highlight: safeString(row?.highlight),
    status: safeString(row?.status, "draft") as MarketingCampaign["status"],
    startAt: row?.start_at ? safeString(row.start_at) : null,
    endAt: row?.end_at ? safeString(row.end_at) : null,
    sortOrder: safeNumber(row?.sort_order),
    rules: asRecord(row?.rules),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function toTaskTemplateRow(template: MarketingTaskTemplate): RawRow {
  return {
    id: template.id,
    slug: template.slug,
    campaign_slug: template.campaignSlug,
    name: template.name,
    description: template.description,
    task_type: template.taskType,
    event_type: template.eventType,
    reward_asset: template.rewardAsset,
    reward_amount: template.rewardAmount,
    reward_recipient: template.rewardRecipient,
    threshold_value: template.thresholdValue,
    threshold_unit: template.thresholdUnit,
    daily_limit: template.dailyLimit,
    lifetime_limit: template.lifetimeLimit,
    recurrence: template.recurrence,
    decay_policy: template.decayPolicy,
    risk_rules: template.riskRules,
    products: template.products,
    meta: template.meta,
    status: template.status,
    sort_order: template.sortOrder,
    created_at: template.createdAt,
    updated_at: template.updatedAt,
  }
}

function mapTaskTemplateRow(row: RawRow): MarketingTaskTemplate {
  return {
    id: safeString(row?.id || row?._id),
    slug: safeString(row?.slug),
    campaignSlug: safeString(row?.campaign_slug),
    name: safeString(row?.name),
    description: safeString(row?.description),
    taskType: safeString(row?.task_type),
    eventType: safeString(row?.event_type, "user.login") as MarketingEventType,
    rewardAsset: safeString(row?.reward_asset, "points") as MarketingAssetType,
    rewardAmount: safeNumber(row?.reward_amount),
    rewardRecipient: safeString(row?.reward_recipient, "actor") as MarketingTaskTemplate["rewardRecipient"],
    thresholdValue: Math.max(1, safeNumber(row?.threshold_value, 1)),
    thresholdUnit: safeString(row?.threshold_unit, "times"),
    dailyLimit: row?.daily_limit === null || row?.daily_limit === undefined ? null : safeNumber(row?.daily_limit),
    lifetimeLimit:
      row?.lifetime_limit === null || row?.lifetime_limit === undefined ? null : safeNumber(row?.lifetime_limit),
    recurrence: safeString(row?.recurrence, "repeatable") as MarketingTaskTemplate["recurrence"],
    decayPolicy: safeString(row?.decay_policy),
    riskRules: asRecord(row?.risk_rules),
    products: normalizeProducts(row?.products),
    meta: asRecord(row?.meta),
    status: safeString(row?.status, "draft") as MarketingTaskTemplate["status"],
    sortOrder: safeNumber(row?.sort_order),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function toAccountRow(account: MarketingAssetAccount): RawRow {
  return {
    id: account.id,
    user_id: account.userId,
    asset_type: account.assetType,
    available_balance: account.availableBalance,
    frozen_balance: account.frozenBalance,
    lifetime_earned: account.lifetimeEarned,
    lifetime_spent: account.lifetimeSpent,
    pending_expiry_amount: account.pendingExpiryAmount,
    next_expiry_at: account.nextExpiryAt,
    last_event_at: account.lastEventAt,
    meta: account.meta,
    created_at: account.createdAt,
    updated_at: account.updatedAt,
  }
}

function mapAccountRow(row: RawRow): MarketingAssetAccount {
  return {
    id: safeString(row?.id || row?._id),
    userId: safeString(row?.user_id),
    assetType: safeString(row?.asset_type, "points") as MarketingAssetType,
    availableBalance: safeNumber(row?.available_balance),
    frozenBalance: safeNumber(row?.frozen_balance),
    lifetimeEarned: safeNumber(row?.lifetime_earned),
    lifetimeSpent: safeNumber(row?.lifetime_spent),
    pendingExpiryAmount: safeNumber(row?.pending_expiry_amount),
    nextExpiryAt: row?.next_expiry_at ? safeString(row.next_expiry_at) : null,
    lastEventAt: row?.last_event_at ? safeString(row.last_event_at) : null,
    meta: asRecord(row?.meta),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function toInvitationCodeRow(item: MarketingInvitationCode): RawRow {
  return {
    id: item.id,
    code: item.code,
    user_id: item.userId,
    campaign_slug: item.campaignSlug,
    partner_tier: normalizePartnerTier(item.partnerTier),
    partner_product: item.partnerProduct,
    product_cost: item.productCost,
    partner_benefit_months: item.partnerBenefitMonths,
    fan_discount_rate: item.fanDiscountRate,
    order_commission_rate: item.orderCommissionRate,
    max_uses: item.maxUses,
    used_count: item.usedCount,
    status: item.status,
    expires_at: item.expiresAt,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapInvitationCodeRow(row: RawRow): MarketingInvitationCode {
  return {
    id: safeString(row?.id || row?._id),
    code: safeString(row?.code),
    userId: safeString(row?.user_id),
    campaignSlug: row?.campaign_slug ? safeString(row.campaign_slug) : null,
    partnerTier: normalizePartnerTier(row?.partner_tier),
    partnerProduct: row?.partner_product ? safeString(row.partner_product) : null,
    productCost: safeNumber(row?.product_cost, 0),
    partnerBenefitMonths: safeNumber(row?.partner_benefit_months, 0),
    fanDiscountRate: safeNumber(row?.fan_discount_rate, 0),
    orderCommissionRate: safeNumber(row?.order_commission_rate, 0),
    maxUses: row?.max_uses === null ? null : safeNumber(row?.max_uses),
    usedCount: safeNumber(row?.used_count),
    status: safeString(row?.status, "active") as any,
    expiresAt: row?.expires_at ? safeString(row.expires_at) : null,
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function toCouponRow(item: MarketingCoupon): RawRow {
  return {
    id: item.id,
    code: item.code,
    user_id: item.userId,
    partner_user_id: item.partnerUserId,
    asset_type: item.assetType,
    audience_type: normalizeAudienceType(item.audienceType),
    partner_product: item.partnerProduct,
    product_cost: item.productCost,
    source_invitation_code: item.sourceInvitationCode,
    order_commission_rate: item.orderCommissionRate,
    purchase_price: item.purchasePrice,
    discount_value: item.discountValue,
    discount_type: item.discountType,
    min_purchase: item.minPurchase,
    max_uses: item.maxUses,
    used_count: item.usedCount,
    used_by_user_id: item.usedByUserId,
    used_order_no: item.usedOrderNo,
    used_at: item.usedAt,
    status: item.status,
    expires_at: item.expiresAt,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapCouponRow(row: RawRow): MarketingCoupon {
  const status = safeString(row?.status, "available") as MarketingCoupon["status"]
  return {
    id: safeString(row?.id || row?._id),
    code: safeString(row?.code),
    userId: safeString(row?.user_id),
    partnerUserId: row?.partner_user_id ? safeString(row.partner_user_id) : null,
    assetType: safeString(row?.asset_type, "points") as MarketingAssetType,
    audienceType: normalizeAudienceType(row?.audience_type),
    partnerProduct: row?.partner_product ? safeString(row.partner_product) : null,
    productCost: safeNumber(row?.product_cost, 0),
    sourceInvitationCode: row?.source_invitation_code ? safeString(row.source_invitation_code) : null,
    orderCommissionRate: safeNumber(row?.order_commission_rate, 0),
    purchasePrice: safeNumber(row?.purchase_price),
    discountValue: safeNumber(row?.discount_value),
    discountType: safeString(row?.discount_type, "fixed") as any,
    minPurchase: safeNumber(row?.min_purchase),
    maxUses: row?.max_uses === null ? null : normalizeCouponMaxUses(row?.max_uses, 1),
    usedCount: getCouponUsedCountValue(row?.used_count, status),
    usedByUserId: row?.used_by_user_id ? safeString(row.used_by_user_id) : null,
    usedOrderNo: row?.used_order_no ? safeString(row.used_order_no) : null,
    usedAt: row?.used_at ? safeString(row.used_at) : null,
    status,
    expiresAt: row?.expires_at ? safeString(row.expires_at) : null,
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function toLedgerRow(ledger: MarketingAssetLedger): RawRow {
  return {
    id: ledger.id,
    user_id: ledger.userId,
    asset_type: ledger.assetType,
    direction: ledger.direction,
    amount: ledger.amount,
    available_after: ledger.availableAfter,
    frozen_after: ledger.frozenAfter,
    source_type: ledger.sourceType,
    source_id: ledger.sourceId,
    event_type: ledger.eventType,
    remark: ledger.remark,
    operator_id: ledger.operatorId,
    status: ledger.status,
    expires_at: ledger.expiresAt,
    meta: ledger.meta,
    created_at: ledger.createdAt,
  }
}

function mapLedgerRow(row: RawRow): MarketingAssetLedger {
  return {
    id: safeString(row?.id || row?._id),
    userId: safeString(row?.user_id),
    assetType: safeString(row?.asset_type, "points") as MarketingAssetType,
    direction: safeString(row?.direction, "credit") as MarketingAssetLedger["direction"],
    amount: safeNumber(row?.amount),
    availableAfter: safeNumber(row?.available_after),
    frozenAfter: safeNumber(row?.frozen_after),
    sourceType: safeString(row?.source_type),
    sourceId: safeString(row?.source_id),
    eventType: safeString(row?.event_type),
    remark: safeString(row?.remark),
    operatorId: row?.operator_id ? safeString(row.operator_id) : null,
    status: safeString(row?.status, "available") as MarketingAssetLedger["status"],
    expiresAt: row?.expires_at ? safeString(row.expires_at) : null,
    meta: asRecord(row?.meta),
    createdAt: safeString(row?.created_at, nowIso()),
  }
}

function toUserTaskRow(task: MarketingUserTask): RawRow {
  return {
    id: task.id,
    user_id: task.userId,
    template_slug: task.templateSlug,
    template_name: task.templateName,
    campaign_slug: task.campaignSlug,
    event_type: task.eventType,
    progress_value: task.progressValue,
    progress_target: task.progressTarget,
    completion_count: task.completionCount,
    reward_total: task.rewardTotal,
    streak_count: task.streakCount,
    last_event_at: task.lastEventAt,
    last_completed_at: task.lastCompletedAt,
    status: task.status,
    meta: task.meta,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  }
}

function mapUserTaskRow(row: RawRow): MarketingUserTask {
  return {
    id: safeString(row?.id || row?._id),
    userId: safeString(row?.user_id),
    templateSlug: safeString(row?.template_slug),
    templateName: safeString(row?.template_name),
    campaignSlug: safeString(row?.campaign_slug),
    eventType: safeString(row?.event_type, "user.login") as MarketingEventType,
    progressValue: safeNumber(row?.progress_value),
    progressTarget: Math.max(1, safeNumber(row?.progress_target, 1)),
    completionCount: safeNumber(row?.completion_count),
    rewardTotal: safeNumber(row?.reward_total),
    streakCount: safeNumber(row?.streak_count),
    lastEventAt: row?.last_event_at ? safeString(row.last_event_at) : null,
    lastCompletedAt: row?.last_completed_at ? safeString(row.last_completed_at) : null,
    status: safeString(row?.status, "pending") as MarketingUserTask["status"],
    meta: asRecord(row?.meta),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function toEventRow(eventLog: MarketingEventLog): RawRow {
  return {
    id: eventLog.id,
    product: eventLog.product,
    event_type: eventLog.eventType,
    user_id: eventLog.userId,
    occurred_at: eventLog.occurredAt,
    source: eventLog.source,
    device_fingerprint: eventLog.deviceFingerprint,
    ip_hash: eventLog.ipHash,
    payload: eventLog.payload,
    status: eventLog.status,
    processed_at: eventLog.processedAt,
    result_summary: eventLog.resultSummary,
    created_at: eventLog.createdAt,
  }
}

function mapEventRow(row: RawRow): MarketingEventLog {
  return {
    id: safeString(row?.id || row?._id),
    product: safeString(row?.product, "orbitchat") as MarketingProduct,
    eventType: safeString(row?.event_type, "user.login") as MarketingEventType,
    userId: safeString(row?.user_id),
    occurredAt: safeString(row?.occurred_at, nowIso()),
    source: row?.source ? safeString(row.source) : null,
    deviceFingerprint: row?.device_fingerprint ? safeString(row.device_fingerprint) : null,
    ipHash: row?.ip_hash ? safeString(row.ip_hash) : null,
    payload: asRecord(row?.payload),
    status: safeString(row?.status, "pending") as MarketingEventLog["status"],
    processedAt: row?.processed_at ? safeString(row.processed_at) : null,
    resultSummary: asRecord(row?.result_summary),
    createdAt: safeString(row?.created_at, nowIso()),
  }
}

function toWithdrawalRow(withdrawal: MarketingWithdrawal): RawRow {
  return {
    id: withdrawal.id,
    user_id: withdrawal.userId,
    amount: withdrawal.amount,
    threshold_amount: withdrawal.thresholdAmount,
    channel: withdrawal.channel,
    status: withdrawal.status,
    requested_at: withdrawal.requestedAt,
    reviewed_at: withdrawal.reviewedAt,
    reviewed_by: withdrawal.reviewedBy,
    review_note: withdrawal.reviewNote,
    meta: withdrawal.meta,
  }
}

function mapWithdrawalRow(row: RawRow): MarketingWithdrawal {
  return {
    id: safeString(row?.id || row?._id),
    userId: safeString(row?.user_id),
    amount: safeNumber(row?.amount),
    thresholdAmount: safeNumber(row?.threshold_amount, 20),
    channel: safeString(row?.channel, "manual"),
    status: safeString(row?.status, "pending") as MarketingWithdrawal["status"],
    requestedAt: safeString(row?.requested_at, nowIso()),
    reviewedAt: row?.reviewed_at ? safeString(row.reviewed_at) : null,
    reviewedBy: row?.reviewed_by ? safeString(row.reviewed_by) : null,
    reviewNote: row?.review_note ? safeString(row.review_note) : null,
    meta: asRecord(row?.meta),
  }
}

function toRiskEventRow(event: MarketingRiskEvent): RawRow {
  return {
    id: event.id,
    user_id: event.userId,
    risk_code: event.riskCode,
    severity: event.severity,
    status: event.status,
    source_event_id: event.sourceEventId,
    device_fingerprint: event.deviceFingerprint,
    ip_hash: event.ipHash,
    description: event.description,
    evidence: event.evidence,
    created_at: event.createdAt,
    reviewed_at: event.reviewedAt,
    reviewed_by: event.reviewedBy,
    review_note: event.reviewNote,
    updated_at: event.updatedAt,
  }
}

function mapRiskEventRow(row: RawRow): MarketingRiskEvent {
  return {
    id: safeString(row?.id || row?._id),
    userId: row?.user_id ? safeString(row.user_id) : null,
    riskCode: safeString(row?.risk_code),
    severity: safeString(row?.severity, "medium") as MarketingRiskEvent["severity"],
    status: safeString(row?.status, "open") as MarketingRiskEvent["status"],
    sourceEventId: row?.source_event_id ? safeString(row.source_event_id) : null,
    deviceFingerprint: row?.device_fingerprint ? safeString(row.device_fingerprint) : null,
    ipHash: row?.ip_hash ? safeString(row.ip_hash) : null,
    description: safeString(row?.description),
    evidence: asRecord(row?.evidence),
    createdAt: safeString(row?.created_at, nowIso()),
    reviewedAt: row?.reviewed_at ? safeString(row.reviewed_at) : null,
    reviewedBy: row?.reviewed_by ? safeString(row.reviewed_by) : null,
    reviewNote: row?.review_note ? safeString(row.review_note) : null,
    updatedAt: safeString(row?.updated_at || row?.reviewed_at || row?.created_at, nowIso()),
  }
}

function toRiskListRow(item: MarketingRiskListItem): RawRow {
  return {
    id: item.id,
    list_type: item.listType,
    target_value: item.targetValue,
    status: item.status,
    reason: item.reason,
    operator_id: item.operatorId,
    expires_at: item.expiresAt,
    meta: item.meta,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapRiskListRow(row: RawRow): MarketingRiskListItem {
  return {
    id: safeString(row?.id || row?._id),
    listType: safeString(row?.list_type, "user") as MarketingRiskListItem["listType"],
    targetValue: safeString(row?.target_value),
    status: safeString(row?.status, "active") as MarketingRiskListItem["status"],
    reason: safeString(row?.reason),
    operatorId: row?.operator_id ? safeString(row.operator_id) : null,
    expiresAt: row?.expires_at ? safeString(row.expires_at) : null,
    meta: asRecord(row?.meta),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

async function ensureCloudbaseMarketingDomain() {
  if (getRegion() !== "CN") return
  const db = await getDatabase()
  await ensureCloudbaseCollections(db, [USERS_COLLECTION, USER_DEVICES_COLLECTION, ADVERTISEMENTS_COLLECTION, ...ALL_MARKETING_COLLECTIONS])
}

async function ensureSeedData() {
  const now = Date.now()
  if (lastSeedEnsuredAt && now - lastSeedEnsuredAt < ENSURE_CACHE_MS) {
    return
  }
  if (ensureSeedDataPromise) {
    await ensureSeedDataPromise
    return
  }

  ensureSeedDataPromise = (async () => {
    if (getRegion() === "CN") {
      await ensureCloudbaseMarketingDomain()
    }

    const settings = (await loadRows(MARKETING_SETTINGS_COLLECTION)).map(mapSettingRow)
    if (settings.length === 0) {
      for (const setting of getDefaultMarketingSettings()) {
        await insertRow(MARKETING_SETTINGS_COLLECTION, toSettingRow(setting))
      }
    } else {
      const existingKeys = new Set(settings.map((item) => item.key))
      for (const setting of getDefaultMarketingSettings().filter((item) => !existingKeys.has(item.key))) {
        await insertRow(MARKETING_SETTINGS_COLLECTION, toSettingRow(setting))
      }
    }

    const campaigns = (await loadRows(MARKETING_CAMPAIGNS_COLLECTION)).map(mapCampaignRow)
    const campaignSlugs = new Set(campaigns.map((item) => item.slug))
    for (const campaign of getDefaultMarketingCampaigns().filter((item) => !campaignSlugs.has(item.slug))) {
      await insertRow(MARKETING_CAMPAIGNS_COLLECTION, toCampaignRow(campaign))
    }

    const templates = (await loadRows(MARKETING_TASKS_COLLECTION)).map(mapTaskTemplateRow)
    const templateSlugs = new Set(templates.map((item) => item.slug))
    for (const template of getDefaultMarketingTaskTemplates().filter((item) => !templateSlugs.has(item.slug))) {
      await insertRow(MARKETING_TASKS_COLLECTION, toTaskTemplateRow(template))
    }

    lastSeedEnsuredAt = Date.now()
  })()

  try {
    await ensureSeedDataPromise
  } finally {
    ensureSeedDataPromise = null
  }
}

function addDays(value: string, days: number) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return nowIso()
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.floor(days)))
  return date.toISOString()
}

function diffDaysFromNow(value?: string | null) {
  if (!value) return 0
  const target = new Date(value)
  if (!Number.isFinite(target.getTime())) return 0
  const diff = target.getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
}

function getInitialVipDays(user: MarketingUserLite) {
  return diffDaysFromNow(user.subscriptionExpiresAt)
}

function formatUserName(row: RawRow, fallback: string) {
  return (
    safeString(row?.full_name) ||
    safeString(row?.username) ||
    safeString(row?.email) ||
    safeString(row?.phone) ||
    fallback
  )
}

async function loadUsers(): Promise<MarketingUserLite[]> {
  const rows = await loadRows(USERS_COLLECTION)
  return rows.map((row) => {
    const userId = safeString(row?.id || row?._id)
    return {
      userId,
      name: formatUserName(row, userId || "Unknown user"),
      email: row?.email ? safeString(row.email) : null,
      lastLoginAt: row?.last_login_at ? safeString(row.last_login_at) : row?.last_seen_at ? safeString(row.last_seen_at) : null,
      credits: safeNumber(row?.credits),
      tokensRemaining: safeNumber(row?.tokens_remaining),
      subscriptionType: row?.subscription_type ? safeString(row.subscription_type) : null,
      subscriptionExpiresAt: row?.subscription_expires_at ? safeString(row.subscription_expires_at) : null,
    }
  })
}

async function listSettingsRaw() {
  await ensureSeedData()
  return (await loadRows(MARKETING_SETTINGS_COLLECTION))
    .map(mapSettingRow)
    .sort((a, b) => a.key.localeCompare(b.key))
}

async function getSettingsMap() {
  const settings = await listSettingsRaw()
  return new Map(settings.map((item) => [item.key, item]))
}

async function listCampaignsRaw() {
  await ensureSeedData()
  return dedupeCampaignRows(
    (await loadRows(MARKETING_CAMPAIGNS_COLLECTION))
      .map(mapCampaignRow),
  )
    .sort((a, b) => (a.sortOrder === b.sortOrder ? a.name.localeCompare(b.name) : a.sortOrder - b.sortOrder))
}

async function listTaskTemplatesRaw() {
  await ensureSeedData()
  return (await loadRows(MARKETING_TASKS_COLLECTION))
    .map(mapTaskTemplateRow)
    .sort((a, b) => (a.sortOrder === b.sortOrder ? a.name.localeCompare(b.name) : a.sortOrder - b.sortOrder))
}

async function listAccountsRaw() {
  await ensureSeedData()
  return (await loadRows(MARKETING_ACCOUNTS_COLLECTION))
    .map(mapAccountRow)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

async function listLedgersRaw() {
  await ensureSeedData()
  return (await loadRows(MARKETING_LEDGERS_COLLECTION))
    .map(mapLedgerRow)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

async function listUserTasksRaw() {
  await ensureSeedData()
  return (await loadRows(MARKETING_USER_TASKS_COLLECTION))
    .map(mapUserTaskRow)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

async function listEventLogsRaw() {
  await ensureSeedData()
  return (await loadRows(MARKETING_EVENTS_COLLECTION))
    .map(mapEventRow)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

async function listWithdrawalsRaw() {
  await ensureSeedData()
  return (await loadRows(MARKETING_WITHDRAWALS_COLLECTION))
    .map(mapWithdrawalRow)
    .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1))
}

async function listRiskEventsRaw() {
  await ensureSeedData()
  return (await loadRows(MARKETING_RISK_EVENTS_COLLECTION))
    .map(mapRiskEventRow)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

async function listRiskListsRaw(): Promise<MarketingRiskListItem[]> {
  await ensureSeedData()
  return (await loadRows(MARKETING_RISK_LISTS_COLLECTION))
    .map(mapRiskListRow)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

async function listInvitationCodesRaw(): Promise<MarketingInvitationCode[]> {
  await ensureSeedData()
  return (await loadRows(MARKETING_INVITATION_CODES_COLLECTION))
    .map(mapInvitationCodeRow)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

async function listCouponsRaw(): Promise<MarketingCoupon[]> {
  await ensureSeedData()
  return (await loadRows(MARKETING_COUPONS_COLLECTION))
    .map(mapCouponRow)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

async function findUserRowById(userId: string): Promise<RawRow | null> {
  const normalized = safeString(userId)
  if (!normalized) return null

  const rows = await loadRows(USERS_COLLECTION)
  return rows.find((row) => safeString(row?.id || row?._id) === normalized || safeString(row?.id) === normalized) || null
}

async function findUserById(userId: string): Promise<MarketingUserLite | null> {
  const normalized = safeString(userId)
  if (!normalized) return null
  const users = await loadUsers()
  return users.find((user) => user.userId === normalized) || null
}

function createMissingMarketingUserError(userId: string) {
  return new Error(`Bound user not found: ${userId}. Use a real users.id, or leave it blank for public distribution.`)
}

async function assertMarketingUserExists(userId: string) {
  const normalized = safeString(userId)
  if (!normalized) return null
  const user = await findUserById(normalized)
  if (!user) {
    throw createMissingMarketingUserError(normalized)
  }
  return user
}

export async function getMarketingUserById(userId: string) {
  return findUserById(userId)
}

function buildAccountPreview(
  account: MarketingAssetAccount,
  settingsMap: Map<string, MarketingSetting>,
): Pick<MarketingAssetAccount, "pendingExpiryAmount" | "nextExpiryAt"> {
  if (account.assetType === "points") {
    const previewDays = safeNumber(settingsMap.get("points_inactivity_preview_days")?.value, 30)
    if (account.availableBalance <= 0) {
      return { pendingExpiryAmount: 0, nextExpiryAt: null }
    }
    return {
      pendingExpiryAmount: account.availableBalance,
      nextExpiryAt: addDays(account.lastEventAt || nowIso(), previewDays),
    }
  }

  if (account.assetType === "cash") {
    const previewDays = safeNumber(settingsMap.get("cash_inactivity_preview_days")?.value, 30)
    if (account.availableBalance <= 0) {
      return { pendingExpiryAmount: 0, nextExpiryAt: null }
    }
    return {
      pendingExpiryAmount: account.availableBalance,
      nextExpiryAt: addDays(account.lastEventAt || nowIso(), previewDays),
    }
  }

  if (account.assetType === "vip_duration") {
    if (account.availableBalance <= 0) {
      return { pendingExpiryAmount: 0, nextExpiryAt: null }
    }
    return {
      pendingExpiryAmount: account.availableBalance,
      nextExpiryAt: addDays(nowIso(), account.availableBalance),
    }
  }

  return { pendingExpiryAmount: 0, nextExpiryAt: null }
}

function createDefaultAccount(
  user: MarketingUserLite,
  assetType: MarketingAssetType,
  settingsMap: Map<string, MarketingSetting>,
): MarketingAssetAccount {
  const createdAt = nowIso()
  const availableBalance =
    assetType === "points"
      ? user.credits
      : assetType === "ai_quota"
        ? user.tokensRemaining
        : assetType === "vip_duration"
          ? getInitialVipDays(user)
          : 0

  const base: MarketingAssetAccount = {
    id: randomUUID(),
    userId: user.userId,
    assetType,
    availableBalance,
    frozenBalance: 0,
    lifetimeEarned: Math.max(0, availableBalance),
    lifetimeSpent: 0,
    pendingExpiryAmount: 0,
    nextExpiryAt: null,
    lastEventAt: user.lastLoginAt,
    meta:
      assetType === "vip_duration"
        ? {
            projectionSubscriptionType: user.subscriptionType || "marketing_vip",
          }
        : {},
    createdAt,
    updatedAt: createdAt,
  }

  const preview = buildAccountPreview(base, settingsMap)
  return {
    ...base,
    ...preview,
  }
}

async function ensureUserAssetAccounts(user: MarketingUserLite, settingsMap?: Map<string, MarketingSetting>) {
  const currentSettingsMap = settingsMap || (await getSettingsMap())
  const allAccounts = await listAccountsRaw()
  const byUser = allAccounts.filter((item) => item.userId === user.userId)
  const byAsset = new Map(byUser.map((item) => [item.assetType, item]))
  const ensured: MarketingAssetAccount[] = [...byUser]

  for (const assetType of ASSET_TYPES) {
    if (!byAsset.has(assetType)) {
      const created = createDefaultAccount(user, assetType, currentSettingsMap)
      await insertRow(MARKETING_ACCOUNTS_COLLECTION, toAccountRow(created))
      ensured.push(created)
      byAsset.set(assetType, created)
    }
  }

  return ensured.sort((a, b) => ASSET_TYPES.indexOf(a.assetType) - ASSET_TYPES.indexOf(b.assetType))
}

async function ensureAllUserAssetAccounts() {
  const now = Date.now()
  if (lastAccountEnsureAt && now - lastAccountEnsureAt < ENSURE_CACHE_MS) {
    return
  }
  if (ensureAllUserAssetAccountsPromise) {
    await ensureAllUserAssetAccountsPromise
    return
  }

  ensureAllUserAssetAccountsPromise = (async () => {
    const [users, settingsMap, accounts] = await Promise.all([loadUsers(), getSettingsMap(), listAccountsRaw()])
    const accountKeys = new Set(accounts.map((account) => `${account.userId}:${account.assetType}`))
    const missingAccounts: MarketingAssetAccount[] = []

    for (const user of users) {
      for (const assetType of ASSET_TYPES) {
        const accountKey = `${user.userId}:${assetType}`
        if (accountKeys.has(accountKey)) {
          continue
        }

        missingAccounts.push(createDefaultAccount(user, assetType, settingsMap))
        accountKeys.add(accountKey)
      }
    }

    for (const account of missingAccounts) {
      await insertRow(MARKETING_ACCOUNTS_COLLECTION, toAccountRow(account))
    }

    lastAccountEnsureAt = Date.now()
  })()

  try {
    await ensureAllUserAssetAccountsPromise
  } finally {
    ensureAllUserAssetAccountsPromise = null
  }
}

async function getAccountByUserAndAsset(userId: string, assetType: MarketingAssetType) {
  const row = await findRow(MARKETING_ACCOUNTS_COLLECTION, {
    user_id: safeString(userId),
    asset_type: assetType,
  })
  return row ? mapAccountRow(row) : null
}

async function saveAccount(account: MarketingAssetAccount) {
  const settingsMap = await getSettingsMap()
  const next = {
    ...account,
    updatedAt: nowIso(),
    ...buildAccountPreview(account, settingsMap),
  }
  const existing = await findRow(MARKETING_ACCOUNTS_COLLECTION, { id: next.id })
  if (existing) {
    await updateRow(MARKETING_ACCOUNTS_COLLECTION, { id: next.id }, toAccountRow(next))
  } else {
    await insertRow(MARKETING_ACCOUNTS_COLLECTION, toAccountRow(next))
  }
  return next
}

async function getOrCreateAccount(userId: string, assetType: MarketingAssetType) {
  const existing = await getAccountByUserAndAsset(userId, assetType)
  if (existing) return existing

  const user = await findUserById(userId)
  if (!user) {
    throw new Error(`User ${userId} not found`)
  }

  const settingsMap = await getSettingsMap()
  const created = createDefaultAccount(user, assetType, settingsMap)
  await insertRow(MARKETING_ACCOUNTS_COLLECTION, toAccountRow(created))
  return created
}

async function upsertUserTask(task: MarketingUserTask) {
  const next = {
    ...task,
    updatedAt: nowIso(),
  }
  const existing = await findRow(MARKETING_USER_TASKS_COLLECTION, {
    user_id: next.userId,
    template_slug: next.templateSlug,
  })
  if (existing) {
    await updateRow(
      MARKETING_USER_TASKS_COLLECTION,
      {
        user_id: next.userId,
        template_slug: next.templateSlug,
      },
      toUserTaskRow(next),
    )
  } else {
    await insertRow(MARKETING_USER_TASKS_COLLECTION, toUserTaskRow(next))
  }
  return next
}

async function applyUserProjection(account: MarketingAssetAccount) {
  if (!["points", "ai_quota", "vip_duration"].includes(account.assetType)) return

  const userRow = await findUserRowById(account.userId)
  if (!userRow) return

  const filters = userRow?.id ? { id: userRow.id } : userRow?._id ? { _id: userRow._id } : null
  if (!filters) return

  const patch: RawRow = {}
  if (account.assetType === "points") {
    patch.credits = Math.max(0, Math.round(account.availableBalance))
  } else if (account.assetType === "ai_quota") {
    patch.tokens_remaining = Math.max(0, Math.round(account.availableBalance))
  } else if (account.assetType === "vip_duration") {
    const vipDays = Math.max(0, Math.round(account.availableBalance))
    patch.subscription_type = vipDays > 0 ? safeString(account.meta?.projectionSubscriptionType, safeString(userRow?.subscription_type, "monthly")) : null
    patch.subscription_expires_at = vipDays > 0 ? addDays(nowIso(), vipDays) : null
  }

  if (Object.keys(patch).length > 0) {
    await updateRow(USERS_COLLECTION, filters, patch)
  }
}

type LedgerMutationInput = {
  userId: string
  assetType: MarketingAssetType
  direction: "credit" | "debit"
  amount: number
  sourceType: string
  sourceId: string
  eventType: string
  remark: string
  operatorId?: string | null
  status?: MarketingAssetLedger["status"]
  expiresAt?: string | null
  meta?: JsonRecord
  createdAt?: string
}

async function createLedger(input: LedgerMutationInput) {
  const account = await getOrCreateAccount(input.userId, input.assetType)
  const amount = Number(Math.abs(safeNumber(input.amount)).toFixed(2))
  if (amount <= 0) {
    throw new Error("Ledger amount must be greater than zero")
  }

  const status = input.status || "available"
  let availableBalance = account.availableBalance
  let frozenBalance = account.frozenBalance
  let lifetimeEarned = account.lifetimeEarned
  let lifetimeSpent = account.lifetimeSpent

  if (input.direction === "credit") {
    if (status === "frozen") {
      frozenBalance += amount
    } else if (status === "reversed") {
      if (account.frozenBalance < amount) {
        throw new Error(`Frozen ${input.assetType} balance is insufficient for reversal`)
      }
      frozenBalance -= amount
      availableBalance += amount
    } else {
      availableBalance += amount
    }
    lifetimeEarned += amount
  } else {
    if (status === "frozen") {
      if (account.availableBalance < amount) {
        throw new Error(`Available ${input.assetType} balance is insufficient to freeze`)
      }
      availableBalance -= amount
      frozenBalance += amount
    } else if (status === "settled") {
      if (account.frozenBalance < amount) {
        throw new Error(`Frozen ${input.assetType} balance is insufficient to settle`)
      }
      frozenBalance -= amount
      lifetimeSpent += amount
    } else {
      if (account.availableBalance < amount) {
        throw new Error(`Available ${input.assetType} balance is insufficient`)
      }
      availableBalance -= amount
      lifetimeSpent += amount
    }
  }

  const nextAccount = await saveAccount({
    ...account,
    availableBalance: Number(availableBalance.toFixed(2)),
    frozenBalance: Number(frozenBalance.toFixed(2)),
    lifetimeEarned: Number(lifetimeEarned.toFixed(2)),
    lifetimeSpent: Number(lifetimeSpent.toFixed(2)),
    lastEventAt: input.createdAt || nowIso(),
    meta: {
      ...account.meta,
      lastSourceType: input.sourceType,
      lastRemark: input.remark,
    },
  })

  const ledger: MarketingAssetLedger = {
    id: randomUUID(),
    userId: input.userId,
    assetType: input.assetType,
    direction: input.direction,
    amount,
    availableAfter: nextAccount.availableBalance,
    frozenAfter: nextAccount.frozenBalance,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    eventType: input.eventType,
    remark: input.remark,
    operatorId: input.operatorId || null,
    status,
    expiresAt: input.expiresAt || null,
    meta: input.meta || {},
    createdAt: input.createdAt || nowIso(),
  }

  await insertRow(MARKETING_LEDGERS_COLLECTION, toLedgerRow(ledger))
  await applyUserProjection(nextAccount)
  return ledger
}

function isSameDate(left?: string | null, right?: string | null) {
  if (!left || !right) return false
  return safeString(left).slice(0, 10) === safeString(right).slice(0, 10)
}

function getIsoDay(value: string) {
  return safeString(value).slice(0, 10)
}

function isPreviousDate(previousValue?: string | null, currentValue?: string | null) {
  if (!previousValue || !currentValue) return false
  return getIsoDay(addDays(previousValue, 1)) === getIsoDay(currentValue)
}

function evaluateTaskProgress(
  template: MarketingTaskTemplate,
  currentTask: MarketingUserTask,
  eventLog: MarketingEventLog,
): { task: MarketingUserTask; completionsAwarded: number } {
  const meta = {
    ...currentTask.meta,
  }
  const occurredDate = getIsoDay(eventLog.occurredAt)
  const currentDailyDate = safeString(meta.dailyCounterDate)
  let dailyCounter = safeNumber(meta.dailyCounter)
  if (currentDailyDate !== occurredDate) {
    dailyCounter = 0
  }

  let progressValue = currentTask.progressValue
  let completionCount = currentTask.completionCount
  let rewardTotal = currentTask.rewardTotal
  let streakCount = currentTask.streakCount
  let lastCompletedAt = currentTask.lastCompletedAt
  let completionsAwarded = 0

  if (template.lifetimeLimit !== null && completionCount >= template.lifetimeLimit) {
    return {
      task: {
        ...currentTask,
        status: "capped",
      },
      completionsAwarded: 0,
    }
  }

  if (template.recurrence === "streak") {
    if (!isSameDate(currentTask.lastEventAt, eventLog.occurredAt)) {
      streakCount = isPreviousDate(currentTask.lastEventAt, eventLog.occurredAt) ? currentTask.streakCount + 1 : 1
    }
    progressValue = streakCount

    const canComplete = streakCount > 0 && streakCount % Math.max(1, template.thresholdValue) === 0
    if (canComplete && (template.dailyLimit === null || dailyCounter < template.dailyLimit)) {
      completionCount += 1
      dailyCounter += 1
      completionsAwarded += 1
      rewardTotal += template.rewardAmount
      lastCompletedAt = eventLog.occurredAt
    }
  } else {
    if (template.recurrence === "daily" && safeString(meta.progressDate) !== occurredDate) {
      progressValue = 0
    }

    if (!(template.recurrence === "once" && completionCount > 0)) {
      progressValue += 1
    }

    const canComplete = progressValue >= Math.max(1, template.thresholdValue)
    const withinDailyLimit = template.dailyLimit === null || dailyCounter < template.dailyLimit
    const withinLifetimeLimit = template.lifetimeLimit === null || completionCount < template.lifetimeLimit

    if (canComplete && withinDailyLimit && withinLifetimeLimit) {
      completionCount += 1
      dailyCounter += 1
      completionsAwarded += 1
      rewardTotal += template.rewardAmount
      lastCompletedAt = eventLog.occurredAt
      progressValue = template.recurrence === "once" ? template.thresholdValue : 0
    }
  }

  meta.dailyCounterDate = occurredDate
  meta.dailyCounter = dailyCounter
  meta.progressDate = occurredDate

  const nextStatus =
    template.lifetimeLimit !== null && completionCount >= template.lifetimeLimit
      ? "capped"
      : completionCount > 0 && template.recurrence === "once"
        ? "completed"
        : progressValue > 0 || streakCount > 0
          ? "in_progress"
          : "pending"

  return {
    task: {
      ...currentTask,
      progressValue,
      progressTarget: template.thresholdValue,
      completionCount,
      rewardTotal,
      streakCount,
      lastEventAt: eventLog.occurredAt,
      lastCompletedAt,
      status: nextStatus,
      meta,
    },
    completionsAwarded,
  }
}

async function findUserTask(userId: string, template: MarketingTaskTemplate) {
  const existing = await findRow(MARKETING_USER_TASKS_COLLECTION, {
    user_id: userId,
    template_slug: template.slug,
  })
  if (existing) {
    return mapUserTaskRow(existing)
  }

  return {
    id: randomUUID(),
    userId,
    templateSlug: template.slug,
    templateName: template.name,
    campaignSlug: template.campaignSlug,
    eventType: template.eventType,
    progressValue: 0,
    progressTarget: template.thresholdValue,
    completionCount: 0,
    rewardTotal: 0,
    streakCount: 0,
    lastEventAt: null,
    lastCompletedAt: null,
    status: "pending",
    meta: {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
  } satisfies MarketingUserTask
}

function resolveRewardUsers(template: MarketingTaskTemplate, eventLog: MarketingEventLog) {
  const payload = eventLog.payload || {}
  const resolved =
    template.rewardRecipient === "payload.inviterUserId"
      ? [safeString(payload.inviterUserId)]
      : template.rewardRecipient === "payload.invitedUserId"
        ? [safeString(payload.invitedUserId)]
        : template.rewardRecipient === "payload.userId"
          ? [safeString(payload.userId || eventLog.userId)]
          : [eventLog.userId]

  return uniqueStrings(resolved)
}

async function createRiskEvent(input: {
  userId?: string | null
  riskCode: string
  severity: MarketingRiskEvent["severity"]
  sourceEventId?: string | null
  deviceFingerprint?: string | null
  ipHash?: string | null
  description: string
  evidence?: JsonRecord
}) {
  const existing =
    input.sourceEventId &&
    (await findRow(MARKETING_RISK_EVENTS_COLLECTION, {
      source_event_id: input.sourceEventId,
      risk_code: input.riskCode,
    }))

  if (existing) {
    return mapRiskEventRow(existing)
  }

  const riskEvent: MarketingRiskEvent = {
    id: randomUUID(),
    userId: input.userId || null,
    riskCode: input.riskCode,
    severity: input.severity,
    status: "open",
    sourceEventId: input.sourceEventId || null,
    deviceFingerprint: input.deviceFingerprint || null,
    ipHash: input.ipHash || null,
    description: input.description,
    evidence: input.evidence || {},
    createdAt: nowIso(),
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null,
    updatedAt: nowIso(),
  }

  await insertRow(MARKETING_RISK_EVENTS_COLLECTION, toRiskEventRow(riskEvent))
  return riskEvent
}

async function detectRiskEvents(eventLog: MarketingEventLog) {
  const [settingsMap, riskLists, eventLogs, deviceRows] = await Promise.all([
    getSettingsMap(),
    listRiskListsRaw(),
    listEventLogsRaw(),
    loadRows(USER_DEVICES_COLLECTION),
  ])

  const riskListItems: MarketingRiskListItem[] = riskLists as MarketingRiskListItem[]
  const activeRiskLists: MarketingRiskListItem[] = riskListItems.filter(
    (item) => item.status === "active" && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()),
  )
  const created: MarketingRiskEvent[] = []

  const userHit = activeRiskLists.find((item) => item.listType === "user" && item.targetValue === eventLog.userId)
  const deviceHit = eventLog.deviceFingerprint
    ? activeRiskLists.find((item) => item.listType === "device" && item.targetValue === eventLog.deviceFingerprint)
    : undefined
  const ipHit = eventLog.ipHash
    ? activeRiskLists.find((item) => item.listType === "ip" && item.targetValue === eventLog.ipHash)
    : undefined

  if (userHit || deviceHit || ipHit) {
    created.push(
      await createRiskEvent({
        userId: eventLog.userId,
        riskCode: "matched_risk_list",
        severity: "high",
        sourceEventId: eventLog.id,
        deviceFingerprint: eventLog.deviceFingerprint,
        ipHash: eventLog.ipHash,
        description: "Event hit an active marketing risk list",
        evidence: {
          matchedTargets: [userHit?.targetValue, deviceHit?.targetValue, ipHit?.targetValue].filter(
            (target): target is string => typeof target === "string" && target.length > 0,
          ),
        },
      }),
    )
  }

  if (eventLog.eventType.startsWith("referral.")) {
    const inviterUserId = safeString(eventLog.payload.inviterUserId)
    const invitedUserId = safeString(eventLog.payload.invitedUserId || eventLog.userId)
    if (inviterUserId && invitedUserId && inviterUserId === invitedUserId) {
      created.push(
        await createRiskEvent({
          userId: invitedUserId,
          riskCode: "self_referral",
          severity: "high",
          sourceEventId: eventLog.id,
          deviceFingerprint: eventLog.deviceFingerprint,
          ipHash: eventLog.ipHash,
          description: "Referral event looks like a self-referral",
          evidence: {
            inviterUserId,
            invitedUserId,
          },
        }),
      )
    }
  }

  if (eventLog.deviceFingerprint) {
    const threshold = safeNumber(settingsMap.get("risk_multi_account_threshold")?.value, 3)
    const deviceUsers = uniqueStrings(
      deviceRows
        .filter((row) => safeString(row?.device_fingerprint) === eventLog.deviceFingerprint)
        .map((row) => safeString(row?.user_id)),
    )
    if (deviceUsers.length >= threshold) {
      created.push(
        await createRiskEvent({
          userId: eventLog.userId,
          riskCode: "multi_account_device",
          severity: "high",
          sourceEventId: eventLog.id,
          deviceFingerprint: eventLog.deviceFingerprint,
          ipHash: eventLog.ipHash,
          description: "Multiple accounts are sharing the same device fingerprint",
          evidence: {
            deviceUsers,
            threshold,
          },
        }),
      )
    }
  }

  if (eventLog.ipHash) {
    const threshold = safeNumber(settingsMap.get("risk_ip_frequency_threshold")?.value, 5)
    const sameIpDailyEvents = eventLogs.filter(
      (item) => item.ipHash === eventLog.ipHash && isSameDate(item.occurredAt, eventLog.occurredAt),
    )
    if (sameIpDailyEvents.length >= threshold) {
      created.push(
        await createRiskEvent({
          userId: eventLog.userId,
          riskCode: "ip_high_frequency",
          severity: "medium",
          sourceEventId: eventLog.id,
          deviceFingerprint: eventLog.deviceFingerprint,
          ipHash: eventLog.ipHash,
          description: "High frequency events detected from the same IP hash",
          evidence: {
            dailyCount: sameIpDailyEvents.length,
            threshold,
          },
        }),
      )
    }
  }

  if (eventLog.eventType === "ad.completed") {
    const eventTime = Date.parse(eventLog.occurredAt)
    const recentAdEvents = eventLogs.filter((item) => {
      if (item.userId !== eventLog.userId || item.eventType !== "ad.completed") return false
      const itemTime = Date.parse(item.occurredAt)
      if (!Number.isFinite(itemTime) || !Number.isFinite(eventTime)) return false
      return eventTime - itemTime <= 10 * 60 * 1000
    })
    if (recentAdEvents.length >= 3) {
      created.push(
        await createRiskEvent({
          userId: eventLog.userId,
          riskCode: "ad_velocity_spike",
          severity: "medium",
          sourceEventId: eventLog.id,
          deviceFingerprint: eventLog.deviceFingerprint,
          ipHash: eventLog.ipHash,
          description: "Ad reward completions spiked within a short time window",
          evidence: {
            windowMinutes: 10,
            eventCount: recentAdEvents.length,
          },
        }),
      )
    }
  }

  return created
}

function shouldFreezeReward(
  template: MarketingTaskTemplate,
  riskEvents: MarketingRiskEvent[],
  recipientUserId: string,
) {
  const freezeOn = uniqueStrings(asArray(template.riskRules.freezeOn).map((item) => safeString(item)))
  if (freezeOn.length === 0) return false
  return riskEvents.some((event) => (!event.userId || event.userId === recipientUserId) && freezeOn.includes(event.riskCode))
}

function paginateRows<T>(rows: T[], page: number, limit: number): MarketingListResult<T> {
  const safePage = parsePage(page, 1)
  const safeLimit = parseLimit(limit, 20, 200)
  const offset = (safePage - 1) * safeLimit
  return {
    page: safePage,
    limit: safeLimit,
    total: rows.length,
    rows: rows.slice(offset, offset + safeLimit),
  }
}

async function listAdvertisements() {
  return await loadRows(ADVERTISEMENTS_COLLECTION)
}

async function touchUserLogin(userId: string, occurredAt: string) {
  const userRow = await findUserRowById(userId)
  if (!userRow) return
  const filters = userRow?.id ? { id: userRow.id } : userRow?._id ? { _id: userRow._id } : null
  if (!filters) return
  await updateRow(USERS_COLLECTION, filters, {
    last_login_at: occurredAt,
    last_seen_at: occurredAt,
  })
}

function buildProductDistribution(eventLogs: MarketingEventLog[]) {
  const buckets = new Map<MarketingProduct, { events: number; users: Set<string> }>()
  for (const product of ["orbitchat", "ai", "ecommerce"] as MarketingProduct[]) {
    buckets.set(product, { events: 0, users: new Set<string>() })
  }

  for (const event of eventLogs) {
    const current = buckets.get(event.product) || { events: 0, users: new Set<string>() }
    current.events += 1
    current.users.add(event.userId)
    buckets.set(event.product, current)
  }

  return Array.from(buckets.entries()).map(([product, value]) => ({
    product,
    events: value.events,
    users: value.users.size,
  }))
}

export async function getMarketingOverview(): Promise<MarketingOverview> {
  await ensureAllUserAssetAccounts()
  const [accounts, withdrawals, riskEvents, campaigns, userTasks, eventLogs, taskTemplates] = await Promise.all([
    listAccountsRaw(),
    listWithdrawalsRaw(),
    listRiskEventsRaw(),
    listCampaignsRaw(),
    listUserTasksRaw(),
    listEventLogsRaw(),
    listTaskTemplatesRaw(),
  ])

  const assetTotals = {
    cash: { available: 0, frozen: 0 },
    points: { available: 0, frozen: 0 },
    ai_quota: { available: 0, frozen: 0 },
    vip_duration: { available: 0, frozen: 0 },
  } satisfies MarketingOverview["assetTotals"]

  for (const account of accounts) {
    assetTotals[account.assetType].available += account.availableBalance
    assetTotals[account.assetType].frozen += account.frozenBalance
  }

  const participants = new Set(userTasks.filter((item) => item.progressValue > 0 || item.completionCount > 0).map((item) => item.userId))
  const completions = userTasks.reduce((sum, item) => sum + item.completionCount, 0)

  return {
    region: getRegion(),
    generatedAt: nowIso(),
    assetTotals,
    pendingWithdrawals: {
      count: withdrawals.filter((item) => item.status === "pending").length,
      amount: withdrawals.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.amount, 0),
    },
    riskSummary: {
      openCount: riskEvents.filter((item) => item.status === "open" || item.status === "reviewing").length,
      frozenCount: riskEvents.filter((item) => item.status === "frozen").length,
      highSeverityCount: riskEvents.filter((item) => item.severity === "high").length,
    },
    campaignSummary: {
      active: campaigns.filter((item) => item.status === "active").length,
      draft: campaigns.filter((item) => item.status === "draft").length,
      paused: campaigns.filter((item) => item.status === "paused").length,
      archived: campaigns.filter((item) => item.status === "archived").length,
    },
    taskSummary: {
      totalTemplates: taskTemplates.length,
      activeTemplates: taskTemplates.filter((item) => item.status === "active").length,
      participants: participants.size,
      completions,
      conversionRate: participants.size > 0 ? Number(((completions / participants.size) * 100).toFixed(2)) : 0,
    },
    productDistribution: buildProductDistribution(eventLogs),
  }
}

export async function listMarketingSettings() {
  return listSettingsRaw()
}

export async function saveMarketingSetting(input: Partial<MarketingSetting> & { key: string; value: unknown }) {
  await ensureSeedData()
  const now = nowIso()
  const existing = await findRow(MARKETING_SETTINGS_COLLECTION, { key: input.key })
  const current = existing ? mapSettingRow(existing) : null
  const setting: MarketingSetting = {
    id: current?.id || input.id || randomUUID(),
    key: safeString(input.key),
    value: input.value,
    description: safeString(input.description, current?.description || input.key),
    createdAt: current?.createdAt || now,
    updatedAt: now,
  }

  if (current) {
    await updateRow(MARKETING_SETTINGS_COLLECTION, { key: setting.key }, toSettingRow(setting))
  } else {
    await insertRow(MARKETING_SETTINGS_COLLECTION, toSettingRow(setting))
  }
  return setting
}

export async function listMarketingCampaigns(input?: {
  status?: string
  query?: string
}) {
  let rows = await listCampaignsRaw()
  const query = safeString(input?.query).toLowerCase()
  if (input?.status) {
    rows = rows.filter((item) => item.status === safeString(input.status))
  }
  if (query) {
    rows = rows.filter((item) =>
      [item.slug, item.name, item.description, item.highlight, item.campaignType]
        .map((value) => safeString(value).toLowerCase())
        .some((value) => value.includes(query)),
    )
  }
  return rows
}

export async function saveMarketingCampaign(input: Partial<MarketingCampaign> & { slug: string; name: string }) {
  await ensureSeedData()
  const now = nowIso()
  const inputId = safeString(input.id)
  const inputSlug = safeString(input.slug)
  const existingById = inputId ? await findRow(MARKETING_CAMPAIGNS_COLLECTION, { id: inputId }) : null
  const existingBySlug = inputSlug ? await findRow(MARKETING_CAMPAIGNS_COLLECTION, { slug: inputSlug }) : null
  const existingByIdCampaign = existingById ? mapCampaignRow(existingById) : null
  const existingBySlugCampaign = existingBySlug ? mapCampaignRow(existingBySlug) : null

  if (
    existingByIdCampaign &&
    existingBySlugCampaign &&
    existingByIdCampaign.id !== existingBySlugCampaign.id
  ) {
    throw new Error(`Campaign slug "${inputSlug}" already exists`)
  }

  const current = existingByIdCampaign || existingBySlugCampaign
  const campaign: MarketingCampaign = {
    id: current?.id || input.id || randomUUID(),
    slug: inputSlug,
    name: safeString(input.name),
    description: safeString(input.description),
    campaignType: safeString(input.campaignType, current?.campaignType || "marketing"),
    productScope: normalizeProducts(input.productScope || current?.productScope || ["orbitchat"]),
    highlight: safeString(input.highlight),
    status: safeString(input.status, current?.status || "draft") as MarketingCampaign["status"],
    startAt: input.startAt === undefined ? current?.startAt || null : input.startAt,
    endAt: input.endAt === undefined ? current?.endAt || null : input.endAt,
    sortOrder: safeNumber(input.sortOrder, current?.sortOrder || 99),
    rules: asRecord(input.rules || current?.rules),
    createdAt: current?.createdAt || now,
    updatedAt: now,
  }

  if (current) {
    await updateRow(
      MARKETING_CAMPAIGNS_COLLECTION,
      existingByIdCampaign ? { id: existingByIdCampaign.id } : { slug: current.slug },
      toCampaignRow(campaign),
    )
  } else {
    await insertRow(MARKETING_CAMPAIGNS_COLLECTION, toCampaignRow(campaign))
  }
  return campaign
}

export async function listMarketingTaskTemplates(input?: {
  status?: string
  query?: string
  taskType?: string
}) {
  let rows = await listTaskTemplatesRaw()
  const query = safeString(input?.query).toLowerCase()
  if (input?.status) {
    rows = rows.filter((item) => item.status === safeString(input.status))
  }
  if (input?.taskType) {
    rows = rows.filter((item) => item.taskType === safeString(input.taskType))
  }
  if (query) {
    rows = rows.filter((item) =>
      [item.slug, item.name, item.description, item.taskType, item.campaignSlug, item.eventType]
        .map((value) => safeString(value).toLowerCase())
        .some((value) => value.includes(query)),
    )
  }
  return rows
}

export async function saveMarketingTaskTemplate(input: Partial<MarketingTaskTemplate> & { slug: string; name: string }) {
  await ensureSeedData()
  const now = nowIso()
  const existing = await findRow(MARKETING_TASKS_COLLECTION, { slug: input.slug })
  const current = existing ? mapTaskTemplateRow(existing) : null
  const template: MarketingTaskTemplate = {
    id: current?.id || input.id || randomUUID(),
    slug: safeString(input.slug),
    campaignSlug: safeString(input.campaignSlug, current?.campaignSlug),
    name: safeString(input.name),
    description: safeString(input.description),
    taskType: safeString(input.taskType, current?.taskType || "manual"),
    eventType: safeString(input.eventType, current?.eventType || "user.login") as MarketingTaskTemplate["eventType"],
    rewardAsset: safeString(input.rewardAsset, current?.rewardAsset || "points") as MarketingAssetType,
    rewardAmount: safeNumber(input.rewardAmount, current?.rewardAmount || 0),
    rewardRecipient: safeString(input.rewardRecipient, current?.rewardRecipient || "actor") as MarketingTaskTemplate["rewardRecipient"],
    thresholdValue: Math.max(1, safeNumber(input.thresholdValue, current?.thresholdValue || 1)),
    thresholdUnit: safeString(input.thresholdUnit, current?.thresholdUnit || "times"),
    dailyLimit:
      input.dailyLimit === undefined
        ? current?.dailyLimit ?? null
        : input.dailyLimit === null
          ? null
          : safeNumber(input.dailyLimit),
    lifetimeLimit:
      input.lifetimeLimit === undefined
        ? current?.lifetimeLimit ?? null
        : input.lifetimeLimit === null
          ? null
          : safeNumber(input.lifetimeLimit),
    recurrence: safeString(input.recurrence, current?.recurrence || "repeatable") as MarketingTaskTemplate["recurrence"],
    decayPolicy: safeString(input.decayPolicy, current?.decayPolicy || "none"),
    riskRules: asRecord(input.riskRules || current?.riskRules),
    products: normalizeProducts(input.products || current?.products || ["orbitchat"]),
    meta: asRecord(input.meta || current?.meta),
    status: safeString(input.status, current?.status || "draft") as MarketingTaskTemplate["status"],
    sortOrder: safeNumber(input.sortOrder, current?.sortOrder || 99),
    createdAt: current?.createdAt || now,
    updatedAt: now,
  }

  if (current) {
    await updateRow(MARKETING_TASKS_COLLECTION, { slug: template.slug }, toTaskTemplateRow(template))
  } else {
    await insertRow(MARKETING_TASKS_COLLECTION, toTaskTemplateRow(template))
  }
  return template
}

export async function listMarketingAssetAccounts(input?: {
  page?: number | string
  limit?: number | string
  userId?: string
  query?: string
}) {
  await ensureAllUserAssetAccounts()
  const [users, accounts] = await Promise.all([loadUsers(), listAccountsRaw()])
  const query = safeString(input?.query).toLowerCase()
  const filteredUsers = users.filter((item) => {
    if (input?.userId && item.userId !== safeString(input.userId)) {
      return false
    }
    if (!query) {
      return true
    }
    return [item.userId, item.name, item.email || "", item.subscriptionType || ""]
      .map((value) => safeString(value).toLowerCase())
      .some((value) => value.includes(query))
  })
  const rows: MarketingAccountBundle[] = filteredUsers.map((user) => {
    const userAccounts = accounts.filter((item) => item.userId === user.userId)
    const accountRecord = Object.fromEntries(
      ASSET_TYPES.map((assetType) => [assetType, userAccounts.find((item) => item.assetType === assetType) || null]),
    ) as Record<MarketingAssetType, MarketingAssetAccount | null>

    const previewWarnings: string[] = []
    const pointsAccount = accountRecord.points
    const cashAccount = accountRecord.cash
    if (pointsAccount?.nextExpiryAt && diffDaysFromNow(pointsAccount.nextExpiryAt) <= 7) {
      previewWarnings.push(`Points preview decay in ${diffDaysFromNow(pointsAccount.nextExpiryAt)} days`)
    }
    if (cashAccount?.nextExpiryAt && diffDaysFromNow(cashAccount.nextExpiryAt) <= 7) {
      previewWarnings.push(`Cash preview decay in ${diffDaysFromNow(cashAccount.nextExpiryAt)} days`)
    }
    if (!user.lastLoginAt) {
      previewWarnings.push("No recent login footprint")
    }

    return {
      user,
      accounts: accountRecord,
      previewWarnings,
    }
  })

  return paginateRows(rows, parsePage(input?.page, 1), parseLimit(input?.limit, 20, 200))
}

export async function listMarketingAssetLedgers(input?: {
  page?: number | string
  limit?: number | string
  userId?: string
  assetType?: MarketingAssetType | string
  query?: string
}) {
  let rows = await listLedgersRaw()
  if (input?.userId) {
    rows = rows.filter((item) => item.userId === safeString(input.userId))
  }
  if (input?.assetType) {
    rows = rows.filter((item) => item.assetType === (safeString(input.assetType) as MarketingAssetType))
  }
  if (input?.query) {
    const query = safeString(input.query).toLowerCase()
    rows = rows.filter((item) =>
      [item.userId, item.sourceType, item.eventType, item.remark, item.operatorId || ""]
        .map((value) => safeString(value).toLowerCase())
        .some((value) => value.includes(query)),
    )
  }
  return paginateRows(rows, parsePage(input?.page, 1), parseLimit(input?.limit, 20, 200))
}

export async function adjustMarketingAsset(input: {
  userId: string
  assetType: MarketingAssetType
  amount: number
  remark: string
  operatorId?: string | null
  expiresAt?: string | null
  meta?: JsonRecord
}) {
  const amount = safeNumber(input.amount)
  if (amount === 0) {
    throw new Error("Adjustment amount cannot be zero")
  }

  return createLedger({
    userId: safeString(input.userId),
    assetType: input.assetType,
    direction: amount > 0 ? "credit" : "debit",
    amount: Math.abs(amount),
    sourceType: "manual_adjustment",
    sourceId: randomUUID(),
    eventType: "marketing.asset.adjusted",
    remark: safeString(input.remark, "Manual adjustment"),
    operatorId: input.operatorId || null,
    status: "available",
    expiresAt: input.expiresAt || null,
    meta: input.meta || {},
  })
}

export async function createMarketingSystemLedger(input: {
  userId: string
  assetType: MarketingAssetType
  direction: "credit" | "debit"
  amount: number
  sourceType: string
  sourceId: string
  eventType: string
  remark: string
  operatorId?: string | null
  status?: MarketingAssetLedger["status"]
  expiresAt?: string | null
  meta?: JsonRecord
  createdAt?: string
}) {
  const sourceId = safeString(input.sourceId)
  if (!sourceId) {
    throw new Error("sourceId is required")
  }

  const existing = await findRow(MARKETING_LEDGERS_COLLECTION, {
    source_id: sourceId,
  })
  if (existing) {
    return mapLedgerRow(existing)
  }

  return createLedger({
    userId: safeString(input.userId),
    assetType: input.assetType,
    direction: input.direction,
    amount: input.amount,
    sourceType: safeString(input.sourceType, "system"),
    sourceId,
    eventType: safeString(input.eventType, "marketing.system"),
    remark: safeString(input.remark, "System ledger"),
    operatorId: input.operatorId || null,
    status: input.status || "available",
    expiresAt: input.expiresAt || null,
    meta: input.meta || {},
    createdAt: input.createdAt,
  })
}

export async function recordMarketingEventOccurrence(input: {
  product: MarketingProduct
  eventType: MarketingEventType
  userId: string
  occurredAt?: string
  source?: string | null
  deviceFingerprint?: string | null
  ipHash?: string | null
  payload?: Record<string, unknown>
  status?: MarketingEventLog["status"]
}) {
  await ensureSeedData()
  const userId = safeString(input.userId)
  if (!userId) {
    throw new Error("userId is required")
  }

  const eventLog: MarketingEventLog = {
    id: randomUUID(),
    product: input.product,
    eventType: input.eventType,
    userId,
    occurredAt: safeString(input.occurredAt, nowIso()),
    source: input.source || null,
    deviceFingerprint: input.deviceFingerprint || null,
    ipHash: input.ipHash || null,
    payload: input.payload || {},
    status: input.status || "processed",
    processedAt: input.status === "pending" ? null : nowIso(),
    resultSummary: {},
    createdAt: nowIso(),
  }

  await insertRow(MARKETING_EVENTS_COLLECTION, toEventRow(eventLog))

  if (eventLog.eventType === "user.login") {
    await touchUserLogin(eventLog.userId, eventLog.occurredAt)
  }

  return eventLog
}

export async function createMarketingWithdrawalRequest(input: {
  userId: string
  amount: number
  channel?: string
  meta?: JsonRecord
}) {
  const settingsMap = await getSettingsMap()
  const threshold = safeNumber(settingsMap.get("withdraw_min_amount")?.value, 20)
  const amount = safeNumber(input.amount)
  if (amount < threshold) {
    throw new Error(`Withdrawal amount must be at least ${threshold}`)
  }

  const cashAccount = await getOrCreateAccount(input.userId, "cash")
  if (cashAccount.availableBalance < amount) {
    throw new Error("Available cash balance is insufficient")
  }

  const withdrawal: MarketingWithdrawal = {
    id: randomUUID(),
    userId: safeString(input.userId),
    amount,
    thresholdAmount: threshold,
    channel: safeString(input.channel, "manual"),
    status: "pending",
    requestedAt: nowIso(),
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null,
    meta: input.meta || {},
  }

  await insertRow(MARKETING_WITHDRAWALS_COLLECTION, toWithdrawalRow(withdrawal))
  await createLedger({
    userId: withdrawal.userId,
    assetType: "cash",
    direction: "debit",
    amount: withdrawal.amount,
    sourceType: "withdrawal_request",
    sourceId: withdrawal.id,
    eventType: "marketing.withdrawal.requested",
    remark: `Withdrawal requested via ${withdrawal.channel}`,
    status: "frozen",
    meta: {
      withdrawalId: withdrawal.id,
      thresholdAmount: withdrawal.thresholdAmount,
    },
  })

  return withdrawal
}

export async function listMarketingWithdrawals(input?: {
  page?: number | string
  limit?: number | string
  userId?: string
  status?: string
  query?: string
}) {
  let rows = await listWithdrawalsRaw()
  if (input?.userId) {
    rows = rows.filter((item) => item.userId === safeString(input.userId))
  }
  if (input?.status) {
    rows = rows.filter((item) => item.status === safeString(input.status))
  }
  if (input?.query) {
    const query = safeString(input.query).toLowerCase()
    rows = rows.filter((item) =>
      [item.id, item.userId, item.channel, item.reviewNote || "", item.reviewedBy || ""]
        .map((value) => safeString(value).toLowerCase())
        .some((value) => value.includes(query)),
    )
  }
  return paginateRows(rows, parsePage(input?.page, 1), parseLimit(input?.limit, 20, 200))
}

export async function reviewMarketingWithdrawal(input: {
  id: string
  status: "approved" | "rejected" | "frozen"
  reviewNote?: string | null
  operatorId?: string | null
}) {
  const current = await findRow(MARKETING_WITHDRAWALS_COLLECTION, { id: safeString(input.id) })
  if (!current) {
    throw new Error("Withdrawal request not found")
  }

  const withdrawal = mapWithdrawalRow(current)
  if (withdrawal.status === "approved" || withdrawal.status === "rejected") {
    throw new Error("Withdrawal request has already been reviewed")
  }

  if (input.status === "approved") {
    await createLedger({
      userId: withdrawal.userId,
      assetType: "cash",
      direction: "debit",
      amount: withdrawal.amount,
      sourceType: "withdrawal_review",
      sourceId: withdrawal.id,
      eventType: "marketing.withdrawal.approved",
      remark: "Withdrawal approved",
      operatorId: input.operatorId || null,
      status: "settled",
      meta: {
        withdrawalId: withdrawal.id,
      },
    })
  } else if (input.status === "rejected") {
    await createLedger({
      userId: withdrawal.userId,
      assetType: "cash",
      direction: "credit",
      amount: withdrawal.amount,
      sourceType: "withdrawal_review",
      sourceId: withdrawal.id,
      eventType: "marketing.withdrawal.rejected",
      remark: "Withdrawal rejected and amount returned",
      operatorId: input.operatorId || null,
      status: "reversed",
      meta: {
        withdrawalId: withdrawal.id,
      },
    })
  }

  const reviewed: MarketingWithdrawal = {
    ...withdrawal,
    status: input.status,
    reviewedAt: nowIso(),
    reviewedBy: input.operatorId || null,
    reviewNote: input.reviewNote || null,
  }

  await updateRow(MARKETING_WITHDRAWALS_COLLECTION, { id: reviewed.id }, toWithdrawalRow(reviewed))
  return reviewed
}

export async function listMarketingRiskEvents(input?: {
  page?: number | string
  limit?: number | string
  status?: string
  severity?: string
  query?: string
}) {
  let rows = await listRiskEventsRaw()
  if (input?.status) {
    rows = rows.filter((item) => item.status === safeString(input.status))
  }
  if (input?.severity) {
    rows = rows.filter((item) => item.severity === safeString(input.severity))
  }
  if (input?.query) {
    const query = safeString(input.query).toLowerCase()
    rows = rows.filter((item) =>
      [
        item.userId || "",
        item.riskCode,
        item.description,
        item.deviceFingerprint || "",
        item.ipHash || "",
        item.reviewNote || "",
      ]
        .map((value) => safeString(value).toLowerCase())
        .some((value) => value.includes(query)),
    )
  }
  return paginateRows(rows, parsePage(input?.page, 1), parseLimit(input?.limit, 20, 200))
}

export async function resolveMarketingRiskEvent(input: {
  id: string
  status: MarketingRiskEvent["status"]
  reviewNote?: string | null
  operatorId?: string | null
}) {
  const current = await findRow(MARKETING_RISK_EVENTS_COLLECTION, { id: safeString(input.id) })
  if (!current) {
    throw new Error("Risk event not found")
  }

  const next: MarketingRiskEvent = {
    ...mapRiskEventRow(current),
    status: input.status,
    reviewedAt: nowIso(),
    reviewedBy: input.operatorId || null,
    reviewNote: input.reviewNote || null,
  }

  await updateRow(MARKETING_RISK_EVENTS_COLLECTION, { id: next.id }, toRiskEventRow(next))
  return next
}

export async function listMarketingRiskLists(input?: {
  page?: number | string
  limit?: number | string
  listType?: string
  status?: string
  query?: string
}) {
  let rows = await listRiskListsRaw()
  if (input?.listType) {
    rows = rows.filter((item) => item.listType === safeString(input.listType))
  }
  if (input?.status) {
    rows = rows.filter((item) => item.status === safeString(input.status))
  }
  if (input?.query) {
    const query = safeString(input.query).toLowerCase()
    rows = rows.filter((item) =>
      [item.targetValue, item.reason, item.listType, item.operatorId || ""]
        .map((value) => safeString(value).toLowerCase())
        .some((value) => value.includes(query)),
    )
  }
  return paginateRows(rows, parsePage(input?.page, 1), parseLimit(input?.limit, 20, 200))
}

export async function saveMarketingRiskList(input: {
  id?: string
  listType: MarketingRiskListItem["listType"]
  targetValue: string
  status?: MarketingRiskListItem["status"]
  reason?: string
  operatorId?: string | null
  expiresAt?: string | null
  meta?: JsonRecord
}) {
  const existing =
    (input.id && (await findRow(MARKETING_RISK_LISTS_COLLECTION, { id: input.id }))) ||
    (await findRow(MARKETING_RISK_LISTS_COLLECTION, {
      list_type: input.listType,
      target_value: safeString(input.targetValue),
    }))

  const current = existing ? mapRiskListRow(existing) : null
  const next: MarketingRiskListItem = {
    id: current?.id || input.id || randomUUID(),
    listType: input.listType,
    targetValue: safeString(input.targetValue),
    status: input.status || current?.status || "active",
    reason: safeString(input.reason, current?.reason || "manual_watch"),
    operatorId: input.operatorId || current?.operatorId || null,
    expiresAt: input.expiresAt === undefined ? current?.expiresAt || null : input.expiresAt,
    meta: input.meta || current?.meta || {},
    createdAt: current?.createdAt || nowIso(),
    updatedAt: nowIso(),
  }

  if (current) {
    await updateRow(MARKETING_RISK_LISTS_COLLECTION, { id: next.id }, toRiskListRow(next))
  } else {
    await insertRow(MARKETING_RISK_LISTS_COLLECTION, toRiskListRow(next))
  }
  return next
}

export async function getMarketingReports(): Promise<MarketingReports> {
  await ensureAllUserAssetAccounts()
  const [accounts, tasks, withdrawals, riskEvents, eventLogs, invitationCodes, coupons] = await Promise.all([
    listAccountsRaw(),
    listUserTasksRaw(),
    listWithdrawalsRaw(),
    listRiskEventsRaw(),
    listEventLogsRaw(),
    listInvitationCodesRaw(),
    listCouponsRaw(),
  ])

  const assetDistribution = ASSET_TYPES.map((assetType) => {
    const assetAccounts = accounts.filter((item) => item.assetType === assetType)
    return {
      assetType,
      available: assetAccounts.reduce((sum, item) => sum + item.availableBalance, 0),
      frozen: assetAccounts.reduce((sum, item) => sum + item.frozenBalance, 0),
      userCount: assetAccounts.length,
    }
  })

  const taskPerformance = tasks.reduce((map, task) => {
    const current = map.get(task.templateSlug) || {
      templateSlug: task.templateSlug,
      templateName: task.templateName,
      completions: 0,
      rewardTotal: 0,
      users: new Set<string>(),
    }
    current.users.add(task.userId)
    current.completions += task.completionCount
    current.rewardTotal += task.rewardTotal
    map.set(task.templateSlug, current)
    return map
  }, new Map<string, { templateSlug: string; templateName: string; completions: number; rewardTotal: number; users: Set<string> }>())

  const normalizedTaskPerformance = Array.from(taskPerformance.values()).map((item) => ({
    templateSlug: item.templateSlug,
    templateName: item.templateName,
    participants: item.users.size,
    completions: item.completions,
    rewardTotal: item.rewardTotal,
    conversionRate: item.users.size > 0 ? Number(((item.completions / item.users.size) * 100).toFixed(2)) : 0,
  }))

  const riskBreakdown = Array.from(
    riskEvents.reduce((map, event) => {
      const current = map.get(event.riskCode) || { riskCode: event.riskCode, count: 0, highSeverityCount: 0 }
      current.count += 1
      if (event.severity === "high") current.highSeverityCount += 1
      map.set(event.riskCode, current)
      return map
    }, new Map<string, { riskCode: string; count: number; highSeverityCount: number }>())
      .values(),
  )

  return {
    assetDistribution,
    taskPerformance: normalizedTaskPerformance,
    withdrawalStats: {
      pendingCount: withdrawals.filter((item) => item.status === "pending").length,
      approvedCount: withdrawals.filter((item) => item.status === "approved").length,
      rejectedCount: withdrawals.filter((item) => item.status === "rejected").length,
      frozenCount: withdrawals.filter((item) => item.status === "frozen").length,
      pendingAmount: withdrawals.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.amount, 0),
      approvedAmount: withdrawals.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.amount, 0),
    },
    riskBreakdown,
    productDistribution: buildProductDistribution(eventLogs),
    recentEvents: eventLogs.slice(0, 12),
  }
}

export async function getMarketingAdInventorySummary() {
  const [advertisements, templates] = await Promise.all([listAdvertisements(), listTaskTemplatesRaw()])
  const activeAds = advertisements.filter((item) => safeString(item?.status) === "active")
  const adWatchTemplates = templates.filter((item) => item.taskType === "ad_watch")

  return {
    inventory: {
      total: advertisements.length,
      active: activeAds.length,
      positions: uniqueStrings(advertisements.map((item) => safeString(item?.position || item?.type || "unknown"))),
      totalImpressions: advertisements.reduce((sum, item) => sum + safeNumber(item?.impression_count), 0),
      totalClicks: advertisements.reduce((sum, item) => sum + safeNumber(item?.click_count), 0),
    },
    templates: adWatchTemplates,
    advertisements: advertisements.slice(0, 20).map((item) => ({
      id: safeString(item?.id || item?._id),
      title: safeString(item?.title),
      position: safeString(item?.position || item?.type, "unknown"),
      status: safeString(item?.status, "draft"),
      priority: safeNumber(item?.priority),
      impressionCount: safeNumber(item?.impression_count),
      clickCount: safeNumber(item?.click_count),
    })),
  }
}

export async function getMarketingReferralCompatibility() {
  const [overview, topInviters, relations] = await Promise.all([
    getMarketAdminOverview(),
    getMarketAdminTopInviters({ limit: 10 }),
    getMarketAdminRelations({ page: 1, limit: 10 }),
  ])

  return {
    overview,
    topInviters,
    relations,
  }
}

function buildDailyRoiRows(ledgers: MarketingAssetLedger[], trends: MarketTrendPoint[]): MarketingDailyRoiRow[] {
  const ledgerCosts = ledgers.reduce(
    (map, ledger) => {
      const dateKey = toDateKey(ledger.createdAt)
      if (!dateKey || ledger.direction !== "credit") {
        return map
      }
      const current = map.get(dateKey) || { cashCost: 0, pointsCost: 0 }
      if (ledger.assetType === "cash") current.cashCost += ledger.amount
      if (ledger.assetType === "points") current.pointsCost += ledger.amount
      map.set(dateKey, current)
      return map
    },
    new Map<string, { cashCost: number; pointsCost: number }>(),
  )

  return [...trends]
    .map((point) => {
      const cost = ledgerCosts.get(point.date) || { cashCost: 0, pointsCost: 0 }
      const spendBase = cost.cashCost + cost.pointsCost / 100
      return {
        date: point.date,
        clicks: point.clicks,
        invites: point.invites,
        activated: point.activated,
        cashCost: Number(cost.cashCost.toFixed(2)),
        pointsCost: Number(cost.pointsCost.toFixed(2)),
        roi: spendBase > 0 ? `${Math.round((point.activated * 100) / spendBase)}%` : point.activated > 0 ? "∞" : "0%",
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

function buildFissionOverviewFromRelations(
  relations: MarketRelationRow[],
  rewards: MarketRewardRow[],
  clickCount: number,
) {
  const totalInvites = relations.length
  const totalActivated = relations.filter((item) => Boolean(item.activatedAt)).length
  const relationIds = new Set(relations.map((item) => item.relationId))
  const totalRewardCredits = rewards
    .filter((item) => (item.relationId ? relationIds.has(item.relationId) : false))
    .reduce((sum, item) => sum + item.amount, 0)

  return {
    totalClicks: clickCount,
    totalInvites,
    totalActivated,
    totalRewardCredits,
    conversionRate: clickCount > 0 ? Number(((totalInvites / clickCount) * 100).toFixed(2)) : 0,
    activationRate: totalInvites > 0 ? Number(((totalActivated / totalInvites) * 100).toFixed(2)) : 0,
  }
}

function buildInvitationCodeTopInviters(
  invitationCodes: MarketingInvitationCode[],
  usersById: Map<string, MarketingUserLite>,
): Array<MarketTopInviterPoint & { updatedAt: string }> {
  const map = new Map<string, MarketTopInviterPoint & { updatedAt: string }>()

  for (const code of invitationCodes) {
    const inviterUserId = safeString(code.userId)
    if (!inviterUserId) continue

    const user = usersById.get(inviterUserId)
    const current = map.get(inviterUserId) || {
      inviterUserId,
      inviterEmail: user?.email || null,
      referralCode: safeString(code.code) || null,
      clickCount: 0,
      invitedCount: 0,
      activatedCount: 0,
      rewardCredits: 0,
      updatedAt: code.updatedAt || code.createdAt,
    }

    current.inviterEmail = current.inviterEmail || user?.email || null
    current.invitedCount += safeNumber(code.usedCount)
    current.clickCount += safeNumber(code.usedCount)

    const currentStamp = new Date(current.updatedAt).getTime()
    const nextStamp = new Date(code.updatedAt || code.createdAt).getTime()
    if (!Number.isFinite(currentStamp) || nextStamp >= currentStamp) {
      current.updatedAt = code.updatedAt || code.createdAt
      current.referralCode = safeString(code.code) || current.referralCode
    }

    map.set(inviterUserId, current)
  }

  return Array.from(map.values())
}

function sortTopInviters(rows: MarketTopInviterPoint[]) {
  return [...rows].sort((a, b) => {
    if (b.invitedCount !== a.invitedCount) return b.invitedCount - a.invitedCount
    if (b.activatedCount !== a.activatedCount) return b.activatedCount - a.activatedCount
    if (b.clickCount !== a.clickCount) return b.clickCount - a.clickCount
    return b.rewardCredits - a.rewardCredits
  })
}

export async function getMarketingFissionData(input?: {
  search?: string
  status?: string
  datePreset?: string
  date?: string
  page?: number | string
  limit?: number | string
}): Promise<MarketingFissionData> {
  const page = parsePage(input?.page, 1)
  const limit = parseLimit(input?.limit, 10, 200)
  const search = safeString(input?.search)
  const status = safeString(input?.status, "all")
  const datePreset = safeString(input?.datePreset, "all")
  const customDate = safeString(input?.date)

  const [overview, trends, channels, topInviters, relationList, rewardList, invitationCodes, users] = await Promise.all([
    getMarketAdminOverview(),
    getMarketAdminTrends({ days: datePreset === "30days" ? 30 : 7 }),
    getMarketAdminChannels({ limit: 8 }),
    getMarketAdminTopInviters({ limit: 8 }),
    getMarketAdminRelations({ page: 1, limit: 2000 }),
    getMarketAdminRewards({ page: 1, limit: 4000 }),
    listInvitationCodesRaw(),
    loadUsers(),
  ])
  const usersById = new Map(users.map((user) => [user.userId, user]))

  let filteredRelations = relationList.rows.filter((row) => {
    const matchedSearch =
      !search ||
      [
        row.inviterUserId,
        row.invitedUserId,
        row.inviterEmail || "",
        row.invitedEmail || "",
        row.shareCode,
        row.toolSlug || "",
        row.firstToolId || "",
      ].some((value) => matchesSearchValue(safeString(value), search))

    const matchedStatus = status === "all" ? true : safeString(row.status) === status
    const matchedDate = matchesDatePreset(row.createdAt, datePreset, customDate)
    return matchedSearch && matchedStatus && matchedDate
  })

  const filteredRelationIds = new Set(filteredRelations.map((item) => item.relationId))
  const filteredRewards = rewardList.rows.filter((item) => (item.relationId ? filteredRelationIds.has(item.relationId) : false))
  const relationCodes = new Set(filteredRelations.map((item) => safeString(item.shareCode)).filter(Boolean))
  const filteredClickCount =
    search || status !== "all" || datePreset !== "all"
      ? filteredRelations.reduce((sum, relation) => sum + (relationCodes.has(safeString(relation.shareCode)) ? 1 : 0), 0)
      : overview.totalClicks

  const filteredOverview = buildFissionOverviewFromRelations(filteredRelations, filteredRewards, filteredClickCount)
  const filteredInvitationCodes = invitationCodes.filter((item) => {
    const user = usersById.get(item.userId)
    const matchedSearch =
      !search ||
      [
        item.code,
        item.userId,
        item.campaignSlug || "",
        item.partnerProduct || "",
        user?.email || "",
      ].some((value) => matchesSearchValue(safeString(value), search))
    const matchedStatus = status === "all" ? true : safeString(item.status) === status
    const matchedDate = matchesDatePreset(item.updatedAt || item.createdAt, datePreset, customDate)
    return matchedSearch && matchedStatus && matchedDate
  })
  const invitationTopInviters = buildInvitationCodeTopInviters(filteredInvitationCodes, usersById)

  const topInvitersMap = filteredRelations.reduce(
    (map, row) => {
      const current = map.get(row.inviterUserId) || {
        inviterUserId: row.inviterUserId,
        inviterEmail: row.inviterEmail,
        referralCode: row.shareCode,
        clickCount: 0,
        invitedCount: 0,
        activatedCount: 0,
        rewardCredits: 0,
      }
      current.invitedCount += 1
      if (row.activatedAt) current.activatedCount += 1
      map.set(row.inviterUserId, current)
      return map
    },
    new Map<string, MarketTopInviterPoint>(),
  )

  for (const reward of filteredRewards) {
    if (!reward.relationId) continue
    const relation = filteredRelations.find((item) => item.relationId === reward.relationId)
    if (!relation) continue
    const inviter = topInvitersMap.get(relation.inviterUserId)
    if (!inviter) continue
    inviter.rewardCredits += reward.amount
  }

  for (const inviter of topInvitersMap.values()) {
    inviter.clickCount = filteredRelations.filter((row) => row.inviterUserId === inviter.inviterUserId).length
  }

  const useDefaultTopInviters = !search && status === "all" && datePreset === "all" && !customDate
  const baseTopInviters =
    filteredRelations.length > 0
      ? Array.from(topInvitersMap.values())
      : useDefaultTopInviters
        ? topInviters
        : []
  const mergedTopInviters = new Map<string, MarketTopInviterPoint>()

  for (const row of baseTopInviters) {
    mergedTopInviters.set(row.inviterUserId, { ...row })
  }

  for (const row of invitationTopInviters) {
    const current = mergedTopInviters.get(row.inviterUserId)
    if (!current) {
      mergedTopInviters.set(row.inviterUserId, {
        inviterUserId: row.inviterUserId,
        inviterEmail: row.inviterEmail,
        referralCode: row.referralCode,
        clickCount: row.clickCount,
        invitedCount: row.invitedCount,
        activatedCount: row.activatedCount,
        rewardCredits: row.rewardCredits,
      })
      continue
    }

    current.inviterEmail = current.inviterEmail || row.inviterEmail
    current.referralCode = current.referralCode || row.referralCode
    current.clickCount += row.clickCount
    current.invitedCount += row.invitedCount
    current.activatedCount += row.activatedCount
    current.rewardCredits += row.rewardCredits
  }

  const sortedTopInviters = sortTopInviters(Array.from(mergedTopInviters.values())).slice(0, 8)

  const pagedRelations = paginateRows(filteredRelations, page, limit)
  const pagedRewards = paginateRows(filteredRewards, page, limit)

  return {
    overview: filteredOverview,
    trends,
    channels,
    topInviters: sortedTopInviters,
    relations: pagedRelations,
    rewards: pagedRewards,
    statuses: Array.from(new Set(relationList.rows.map((item) => safeString(item.status)).filter(Boolean))),
    filters: {
      search,
      status,
      datePreset,
      date: customDate,
    },
  }
}

export async function simulateMarketingEvent(input: MarketingSimulationInput): Promise<MarketingSimulationResult> {
  await ensureAllUserAssetAccounts()

  const eventLog: MarketingEventLog = {
    id: randomUUID(),
    product: input.product,
    eventType: input.eventType,
    userId: safeString(input.userId),
    occurredAt: safeString(input.occurredAt, nowIso()),
    source: input.source || null,
    deviceFingerprint: input.deviceFingerprint || null,
    ipHash: input.ipHash || null,
    payload: input.payload || {},
    status: "pending",
    processedAt: null,
    resultSummary: {},
    createdAt: nowIso(),
  }

  await insertRow(MARKETING_EVENTS_COLLECTION, toEventRow(eventLog))

  if (eventLog.eventType === "user.login") {
    await touchUserLogin(eventLog.userId, eventLog.occurredAt)
  }

  const activeTemplates = (await listTaskTemplatesRaw()).filter(
    (item) => item.status === "active" && item.eventType === eventLog.eventType && item.products.includes(eventLog.product),
  )

  const riskEvents = await detectRiskEvents(eventLog)
  const updatedTasks: MarketingUserTask[] = []
  const rewardedLedgers: MarketingAssetLedger[] = []
  const touchedUsers = new Set<string>([eventLog.userId])

  for (const template of activeTemplates) {
    const recipientIds = resolveRewardUsers(template, eventLog)
    for (const recipientId of recipientIds) {
      if (!recipientId) continue
      touchedUsers.add(recipientId)
      const currentTask = await findUserTask(recipientId, template)
      const evaluated = evaluateTaskProgress(template, currentTask, eventLog)
      const savedTask = await upsertUserTask(evaluated.task)
      updatedTasks.push(savedTask)

      if (evaluated.completionsAwarded > 0) {
        const freezeReward = shouldFreezeReward(template, riskEvents, recipientId)
        for (let index = 0; index < evaluated.completionsAwarded; index += 1) {
          const ledger = await createLedger({
            userId: recipientId,
            assetType: template.rewardAsset,
            direction: "credit",
            amount: template.rewardAmount,
            sourceType: "task_reward",
            sourceId: `${eventLog.id}:${template.slug}:${index + 1}`,
            eventType: eventLog.eventType,
            remark: `${template.name} reward`,
            status: freezeReward ? "frozen" : "available",
            meta: {
              campaignSlug: template.campaignSlug,
              templateSlug: template.slug,
              frozenByRiskCodes: freezeReward
                ? riskEvents
                    .filter((event) => !event.userId || event.userId === recipientId)
                    .map((event) => event.riskCode)
                : [],
            },
            createdAt: eventLog.occurredAt,
          })
          rewardedLedgers.push(ledger)
        }
      }
    }
  }

  const processedEvent: MarketingEventLog = {
    ...eventLog,
    status: riskEvents.length > 0 && rewardedLedgers.every((item) => item.status === "frozen") ? "risk_blocked" : "processed",
    processedAt: nowIso(),
    resultSummary: {
      templateCount: activeTemplates.length,
      rewardedLedgerIds: rewardedLedgers.map((item) => item.id),
      updatedTaskIds: updatedTasks.map((item) => item.id),
      riskEventIds: riskEvents.map((item) => item.id),
      touchedUsers: Array.from(touchedUsers),
    },
  }

  await updateRow(MARKETING_EVENTS_COLLECTION, { id: processedEvent.id }, toEventRow(processedEvent))

  return {
    eventLog: processedEvent,
    touchedUsers: Array.from(touchedUsers),
    rewardedLedgers,
    riskEvents,
    updatedTasks,
  }
}

export async function getMarketingBootstrapData() {
  await ensureAllUserAssetAccounts()

  const emptyReferralCompatibility: Awaited<ReturnType<typeof getMarketingReferralCompatibility>> = {
    overview: {
      totalClicks: 0,
      totalInvites: 0,
      totalActivated: 0,
      totalRewardCredits: 0,
      signupRewardCredits: 0,
      firstUseRewardCredits: 0,
      conversionRate: 0,
      activationRate: 0,
      usersWithReferralCode: 0,
    },
    topInviters: [],
    relations: { page: 1, limit: 10, total: 0, rows: [] },
  }
  const emptyAdInventory: Awaited<ReturnType<typeof getMarketingAdInventorySummary>> = {
    inventory: {
      total: 0,
      active: 0,
      positions: [],
      totalImpressions: 0,
      totalClicks: 0,
    },
    templates: [],
    advertisements: [],
  }
  const emptyTrends: MarketTrendPoint[] = []

  const [
    overview,
    settings,
    campaigns,
    taskTemplates,
    accounts,
    recentLedgers,
    withdrawals,
    riskEvents,
    riskLists,
    reports,
    invitationCodes,
    coupons,
    adInventory,
    referralCompatibility,
    trends,
  ] = await Promise.all([
    getMarketingOverview(),
    listMarketingSettings(),
    listMarketingCampaigns(),
    listMarketingTaskTemplates(),
    listMarketingAssetAccounts({ page: 1, limit: 12 }),
    listMarketingAssetLedgers({ page: 1, limit: 20 }),
    listMarketingWithdrawals({ page: 1, limit: 20 }),
    listMarketingRiskEvents({ page: 1, limit: 20 }),
    listMarketingRiskLists({ page: 1, limit: 20 }),
    getMarketingReports(),
    listInvitationCodesRaw(),
    listCouponsRaw(),
    withTimeout(getMarketingAdInventorySummary(), 4_000, emptyAdInventory),
    withTimeout(getMarketingReferralCompatibility(), 4_000, emptyReferralCompatibility),
    withTimeout(getMarketAdminTrends({ days: 7 }), 4_000, emptyTrends),
  ])

  const allLedgers = await listLedgersRaw()
  const todayKey = new Date().toISOString().slice(0, 10)
  const todayLedgers = allLedgers.filter((item) => toDateKey(item.createdAt) === todayKey && item.direction === "credit")
  const latestTrend = [...trends].sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  const dashboardSummary: MarketingDashboardSummary = {
    today: {
      newUsers: latestTrend?.invites || 0,
      cashIssued: Number(todayLedgers.filter((item) => item.assetType === "cash").reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
      pointsIssued: Number(todayLedgers.filter((item) => item.assetType === "points").reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
      pendingWithdrawalCount: overview.pendingWithdrawals.count,
      pendingWithdrawalAmount: Number(overview.pendingWithdrawals.amount.toFixed(2)),
      riskHits: overview.riskSummary.openCount + overview.riskSummary.frozenCount,
      activeCampaigns: overview.campaignSummary.active,
    },
    trends,
    funnel: {
      totalClicks: referralCompatibility.overview.totalClicks,
      totalInvites: referralCompatibility.overview.totalInvites,
      totalActivated: referralCompatibility.overview.totalActivated,
      totalRewardCredits: referralCompatibility.overview.totalRewardCredits,
      conversionRate: referralCompatibility.overview.conversionRate,
      activationRate: referralCompatibility.overview.activationRate,
    },
    dailyRoi: buildDailyRoiRows(allLedgers, trends),
  }

  return {
    overview,
    settings,
    campaigns,
    taskTemplates,
    accounts,
    ledgers: recentLedgers,
    withdrawals,
    riskEvents,
    riskLists,
    reports,
    invitationCodes,
    coupons,
    adInventory,
    referralCompatibility,
    dashboardSummary,
    constants: {
      assetTypes: ASSET_TYPES,
      products: ["orbitchat", "ai", "ecommerce"] as MarketingProduct[],
      eventTypes: [
        "user.login",
        "referral.registered",
        "referral.activated",
        "ad.completed",
        "order.paid",
        "subscription.upgraded",
        "ai.quota.exhausted",
      ] as MarketingEventType[],
    },
  }
}

export async function getMarketingInvitationCodes() {
  return listInvitationCodesRaw()
}

export async function upsertMarketingInvitationCode(item: Partial<MarketingInvitationCode>) {
  const existing = item.id ? await findRow(MARKETING_INVITATION_CODES_COLLECTION, { id: item.id }) : null
  const current = existing ? mapInvitationCodeRow(existing) : null
  const nextUserId = item.userId === undefined ? current?.userId || "" : safeString(item.userId)

  if (nextUserId) {
    await assertMarketingUserExists(nextUserId)
  }

  const next: MarketingInvitationCode = {
    id: current?.id || item.id || randomUUID(),
    code: item.code || current?.code || "",
    userId: nextUserId,
    campaignSlug: item.campaignSlug === undefined ? current?.campaignSlug || null : item.campaignSlug,
    partnerTier: normalizePartnerTier(item.partnerTier || current?.partnerTier || "general"),
    partnerProduct: item.partnerProduct === undefined ? current?.partnerProduct || null : item.partnerProduct,
    productCost: item.productCost ?? current?.productCost ?? 0,
    partnerBenefitMonths: item.partnerBenefitMonths ?? current?.partnerBenefitMonths ?? 0,
    fanDiscountRate: item.fanDiscountRate ?? current?.fanDiscountRate ?? 0,
    orderCommissionRate: item.orderCommissionRate ?? current?.orderCommissionRate ?? 0,
    maxUses: item.maxUses === undefined ? current?.maxUses || null : item.maxUses,
    usedCount: item.usedCount ?? current?.usedCount ?? 0,
    status: item.status || current?.status || "active",
    expiresAt: item.expiresAt === undefined ? current?.expiresAt || null : item.expiresAt,
    createdAt: current?.createdAt || nowIso(),
    updatedAt: nowIso(),
  }

  if (current) {
    await updateRow(MARKETING_INVITATION_CODES_COLLECTION, { id: next.id }, toInvitationCodeRow(next))
  } else {
    await insertRow(MARKETING_INVITATION_CODES_COLLECTION, toInvitationCodeRow(next))
  }
  return next
}

export async function deleteMarketingInvitationCode(id: string) {
  return deleteRow(MARKETING_INVITATION_CODES_COLLECTION, { id })
}

export async function getMarketingCoupons() {
  return listCouponsRaw()
}

export async function getMarketingCouponByCode(code: string) {
  const normalizedCode = safeString(code).toUpperCase()
  if (!normalizedCode) return null

  const coupons = await listCouponsRaw()
  return coupons.find((item) => safeString(item.code).toUpperCase() === normalizedCode) || null
}

export async function markMarketingCouponUsed(input: {
  id: string
  orderNo: string
  userId: string
  usedAt?: string | null
}) {
  const id = safeString(input.id)
  const orderNo = safeString(input.orderNo)
  const userId = safeString(input.userId)

  if (!id || !orderNo || !userId) {
    return { updated: false as const, reason: "missing_required_fields" as const }
  }

  const existing = await findRow(MARKETING_COUPONS_COLLECTION, { id })
  if (!existing) {
    return { updated: false as const, reason: "not_found" as const }
  }

  const current = mapCouponRow(existing)

  if (current.usedOrderNo && current.usedOrderNo === orderNo) {
    return { updated: true as const, reason: "already_marked" as const, coupon: current }
  }

  if (current.userId && current.userId !== userId) {
    return { updated: false as const, reason: "user_mismatch" as const, coupon: current }
  }

  const isExpired = current.expiresAt ? new Date(current.expiresAt) < new Date() : false
  if (current.status === "revoked") {
    return { updated: false as const, reason: "revoked" as const, coupon: current }
  }

  if (current.status === "expired" || isExpired) {
    const expiredCoupon =
      current.status === "expired"
        ? current
        : {
            ...current,
            status: "expired" as const,
            updatedAt: nowIso(),
          }

    if (expiredCoupon !== current) {
      await updateRow(MARKETING_COUPONS_COLLECTION, { id }, toCouponRow(expiredCoupon))
    }

    return { updated: false as const, reason: "expired" as const, coupon: expiredCoupon }
  }

  const maxUses = current.maxUses
  const usedCount = getCouponUsedCountValue(current.usedCount, current.status)
  if (maxUses !== null && usedCount >= maxUses) {
    return { updated: false as const, reason: "exhausted" as const, coupon: current }
  }

  const nextUsedCount = maxUses === null ? usedCount + 1 : Math.min(maxUses, usedCount + 1)
  const next: MarketingCoupon = {
    ...current,
    usedCount: nextUsedCount,
    usedByUserId: userId,
    usedOrderNo: orderNo,
    usedAt: safeString(input.usedAt, nowIso()),
    status: maxUses !== null && nextUsedCount >= maxUses ? "used" : "available",
    updatedAt: nowIso(),
  }

  await updateRow(MARKETING_COUPONS_COLLECTION, { id }, toCouponRow(next))

  return { updated: true as const, reason: "marked_used" as const, coupon: next }
}

export async function upsertMarketingCoupon(item: Partial<MarketingCoupon>) {
  const existing = item.id ? await findRow(MARKETING_COUPONS_COLLECTION, { id: item.id }) : null
  const current = existing ? mapCouponRow(existing) : null
  const nextUserId = item.userId === undefined ? current?.userId || "" : safeString(item.userId)
  const nextPartnerUserId =
    item.partnerUserId === undefined
      ? current?.partnerUserId || null
      : safeString(item.partnerUserId) || null

  if (nextUserId) {
    await assertMarketingUserExists(nextUserId)
  }
  if (nextPartnerUserId) {
    await assertMarketingUserExists(nextPartnerUserId)
  }

  const nextMaxUses =
    item.maxUses === undefined
      ? current?.maxUses ?? 1
      : item.maxUses === null
        ? null
        : normalizeCouponMaxUses(item.maxUses, current?.maxUses ?? 1)
  const nextUsedCount = normalizeCouponUsedCount(item.usedCount, current?.usedCount ?? 0)

  if (nextMaxUses !== null && nextUsedCount > nextMaxUses) {
    throw new Error(`Used count cannot exceed max uses (${nextMaxUses}).`)
  }

  const shouldClearUsageMeta = nextUsedCount <= 0
  const requestedStatus = item.status
  const nextExpiresAt = item.expiresAt === undefined ? current?.expiresAt || null : item.expiresAt
  const nextStatus = resolveMarketingCouponStatus({
    requestedStatus,
    currentStatus: current?.status,
    expiresAt: nextExpiresAt,
    maxUses: nextMaxUses,
    usedCount: nextUsedCount,
  })

  const next: MarketingCoupon = {
    id: current?.id || item.id || randomUUID(),
    code: item.code || current?.code || "",
    userId: nextUserId,
    partnerUserId: nextPartnerUserId,
    assetType: item.assetType || current?.assetType || "points",
    audienceType: normalizeAudienceType(item.audienceType || current?.audienceType || "general"),
    partnerProduct: item.partnerProduct === undefined ? current?.partnerProduct || null : item.partnerProduct,
    productCost: item.productCost ?? current?.productCost ?? 0,
    sourceInvitationCode: item.sourceInvitationCode === undefined ? current?.sourceInvitationCode || null : item.sourceInvitationCode,
    orderCommissionRate: item.orderCommissionRate ?? current?.orderCommissionRate ?? 0,
    purchasePrice: item.purchasePrice ?? current?.purchasePrice ?? 0,
    discountValue: item.discountValue ?? current?.discountValue ?? 0,
    discountType: item.discountType || current?.discountType || "fixed",
    minPurchase: item.minPurchase ?? current?.minPurchase ?? 0,
    maxUses: nextMaxUses,
    usedCount: nextUsedCount,
    usedByUserId:
      item.usedByUserId === undefined
        ? shouldClearUsageMeta
          ? null
          : current?.usedByUserId || null
        : safeString(item.usedByUserId) || null,
    usedOrderNo:
      item.usedOrderNo === undefined
        ? shouldClearUsageMeta
          ? null
          : current?.usedOrderNo || null
        : safeString(item.usedOrderNo) || null,
    usedAt:
      item.usedAt === undefined
        ? shouldClearUsageMeta
          ? null
          : current?.usedAt || null
        : safeString(item.usedAt) || null,
    status: nextStatus,
    expiresAt: nextExpiresAt,
    createdAt: current?.createdAt || nowIso(),
    updatedAt: nowIso(),
  }

  if (current) {
    await updateRow(MARKETING_COUPONS_COLLECTION, { id: next.id }, toCouponRow(next))
  } else {
    await insertRow(MARKETING_COUPONS_COLLECTION, toCouponRow(next))
  }
  return next
}

export async function deleteMarketingCoupon(id: string) {
  return deleteRow(MARKETING_COUPONS_COLLECTION, { id })
}
