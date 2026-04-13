import { randomUUID } from "crypto"
import { getDatabase } from "@/lib/database/cloudbase-service"
import { resolveDeploymentRegion } from "@/lib/config/deployment-region"
import { getSupabaseAdminForDownloads } from "@/lib/downloads/supabase-admin"
import multichannelRulesJson from "@/config/market/acquisition-multichannel-rules.example.json"
import { upsertMarketingCoupon, upsertMarketingInvitationCode } from "./marketing"
import type { CrawlerLead, CrawlerLeadContact, CrawlerRunInput } from "./acquisition-distribution-types"
import type {
  AcquisitionContactProfile,
  AcquisitionCrawlerPersistResult,
  AcquisitionCrawlerRun,
  AcquisitionCrawlerRunSummary,
  AcquisitionCrawlerTask,
  AcquisitionEventLog,
  AcquisitionLeadRecord,
  AcquisitionLeadSummary,
  AcquisitionMultichannelRulesConfig,
  AcquisitionOfferPackage,
  AcquisitionOpsBootstrap,
  AcquisitionOrganizationProfile,
  AcquisitionPartnerType,
  AcquisitionPartnershipActivationResult,
  AcquisitionPartnershipRecord,
  AcquisitionPartnershipSummary,
  AcquisitionReplyEvent,
  AcquisitionReplyEventSummary,
  AcquisitionReplyInsightInput,
  AcquisitionReplyPersistResult,
  AcquisitionRuleSet,
  AcquisitionTrackingAsset,
} from "./acquisition-multichannel-types"
import type { MarketingCoupon, MarketingInvitationCode } from "./marketing-types"

type RawRow = Record<string, any>
type DistributionLeadSegment = CrawlerLead["segment"]

const RULES_TABLE = "acquisition_rule_sets"
const ORGANIZATIONS_TABLE = "acquisition_organizations"
const CONTACTS_TABLE = "acquisition_contacts"
const LEADS_TABLE = "acquisition_leads"
const CRAWLER_TASKS_TABLE = "acquisition_crawler_tasks"
const CRAWLER_RUNS_TABLE = "acquisition_crawler_runs"
const REPLY_EVENTS_TABLE = "acquisition_reply_events"
const OFFER_PACKAGES_TABLE = "acquisition_offer_packages"
const PARTNERSHIPS_TABLE = "acquisition_partnerships"
const TRACKING_ASSETS_TABLE = "acquisition_tracking_assets"
const EVENT_LOGS_TABLE = "acquisition_event_logs"

const ALL_COLLECTIONS = [
  RULES_TABLE,
  ORGANIZATIONS_TABLE,
  CONTACTS_TABLE,
  LEADS_TABLE,
  CRAWLER_TASKS_TABLE,
  CRAWLER_RUNS_TABLE,
  REPLY_EVENTS_TABLE,
  OFFER_PACKAGES_TABLE,
  PARTNERSHIPS_TABLE,
  TRACKING_ASSETS_TABLE,
  EVENT_LOGS_TABLE,
] as const

const DEFAULT_RULE_SET_ID = "acquisition-rules-default-v1"
const DEFAULT_RULE_SET_KEY = "default-acquisition-rules"
const DEFAULT_CAMPAIGN_PRODUCT = "ai"
const SUPABASE_MIGRATION_HINT = "Apply supabase/migrations/20260405000000_add_acquisition_multichannel_ops.sql for the INTL stack."
const PARTNERSHIP_STATUS_ORDER: AcquisitionPartnershipRecord["status"][] = [
  "prospecting",
  "qualified",
  "proposal_sent",
  "negotiating",
  "contract_signed",
  "active",
  "paused",
  "closed",
]

const RULES_CONFIG = multichannelRulesJson as AcquisitionMultichannelRulesConfig

let ensureSeedPromise: Promise<void> | null = null

function nowIso() {
  return new Date().toISOString()
}

function safeString(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim()
  return normalized || fallback
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function safeBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => safeString(item)).filter(Boolean) : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function toNumberRecord(value: unknown): Record<string, number> {
  const record = asRecord(value)
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, raw]) => [key, safeNumber(raw, Number.NaN)])
      .filter((entry) => Number.isFinite(entry[1])),
  )
}

function getRegion() {
  return resolveDeploymentRegion() === "INTL" ? "INTL" : "CN"
}

function getStorageBackend() {
  return getRegion() === "INTL" ? "supabase" : "cloudbase"
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

function isSupabaseMissingRelation(error: unknown) {
  const message = String((error as any)?.message || error || "")
  return (
    /relation .* does not exist/i.test(message) ||
    /Could not find the table/i.test(message) ||
    /schema cache/i.test(message) ||
    message.includes('Supabase table "')
  )
}

function withSupabaseTableHint(table: string, error: unknown) {
  if (isSupabaseMissingRelation(error)) {
    return new Error(`Supabase table "${table}" is missing. ${SUPABASE_MIGRATION_HINT}`)
  }
  return error instanceof Error ? error : new Error(String(error || `Failed to access ${table}`))
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

async function findCloudbaseRow(collection: string, filters: RawRow): Promise<RawRow | null> {
  const rows = await loadCloudbaseRows(collection)
  return rows.find((row) => Object.entries(filters).every(([key, value]) => row?.[key] === value)) || null
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
  const target = rows.find((row) => Object.entries(filters).every(([key, value]) => row?.[key] === value))
  if (!target?._id) return null
  await db.collection(collection).doc(target._id).update(patch)
  return { ...target, ...patch }
}

async function loadSupabaseRows(table: string): Promise<RawRow[]> {
  const supabase = getSupabaseAdminForDownloads()
  const { data, error } = await supabase.from(table).select("*")
  if (error) {
    if (isSupabaseMissingRelation(error)) return []
    throw withSupabaseTableHint(table, error)
  }
  return Array.isArray(data) ? data : []
}

async function findSupabaseRow(table: string, filters: RawRow): Promise<RawRow | null> {
  const supabase = getSupabaseAdminForDownloads()
  let query = supabase.from(table).select("*")
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value)
  }
  const { data, error } = await query.maybeSingle()
  if (error) {
    if (isSupabaseMissingRelation(error)) return null
    throw withSupabaseTableHint(table, error)
  }
  return data || null
}

async function insertSupabaseRow(table: string, row: RawRow): Promise<RawRow> {
  const supabase = getSupabaseAdminForDownloads()
  const { data, error } = await supabase.from(table).insert(row).select("*").maybeSingle()
  if (error || !data) throw withSupabaseTableHint(table, error || `Failed to insert ${table}`)
  return data
}

async function updateSupabaseRow(table: string, filters: RawRow, patch: RawRow): Promise<RawRow | null> {
  const supabase = getSupabaseAdminForDownloads()
  let query = supabase.from(table).update(patch).select("*")
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value)
  }
  const { data, error } = await query.maybeSingle()
  if (error) throw withSupabaseTableHint(table, error)
  return data || null
}

async function loadRows(table: string) {
  return getRegion() === "INTL" ? loadSupabaseRows(table) : loadCloudbaseRows(table)
}

async function findRow(table: string, filters: RawRow) {
  return getRegion() === "INTL" ? findSupabaseRow(table, filters) : findCloudbaseRow(table, filters)
}

async function insertRow(table: string, row: RawRow) {
  return getRegion() === "INTL" ? insertSupabaseRow(table, row) : insertCloudbaseRow(table, row)
}

async function updateRow(table: string, filters: RawRow, patch: RawRow) {
  return getRegion() === "INTL" ? updateSupabaseRow(table, filters, patch) : updateCloudbaseRow(table, filters, patch)
}

function slugify(value: string, fallback = "item") {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || fallback
}

function createInviteCode(seed?: string) {
  const prefix = (seed || "invite")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12) || "INVITE"
  const stamp = Date.now().toString(36).slice(-4).toUpperCase()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${prefix}-${stamp}${random}`
}

function createCouponCode(seed?: string) {
  const prefix = (seed || "coupon")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 10) || "COUPON"
  const stamp = Date.now().toString(36).slice(-4).toUpperCase()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${prefix}-${stamp}${random}`
}

function buildMarketingInviteShareUrl(input: {
  code: string
  campaignSlug?: string | null
  product?: string | null
  tier?: string | null
  couponCode?: string | null
  origin?: string | null
}) {
  const code = safeString(input.code).toUpperCase()
  const params = new URLSearchParams()
  if (input.campaignSlug) params.set("campaign", input.campaignSlug)
  if (input.product) params.set("product", input.product)
  if (input.tier) params.set("tier", input.tier)
  if (input.couponCode) params.set("coupon", input.couponCode)

  const relative = `/invite/${encodeURIComponent(code)}${params.size ? `?${params.toString()}` : ""}`
  const origin = safeString(input.origin).replace(/\/+$/, "")
  return origin ? `${origin}${relative}` : relative
}

function resolveCrawlerProvider(): AcquisitionCrawlerTask["provider"] {
  const provider = safeString(process.env.MARKET_LEAD_SOURCE_PROVIDER).toLowerCase()
  if (provider === "tavily" || provider === "serper" || provider === "webhook") return provider
  return "file"
}

function parseScaledNumber(value: string) {
  const normalized = value.toLowerCase().replace(/,/g, "")
  const match = normalized.match(/(\d+(?:\.\d+)?)(k|m|w|万)?/)
  if (!match) return null
  const base = Number(match[1])
  if (!Number.isFinite(base)) return null
  const unit = match[2]
  if (unit === "m") return Math.round(base * 1_000_000)
  if (unit === "k") return Math.round(base * 1_000)
  if (unit === "w" || unit === "万") return Math.round(base * 10_000)
  return Math.round(base)
}

function parseAudienceRange(value: string) {
  const normalized = safeString(value)
  const parts = normalized.split(/[-~–—]/).map((item) => parseScaledNumber(item)).filter((item): item is number => item !== null)
  if (parts.length >= 2) {
    return {
      followerMin: Math.min(parts[0], parts[1]),
      followerMax: Math.max(parts[0], parts[1]),
      estimatedAudienceSize: Math.max(parts[0], parts[1]),
    }
  }
  const single = parseScaledNumber(normalized)
  return {
    followerMin: single,
    followerMax: single,
    estimatedAudienceSize: single,
  }
}

function toPartnerType(segment: DistributionLeadSegment): AcquisitionPartnerType {
  if (segment === "blogger") return "blogger"
  if (segment === "vc") return "vc"
  return "enterprise"
}

function deriveDiscoveryLeadStatus(fitScore: number): AcquisitionLeadRecord["status"] {
  if (fitScore >= 80) return "qualified"
  if (fitScore >= 60) return "reviewing"
  return "new"
}

function deriveLeadStatusFromReply(disposition: AcquisitionReplyInsightInput["disposition"]): AcquisitionLeadRecord["status"] {
  if (disposition === "negative") return "closed_lost"
  if (disposition === "negotiating") return "negotiating"
  if (disposition === "positive" || disposition === "needs_info" || disposition === "manual_review") return "replied"
  return "reviewing"
}

function derivePartnershipStatus(disposition: AcquisitionReplyInsightInput["disposition"]): AcquisitionPartnershipRecord["status"] {
  if (disposition === "negative") return "closed"
  if (disposition === "negotiating") return "negotiating"
  if (disposition === "needs_info") return "proposal_sent"
  if (disposition === "positive") return "qualified"
  return "prospecting"
}

function deriveSentimentScore(disposition: AcquisitionReplyInsightInput["disposition"]) {
  if (disposition === "positive") return 0.92
  if (disposition === "needs_info") return 0.64
  if (disposition === "negotiating") return 0.48
  if (disposition === "negative") return -0.94
  return 0
}

function pickPartnershipStatus(current: AcquisitionPartnershipRecord["status"] | null, next: AcquisitionPartnershipRecord["status"]) {
  if (!current) return next
  const currentIndex = PARTNERSHIP_STATUS_ORDER.indexOf(current)
  const nextIndex = PARTNERSHIP_STATUS_ORDER.indexOf(next)
  if (current === "closed" || current === "active" || current === "contract_signed") return current
  if (currentIndex === -1 || nextIndex === -1) return next
  return nextIndex > currentIndex ? next : current
}

function resolveMarket(region: string) {
  const normalized = safeString(region).toUpperCase()
  if (normalized === "CN" || normalized.includes("CHINA")) return "CN"
  if (normalized === "INTL" || normalized === "US" || normalized.includes("USA")) return "US"
  if (normalized === "GLOBAL") return "GLOBAL"
  return normalized || "GLOBAL"
}

function getRuntimeCrawlerTemplateKey(targetType: CrawlerRunInput["targetType"]) {
  if (targetType === "blogger") return "blogger"
  if (targetType === "vc") return "vc"
  return "enterprise"
}

function getCrawlerTemplateConfig(targetType: CrawlerRunInput["targetType"]) {
  return RULES_CONFIG.crawlerTasks[getRuntimeCrawlerTemplateKey(targetType)]
}

function toRuleSetRow(item: AcquisitionRuleSet): RawRow {
  return {
    id: item.id,
    key: item.key,
    version: item.version,
    scope: item.scope,
    enabled: item.enabled,
    config: item.config,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapRuleSetRow(row: RawRow): AcquisitionRuleSet {
  return {
    id: safeString(row?.id || row?._id),
    key: safeString(row?.key),
    version: safeNumber(row?.version, 1),
    scope: (safeString(row?.scope) || "global") as AcquisitionRuleSet["scope"],
    enabled: safeBoolean(row?.enabled, true),
    config: asRecord(row?.config),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function toOrganizationRow(item: AcquisitionOrganizationProfile): RawRow {
  return {
    id: item.id,
    partner_type: item.partnerType,
    name: item.name,
    legal_name: item.legalName,
    region: item.region,
    market: item.market,
    primary_platform: item.primaryPlatform,
    domain: item.domain,
    tags: item.tags,
    follower_min: item.followerMin,
    follower_max: item.followerMax,
    estimated_audience_size: item.estimatedAudienceSize,
    demand_summary: item.demandSummary,
    lead_score: item.leadScore,
    source_type: item.sourceType,
    source_url: item.sourceUrl,
    source_label: item.sourceLabel,
    status: item.status,
    owner_user_id: item.ownerUserId,
    meta: item.meta,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapOrganizationRow(row: RawRow): AcquisitionOrganizationProfile {
  return {
    id: safeString(row?.id || row?._id),
    partnerType: (safeString(row?.partner_type) || "enterprise") as AcquisitionOrganizationProfile["partnerType"],
    name: safeString(row?.name),
    legalName: row?.legal_name ? safeString(row.legal_name) : null,
    region: safeString(row?.region),
    market: safeString(row?.market),
    primaryPlatform: row?.primary_platform ? safeString(row.primary_platform) : null,
    domain: row?.domain ? safeString(row.domain) : null,
    tags: asStringArray(row?.tags),
    followerMin: row?.follower_min === null || row?.follower_min === undefined ? null : safeNumber(row.follower_min, 0),
    followerMax: row?.follower_max === null || row?.follower_max === undefined ? null : safeNumber(row.follower_max, 0),
    estimatedAudienceSize:
      row?.estimated_audience_size === null || row?.estimated_audience_size === undefined ? null : safeNumber(row.estimated_audience_size, 0),
    demandSummary: row?.demand_summary ? safeString(row.demand_summary) : null,
    leadScore: safeNumber(row?.lead_score, 0),
    sourceType: (safeString(row?.source_type) || "crawler") as AcquisitionOrganizationProfile["sourceType"],
    sourceUrl: row?.source_url ? safeString(row.source_url) : null,
    sourceLabel: row?.source_label ? safeString(row.source_label) : null,
    status: (safeString(row?.status) || "new") as AcquisitionOrganizationProfile["status"],
    ownerUserId: row?.owner_user_id ? safeString(row.owner_user_id) : null,
    meta: asRecord(row?.meta),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function toContactRow(item: AcquisitionContactProfile): RawRow {
  return {
    id: item.id,
    organization_id: item.organizationId,
    name: item.name,
    role: item.role,
    channel: item.channel,
    value: item.value,
    is_primary: item.isPrimary,
    is_public_contact: item.isPublicContact,
    verification_status: item.verificationStatus,
    locale: item.locale,
    timezone: item.timezone,
    meta: item.meta,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapContactRow(row: RawRow): AcquisitionContactProfile {
  return {
    id: safeString(row?.id || row?._id),
    organizationId: safeString(row?.organization_id),
    name: safeString(row?.name),
    role: row?.role ? safeString(row.role) : null,
    channel: (safeString(row?.channel) || "email") as AcquisitionContactProfile["channel"],
    value: safeString(row?.value),
    isPrimary: safeBoolean(row?.is_primary, false),
    isPublicContact: safeBoolean(row?.is_public_contact, true),
    verificationStatus: (safeString(row?.verification_status) || "unverified") as AcquisitionContactProfile["verificationStatus"],
    locale: row?.locale ? safeString(row.locale) : null,
    timezone: row?.timezone ? safeString(row.timezone) : null,
    meta: asRecord(row?.meta),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function toLeadRow(item: AcquisitionLeadRecord): RawRow {
  return {
    id: item.id,
    organization_id: item.organizationId,
    contact_id: item.contactId,
    pipeline: item.pipeline,
    source_type: item.sourceType,
    source_task_id: item.sourceTaskId,
    source_run_id: item.sourceRunId,
    source_document_url: item.sourceDocumentUrl,
    qualification_reason: item.qualificationReason,
    fit_score: item.fitScore,
    priority_score: item.priorityScore,
    status: item.status,
    next_action_at: item.nextActionAt,
    last_contacted_at: item.lastContactedAt,
    last_replied_at: item.lastRepliedAt,
    meta: item.meta,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapLeadRow(row: RawRow): AcquisitionLeadRecord {
  return {
    id: safeString(row?.id || row?._id),
    organizationId: safeString(row?.organization_id),
    contactId: row?.contact_id ? safeString(row.contact_id) : null,
    pipeline: (safeString(row?.pipeline) || "enterprise") as AcquisitionLeadRecord["pipeline"],
    sourceType: (safeString(row?.source_type) || "crawler") as AcquisitionLeadRecord["sourceType"],
    sourceTaskId: row?.source_task_id ? safeString(row.source_task_id) : null,
    sourceRunId: row?.source_run_id ? safeString(row.source_run_id) : null,
    sourceDocumentUrl: row?.source_document_url ? safeString(row.source_document_url) : null,
    qualificationReason: row?.qualification_reason ? safeString(row.qualification_reason) : null,
    fitScore: safeNumber(row?.fit_score, 0),
    priorityScore: safeNumber(row?.priority_score, 0),
    status: (safeString(row?.status) || "new") as AcquisitionLeadRecord["status"],
    nextActionAt: row?.next_action_at ? safeString(row.next_action_at) : null,
    lastContactedAt: row?.last_contacted_at ? safeString(row.last_contacted_at) : null,
    lastRepliedAt: row?.last_replied_at ? safeString(row.last_replied_at) : null,
    meta: asRecord(row?.meta),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function toCrawlerTaskRow(item: AcquisitionCrawlerTask): RawRow {
  return {
    id: item.id,
    name: item.name,
    target_type: item.targetType,
    status: item.status,
    provider: item.provider,
    target_sites: item.targetSites,
    selectors: item.selectors,
    region: item.region,
    locale: item.locale,
    keyword_query: item.keywordQuery,
    frequency_minutes: item.frequencyMinutes,
    max_results_per_run: item.maxResultsPerRun,
    dedupe_key: item.dedupeKey,
    public_contact_only: item.publicContactOnly,
    config: item.config,
    last_run_at: item.lastRunAt,
    next_run_at: item.nextRunAt,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapCrawlerTaskRow(row: RawRow): AcquisitionCrawlerTask {
  return {
    id: safeString(row?.id || row?._id),
    name: safeString(row?.name),
    targetType: (safeString(row?.target_type) || "enterprise") as AcquisitionCrawlerTask["targetType"],
    status: (safeString(row?.status) || "draft") as AcquisitionCrawlerTask["status"],
    provider: (safeString(row?.provider) || "file") as AcquisitionCrawlerTask["provider"],
    targetSites: asStringArray(row?.target_sites),
    selectors: Array.isArray(row?.selectors)
      ? row.selectors
          .map((item: RawRow) => ({
            field: safeString(item?.field),
            selector: safeString(item?.selector),
            attr: item?.attr ? safeString(item.attr) : null,
          }))
          .filter((item: AcquisitionCrawlerTask["selectors"][number]) => item.field && item.selector)
      : [],
    region: safeString(row?.region),
    locale: safeString(row?.locale, "en"),
    keywordQuery: safeString(row?.keyword_query),
    frequencyMinutes: safeNumber(row?.frequency_minutes, 1440),
    maxResultsPerRun: safeNumber(row?.max_results_per_run, 100),
    dedupeKey: asStringArray(row?.dedupe_key),
    publicContactOnly: safeBoolean(row?.public_contact_only, true),
    config: asRecord(row?.config),
    lastRunAt: row?.last_run_at ? safeString(row.last_run_at) : null,
    nextRunAt: row?.next_run_at ? safeString(row.next_run_at) : null,
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function toCrawlerRunRow(item: AcquisitionCrawlerRun): RawRow {
  return {
    id: item.id,
    task_id: item.taskId,
    status: item.status,
    started_at: item.startedAt,
    finished_at: item.finishedAt,
    fetched_documents: item.fetchedDocuments,
    extracted_leads: item.extractedLeads,
    qualified_leads: item.qualifiedLeads,
    failed_documents: item.failedDocuments,
    error_message: item.errorMessage,
    metrics: item.metrics,
    meta: item.meta,
  }
}

function mapCrawlerRunRow(row: RawRow): AcquisitionCrawlerRun {
  return {
    id: safeString(row?.id || row?._id),
    taskId: safeString(row?.task_id),
    status: (safeString(row?.status) || "completed") as AcquisitionCrawlerRun["status"],
    startedAt: safeString(row?.started_at, nowIso()),
    finishedAt: row?.finished_at ? safeString(row.finished_at) : null,
    fetchedDocuments: safeNumber(row?.fetched_documents, 0),
    extractedLeads: safeNumber(row?.extracted_leads, 0),
    qualifiedLeads: safeNumber(row?.qualified_leads, 0),
    failedDocuments: safeNumber(row?.failed_documents, 0),
    errorMessage: row?.error_message ? safeString(row.error_message) : null,
    metrics: toNumberRecord(row?.metrics),
    meta: asRecord(row?.meta),
  }
}

function toReplyEventRow(item: AcquisitionReplyEvent): RawRow {
  return {
    id: item.id,
    outreach_job_id: item.outreachJobId,
    lead_id: item.leadId,
    organization_id: item.organizationId,
    contact_id: item.contactId,
    channel: item.channel,
    inbound_text: item.inboundText,
    sentiment_score: item.sentimentScore,
    disposition: item.disposition,
    ai_summary: item.aiSummary,
    suggested_next_action: item.suggestedNextAction,
    requires_human_review: item.requiresHumanReview,
    received_at: item.receivedAt,
    meta: item.meta,
  }
}

function mapReplyEventRow(row: RawRow): AcquisitionReplyEvent {
  return {
    id: safeString(row?.id || row?._id),
    outreachJobId: row?.outreach_job_id ? safeString(row.outreach_job_id) : null,
    leadId: safeString(row?.lead_id),
    organizationId: safeString(row?.organization_id),
    contactId: row?.contact_id ? safeString(row.contact_id) : null,
    channel: (safeString(row?.channel) || "email") as AcquisitionReplyEvent["channel"],
    inboundText: safeString(row?.inbound_text),
    sentimentScore: row?.sentiment_score === null || row?.sentiment_score === undefined ? null : safeNumber(row.sentiment_score, 0),
    disposition: (safeString(row?.disposition) || "manual_review") as AcquisitionReplyEvent["disposition"],
    aiSummary: row?.ai_summary ? safeString(row.ai_summary) : null,
    suggestedNextAction: row?.suggested_next_action ? safeString(row.suggested_next_action) : null,
    requiresHumanReview: safeBoolean(row?.requires_human_review, false),
    receivedAt: safeString(row?.received_at, nowIso()),
    meta: asRecord(row?.meta),
  }
}

function toOfferPackageRow(item: AcquisitionOfferPackage): RawRow {
  return {
    id: item.id,
    partner_type: item.partnerType,
    name: item.name,
    billing_product: item.billingProduct,
    billing_cycle: item.billingCycle,
    pro_benefit_months: item.proBenefitMonths,
    coupon_discount_rate: item.couponDiscountRate,
    coupon_price_rmb: item.couponPriceRmb,
    commission_rule_id: item.commissionRuleId,
    contract_template_key: item.contractTemplateKey,
    active: item.active,
    meta: item.meta,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapOfferPackageRow(row: RawRow): AcquisitionOfferPackage {
  return {
    id: safeString(row?.id || row?._id),
    partnerType: (safeString(row?.partner_type) || "enterprise") as AcquisitionOfferPackage["partnerType"],
    name: safeString(row?.name),
    billingProduct: row?.billing_product ? safeString(row.billing_product) : null,
    billingCycle: row?.billing_cycle ? (safeString(row.billing_cycle) as AcquisitionOfferPackage["billingCycle"]) : null,
    proBenefitMonths: safeNumber(row?.pro_benefit_months, 0),
    couponDiscountRate: safeNumber(row?.coupon_discount_rate, 0),
    couponPriceRmb: row?.coupon_price_rmb === null || row?.coupon_price_rmb === undefined ? null : safeNumber(row.coupon_price_rmb, 0),
    commissionRuleId: row?.commission_rule_id ? safeString(row.commission_rule_id) : null,
    contractTemplateKey: row?.contract_template_key ? safeString(row.contract_template_key) : null,
    active: safeBoolean(row?.active, true),
    meta: asRecord(row?.meta),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function toPartnershipRow(item: AcquisitionPartnershipRecord): RawRow {
  return {
    id: item.id,
    organization_id: item.organizationId,
    lead_id: item.leadId,
    partner_type: item.partnerType,
    status: item.status,
    offer_package_id: item.offerPackageId,
    contract_id: item.contractId,
    contract_signed_at: item.contractSignedAt,
    launch_at: item.launchAt,
    manager_user_id: item.managerUserId,
    notes: item.notes,
    meta: item.meta,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapPartnershipRow(row: RawRow): AcquisitionPartnershipRecord {
  return {
    id: safeString(row?.id || row?._id),
    organizationId: safeString(row?.organization_id),
    leadId: safeString(row?.lead_id),
    partnerType: (safeString(row?.partner_type) || "enterprise") as AcquisitionPartnershipRecord["partnerType"],
    status: (safeString(row?.status) || "prospecting") as AcquisitionPartnershipRecord["status"],
    offerPackageId: row?.offer_package_id ? safeString(row.offer_package_id) : null,
    contractId: row?.contract_id ? safeString(row.contract_id) : null,
    contractSignedAt: row?.contract_signed_at ? safeString(row.contract_signed_at) : null,
    launchAt: row?.launch_at ? safeString(row.launch_at) : null,
    managerUserId: row?.manager_user_id ? safeString(row.manager_user_id) : null,
    notes: row?.notes ? safeString(row.notes) : null,
    meta: asRecord(row?.meta),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function toTrackingAssetRow(item: AcquisitionTrackingAsset): RawRow {
  return {
    id: item.id,
    partnership_id: item.partnershipId,
    organization_id: item.organizationId,
    asset_type: item.assetType,
    code: item.code,
    url: item.url,
    coupon_id: item.couponId,
    marketing_invitation_code_id: item.marketingInvitationCodeId,
    source_campaign: item.sourceCampaign,
    source_medium: item.sourceMedium,
    source_content: item.sourceContent,
    active: item.active,
    expires_at: item.expiresAt,
    meta: item.meta,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapTrackingAssetRow(row: RawRow): AcquisitionTrackingAsset {
  return {
    id: safeString(row?.id || row?._id),
    partnershipId: safeString(row?.partnership_id),
    organizationId: safeString(row?.organization_id),
    assetType: (safeString(row?.asset_type) || "link") as AcquisitionTrackingAsset["assetType"],
    code: safeString(row?.code),
    url: row?.url ? safeString(row.url) : null,
    couponId: row?.coupon_id ? safeString(row.coupon_id) : null,
    marketingInvitationCodeId: row?.marketing_invitation_code_id ? safeString(row.marketing_invitation_code_id) : null,
    sourceCampaign: row?.source_campaign ? safeString(row.source_campaign) : null,
    sourceMedium: row?.source_medium ? safeString(row.source_medium) : null,
    sourceContent: row?.source_content ? safeString(row.source_content) : null,
    active: safeBoolean(row?.active, true),
    expiresAt: row?.expires_at ? safeString(row.expires_at) : null,
    meta: asRecord(row?.meta),
    createdAt: safeString(row?.created_at, nowIso()),
    updatedAt: safeString(row?.updated_at || row?.created_at, nowIso()),
  }
}

function toEventLogRow(item: AcquisitionEventLog): RawRow {
  return {
    id: item.id,
    entity_type: item.entityType,
    entity_id: item.entityId,
    event_type: item.eventType,
    actor_user_id: item.actorUserId,
    occurred_at: item.occurredAt,
    payload: item.payload,
  }
}

async function appendEventLog(entry: Omit<AcquisitionEventLog, "id">) {
  const eventLog: AcquisitionEventLog = {
    id: randomUUID(),
    ...entry,
  }
  await insertRow(EVENT_LOGS_TABLE, toEventLogRow(eventLog))
}

async function seedRuleSet() {
  const existing = await findRow(RULES_TABLE, { key: DEFAULT_RULE_SET_KEY })
  const current = existing ? mapRuleSetRow(existing) : null
  const next: AcquisitionRuleSet = {
    id: current?.id || DEFAULT_RULE_SET_ID,
    key: DEFAULT_RULE_SET_KEY,
    version: RULES_CONFIG.version || 1,
    scope: "global",
    enabled: true,
    config: RULES_CONFIG as unknown as Record<string, unknown>,
    createdAt: current?.createdAt || nowIso(),
    updatedAt: nowIso(),
  }

  if (current) {
    await updateRow(RULES_TABLE, { id: next.id }, toRuleSetRow(next))
  } else {
    await insertRow(RULES_TABLE, toRuleSetRow(next))
  }

  return next
}

async function seedCrawlerTaskTemplates() {
  const entries: Array<{ partnerType: AcquisitionPartnerType; key: keyof AcquisitionMultichannelRulesConfig["crawlerTasks"]; name: string }> = [
    { partnerType: "blogger", key: "blogger", name: "Blogger discovery default" },
    { partnerType: "enterprise", key: "enterprise", name: "Enterprise procurement default" },
    { partnerType: "vc", key: "vc", name: "VC outreach default" },
  ]

  for (const entry of entries) {
    const currentRow = await findRow(CRAWLER_TASKS_TABLE, { id: `seed-${entry.key}` })
    const current = currentRow ? mapCrawlerTaskRow(currentRow) : null
    const config = RULES_CONFIG.crawlerTasks[entry.key]
    const next: AcquisitionCrawlerTask = {
      id: current?.id || `seed-${entry.key}`,
      name: entry.name,
      targetType: entry.partnerType,
      status: "active",
      provider: resolveCrawlerProvider(),
      targetSites: config.targetSites,
      selectors: config.selectors,
      region: entry.partnerType === "blogger" ? "CN" : "INTL",
      locale: entry.partnerType === "blogger" ? "zh" : "en",
      keywordQuery: "",
      frequencyMinutes: safeNumber(config.frequencyMinutes, 1440),
      maxResultsPerRun: safeNumber(RULES_CONFIG.global.maxCrawlerResultsPerRun, 300),
      dedupeKey: ["organization", "contactValue", "sourceLabel"],
      publicContactOnly: true,
      config: { seed: true, ruleKey: entry.key },
      lastRunAt: current?.lastRunAt || null,
      nextRunAt: current?.nextRunAt || null,
      createdAt: current?.createdAt || nowIso(),
      updatedAt: nowIso(),
    }

    if (current) {
      await updateRow(CRAWLER_TASKS_TABLE, { id: next.id }, toCrawlerTaskRow(next))
    } else {
      await insertRow(CRAWLER_TASKS_TABLE, toCrawlerTaskRow(next))
    }
  }
}

async function seedOfferPackages() {
  const bloggerTier = RULES_CONFIG.bloggerAlliance.fanTiers[0]
  const packages: AcquisitionOfferPackage[] = [
    {
      id: "offer-blogger-alliance",
      partnerType: "blogger",
      name: "Blogger alliance package",
      billingProduct: DEFAULT_CAMPAIGN_PRODUCT,
      billingCycle: "first_year",
      proBenefitMonths: safeNumber(bloggerTier?.defaultOffer?.proBenefitMonths, 36),
      couponDiscountRate: safeNumber(bloggerTier?.defaultOffer?.couponDiscountRate, 20),
      couponPriceRmb: safeNumber(bloggerTier?.defaultOffer?.couponPriceRmbMax, 200),
      commissionRuleId: null,
      contractTemplateKey: "blogger-alliance-v1",
      active: true,
      meta: {
        fanTierId: bloggerTier?.id || "micro",
        commissionRates: RULES_CONFIG.bloggerAlliance.commissionRates,
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: "offer-enterprise-procurement",
      partnerType: "enterprise",
      name: "Enterprise procurement package",
      billingProduct: DEFAULT_CAMPAIGN_PRODUCT,
      billingCycle: "enterprise_contract",
      proBenefitMonths: 12,
      couponDiscountRate: 0,
      couponPriceRmb: null,
      commissionRuleId: null,
      contractTemplateKey: RULES_CONFIG.enterpriseProcurement.contractStrategy.defaultContractTemplate,
      active: true,
      meta: {
        legalReviewRequiredAboveAmount: RULES_CONFIG.enterpriseProcurement.contractStrategy.legalReviewRequiredAboveAmount,
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: "offer-vc-outreach",
      partnerType: "vc",
      name: "VC outreach package",
      billingProduct: null,
      billingCycle: null,
      proBenefitMonths: 0,
      couponDiscountRate: 0,
      couponPriceRmb: null,
      commissionRuleId: null,
      contractTemplateKey: "vc-intro-v1",
      active: true,
      meta: {
        tone: RULES_CONFIG.vcOutreach.aiDrafting.tone,
        requiredSections: RULES_CONFIG.vcOutreach.aiDrafting.requiredSections,
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ]

  for (const item of packages) {
    const existing = await findRow(OFFER_PACKAGES_TABLE, { id: item.id })
    const current = existing ? mapOfferPackageRow(existing) : null
    const next = {
      ...item,
      createdAt: current?.createdAt || item.createdAt,
      updatedAt: nowIso(),
    }
    if (current) {
      await updateRow(OFFER_PACKAGES_TABLE, { id: next.id }, toOfferPackageRow(next))
    } else {
      await insertRow(OFFER_PACKAGES_TABLE, toOfferPackageRow(next))
    }
  }
}

async function ensureSeedData() {
  if (ensureSeedPromise) {
    await ensureSeedPromise
    return
  }

  ensureSeedPromise = (async () => {
    if (getRegion() === "CN") {
      const db = await getDatabase()
      await ensureCloudbaseCollections(db, ALL_COLLECTIONS)
    }

    await seedRuleSet()
    await seedCrawlerTaskTemplates()
    await seedOfferPackages()
  })().catch((error) => {
    if (getRegion() === "INTL" && isSupabaseMissingRelation(error)) {
      return
    }
    throw error
  })

  try {
    await ensureSeedPromise
  } finally {
    ensureSeedPromise = null
  }
}

async function loadRuleSet() {
  const rows = await loadRows(RULES_TABLE)
  return rows.map(mapRuleSetRow).sort((a, b) => b.version - a.version)[0] || null
}

function buildRuntimeCrawlerTaskId(input: CrawlerRunInput) {
  return `crawler-${slugify(`${input.targetType}-${input.platform}-${input.region}-${input.keyword}`, "task").slice(0, 80)}`
}

async function ensureRuntimeCrawlerTask(input: CrawlerRunInput) {
  const taskId = buildRuntimeCrawlerTaskId(input)
  const existing = await findRow(CRAWLER_TASKS_TABLE, { id: taskId })
  const current = existing ? mapCrawlerTaskRow(existing) : null
  const template = getCrawlerTemplateConfig(input.targetType)
  const locale = input.locale === "zh" ? "zh" : safeString(current?.locale, input.region === "CN" ? "zh" : "en")
  const safeLimit = Math.max(1, Math.min(safeNumber(input.limit, 24), RULES_CONFIG.global.maxCrawlerResultsPerRun || 300))

  const next: AcquisitionCrawlerTask = {
    id: current?.id || taskId,
    name: `${input.targetType.toUpperCase()} ${safeString(input.platform, "multi")} ${safeString(input.region, "GLOBAL")} ${safeString(input.keyword, "discovery")}`.trim(),
    targetType: toPartnerType(input.targetType),
    status: "active",
    provider: resolveCrawlerProvider(),
    targetSites: template.targetSites,
    selectors: template.selectors,
    region: safeString(input.region, "GLOBAL"),
    locale,
    keywordQuery: safeString(input.keyword),
    frequencyMinutes: safeNumber(template.frequencyMinutes, 1440),
    maxResultsPerRun: safeLimit,
    dedupeKey: ["organization", "contactValue", "sourceLabel"],
    publicContactOnly: true,
    config: {
      platform: safeString(input.platform),
      sourceRuntime: resolveCrawlerProvider(),
      targetTemplate: getRuntimeCrawlerTemplateKey(input.targetType),
    },
    lastRunAt: current?.lastRunAt || null,
    nextRunAt: current?.nextRunAt || null,
    createdAt: current?.createdAt || nowIso(),
    updatedAt: nowIso(),
  }

  if (current) {
    await updateRow(CRAWLER_TASKS_TABLE, { id: next.id }, toCrawlerTaskRow(next))
  } else {
    await insertRow(CRAWLER_TASKS_TABLE, toCrawlerTaskRow(next))
  }

  return next
}

async function findFallbackOwnerUserId() {
  const explicit = safeString(process.env.MARKET_PARTNER_OWNER_USER_ID || process.env.MARKETING_PARTNER_USER_ID)
  if (explicit) return explicit

  if (getRegion() === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data, error } = await supabase.from("users").select("id").limit(1).maybeSingle()
    if (error) return ""
    return safeString(data?.id)
  }

  try {
    const db = await getDatabase()
    const result = await db.collection("users").limit(1).get()
    const row = Array.isArray(result?.data) ? result.data[0] : null
    return safeString(row?.id || row?._id)
  } catch {
    return ""
  }
}

function getCrawlerLeadContacts(lead: CrawlerLead): CrawlerLeadContact[] {
  if (Array.isArray(lead.contacts) && lead.contacts.length) {
    return lead.contacts.filter((contact) => safeString(contact.value) && safeString(contact.channel)) as CrawlerLeadContact[]
  }

  return [
    {
      id: lead.primaryContactId || `${lead.id}-${lead.contactChannel}-${lead.contactValue}`,
      name: lead.contactName,
      role: lead.contactRole,
      channel: lead.contactChannel,
      value: lead.contactValue,
      isPrimary: true,
      isPublicContact: lead.publicContactOnly,
    },
  ].filter((contact) => safeString(contact.value))
}

function pickLeadContact(lead: CrawlerLead) {
  const contacts = getCrawlerLeadContacts(lead)
  if (!contacts.length) return null

  return (
    contacts.find((contact) => contact.id === lead.primaryContactId) ||
    contacts.find((contact) => contact.channel === lead.contactChannel && contact.value === lead.contactValue) ||
    contacts.find((contact) => contact.isPrimary) ||
    contacts[0]
  )
}

async function upsertLeadGraph(params: {
  lead: CrawlerLead
  sourceTaskId: string | null
  sourceRunId: string | null
  sourceType: AcquisitionLeadRecord["sourceType"]
  locale: "zh" | "en"
}) {
  const timestamp = nowIso()
  const partnerType = toPartnerType(params.lead.segment)
  const audience = parseAudienceRange(params.lead.audience)
  const organizationFilters = {
    partner_type: partnerType,
    name: safeString(params.lead.organization),
    region: safeString(params.lead.region),
  }
  const currentOrganizationRow = await findRow(ORGANIZATIONS_TABLE, organizationFilters)
  const currentOrganization = currentOrganizationRow ? mapOrganizationRow(currentOrganizationRow) : null
  const organization: AcquisitionOrganizationProfile = {
    id: currentOrganization?.id || randomUUID(),
    partnerType,
    name: safeString(params.lead.organization),
    legalName: currentOrganization?.legalName || null,
    region: safeString(params.lead.region),
    market: resolveMarket(params.lead.region),
    primaryPlatform: safeString(params.lead.platform) || currentOrganization?.primaryPlatform || null,
    domain: currentOrganization?.domain || null,
    tags: Array.from(new Set([partnerType, params.lead.platform, params.lead.region].map((item) => safeString(item)).filter(Boolean))),
    followerMin: audience.followerMin,
    followerMax: audience.followerMax,
    estimatedAudienceSize: audience.estimatedAudienceSize,
    demandSummary: params.lead.suggestedAngle || params.lead.note || currentOrganization?.demandSummary || null,
    leadScore: Math.max(currentOrganization?.leadScore || 0, safeNumber(params.lead.fit, 0)),
    sourceType: params.sourceType,
    sourceUrl: params.lead.url || currentOrganization?.sourceUrl || null,
    sourceLabel: params.lead.sourceLabel || currentOrganization?.sourceLabel || null,
    status: currentOrganization?.status === "partner_active" ? "partner_active" : deriveDiscoveryLeadStatus(params.lead.fit),
    ownerUserId: currentOrganization?.ownerUserId || null,
    meta: {
      ...(currentOrganization?.meta || {}),
      latestLeadSnapshot: params.lead,
      audience: params.lead.audience,
      note: params.lead.note,
    },
    createdAt: currentOrganization?.createdAt || timestamp,
    updatedAt: timestamp,
  }

  if (currentOrganization) {
    await updateRow(ORGANIZATIONS_TABLE, { id: organization.id }, toOrganizationRow(organization))
  } else {
    await insertRow(ORGANIZATIONS_TABLE, toOrganizationRow(organization))
  }

  const crawlerContacts = getCrawlerLeadContacts(params.lead)
  const selectedCrawlerContact = pickLeadContact(params.lead) || crawlerContacts[0] || null
  let contactsCreatedCount = 0
  let contactsUpdatedCount = 0
  let leadsCreatedCount = 0
  let leadsUpdatedCount = 0
  const persistedContacts: AcquisitionContactProfile[] = []
  const persistedLeadRecords: AcquisitionLeadRecord[] = []
  let selectedContactRecord: AcquisitionContactProfile | null = null
  let selectedLeadRecord: AcquisitionLeadRecord | null = null
  let selectedContactCreated = false
  let selectedLeadCreated = false

  for (const crawlerContact of crawlerContacts) {
    const currentContactRow = await findRow(CONTACTS_TABLE, {
      organization_id: organization.id,
      channel: crawlerContact.channel,
      value: crawlerContact.value,
    })
    const currentContact = currentContactRow ? mapContactRow(currentContactRow) : null
    const contact: AcquisitionContactProfile = {
      id: currentContact?.id || randomUUID(),
      organizationId: organization.id,
      name: safeString(crawlerContact.name, params.lead.contactName || organization.name),
      role: safeString(crawlerContact.role, params.lead.contactRole) || currentContact?.role || null,
      channel: crawlerContact.channel,
      value: crawlerContact.value,
      isPrimary:
        (selectedCrawlerContact ? crawlerContact.id === selectedCrawlerContact.id : false) ||
        safeBoolean(crawlerContact.isPrimary, false) ||
        currentContact?.isPrimary ||
        false,
      isPublicContact: safeBoolean(crawlerContact.isPublicContact, params.lead.publicContactOnly),
      verificationStatus: currentContact?.verificationStatus || "unverified",
      locale: currentContact?.locale || params.locale || null,
      timezone: currentContact?.timezone || null,
      meta: {
        ...(currentContact?.meta || {}),
        sourceLabel: params.lead.sourceLabel,
        publicContactOnly: params.lead.publicContactOnly,
        contactLabel: crawlerContact.label || null,
        contactNote: crawlerContact.note || null,
      },
      createdAt: currentContact?.createdAt || timestamp,
      updatedAt: timestamp,
    }

    const contactCreated = !currentContact
    if (currentContact) {
      await updateRow(CONTACTS_TABLE, { id: contact.id }, toContactRow(contact))
      contactsUpdatedCount += 1
    } else {
      await insertRow(CONTACTS_TABLE, toContactRow(contact))
      contactsCreatedCount += 1
    }
    persistedContacts.push(contact)

    const currentLeadRow = await findRow(LEADS_TABLE, {
      organization_id: organization.id,
      contact_id: contact.id,
      pipeline: partnerType,
    })
    const currentLead = currentLeadRow ? mapLeadRow(currentLeadRow) : null
    const leadRecord: AcquisitionLeadRecord = {
      id: currentLead?.id || randomUUID(),
      organizationId: organization.id,
      contactId: contact.id,
      pipeline: partnerType,
      sourceType: params.sourceType,
      sourceTaskId: params.sourceTaskId,
      sourceRunId: params.sourceRunId,
      sourceDocumentUrl: params.lead.url || currentLead?.sourceDocumentUrl || null,
      qualificationReason: params.lead.suggestedAngle || params.lead.note || currentLead?.qualificationReason || null,
      fitScore: Math.max(currentLead?.fitScore || 0, params.lead.fit),
      priorityScore: Math.max(currentLead?.priorityScore || 0, params.lead.fit + (crawlerContact.channel === "email" ? 12 : 6)),
      status:
        currentLead?.status && !["new", "reviewing", "qualified", "contacted"].includes(currentLead.status)
          ? currentLead.status
          : deriveDiscoveryLeadStatus(params.lead.fit),
      nextActionAt: timestamp,
      lastContactedAt: currentLead?.lastContactedAt || null,
      lastRepliedAt: currentLead?.lastRepliedAt || null,
      meta: {
        ...(currentLead?.meta || {}),
        latestLeadSnapshot: params.lead,
        audience: params.lead.audience,
        sourceLabel: params.lead.sourceLabel,
        publicContactOnly: params.lead.publicContactOnly,
        note: params.lead.note,
        suggestedAngle: params.lead.suggestedAngle,
        contactSnapshot: crawlerContact,
      },
      createdAt: currentLead?.createdAt || timestamp,
      updatedAt: timestamp,
    }

    const leadCreated = !currentLead
    if (currentLead) {
      await updateRow(LEADS_TABLE, { id: leadRecord.id }, toLeadRow(leadRecord))
      leadsUpdatedCount += 1
    } else {
      await insertRow(LEADS_TABLE, toLeadRow(leadRecord))
      leadsCreatedCount += 1
    }
    persistedLeadRecords.push(leadRecord)

    if (!selectedCrawlerContact || crawlerContact.id === selectedCrawlerContact.id || (crawlerContact.channel === selectedCrawlerContact.channel && crawlerContact.value === selectedCrawlerContact.value)) {
      selectedContactRecord = contact
      selectedLeadRecord = leadRecord
      selectedContactCreated = contactCreated
      selectedLeadCreated = leadCreated
    }
  }

  const selectedContact = selectedContactRecord || persistedContacts[0]
  const selectedLead = selectedLeadRecord || persistedLeadRecords[0]
  if (!selectedContact || !selectedLead) {
    throw new Error("Crawler lead has no valid contacts to persist")
  }

  return {
    organization,
    contact: selectedContact,
    lead: selectedLead,
    contacts: persistedContacts,
    leads: persistedLeadRecords,
    counts: {
      contactsCreated: contactsCreatedCount,
      contactsUpdated: contactsUpdatedCount,
      leadsCreated: leadsCreatedCount,
      leadsUpdated: leadsUpdatedCount,
    },
    created: {
      organization: !currentOrganization,
      contact: selectedContactCreated,
      lead: selectedLeadCreated,
    },
  }

  /*
  const currentContactRow = await findRow(CONTACTS_TABLE, {
    organization_id: organization.id,
    channel: params.lead.contactChannel,
    value: params.lead.contactValue,
  })
  const currentContact = currentContactRow ? mapContactRow(currentContactRow) : null
  const contact: AcquisitionContactProfile = {
    id: currentContact?.id || randomUUID(),
    organizationId: organization.id,
    name: params.lead.contactName,
    role: params.lead.contactRole || currentContact?.role || null,
    channel: params.lead.contactChannel,
    value: params.lead.contactValue,
    isPrimary: currentContact?.isPrimary ?? true,
    isPublicContact: true,
    verificationStatus: currentContact?.verificationStatus || "unverified",
    locale: currentContact?.locale || params.locale || null,
    timezone: currentContact?.timezone || null,
    meta: {
      ...(currentContact?.meta || {}),
      sourceLabel: params.lead.sourceLabel,
      publicContactOnly: params.lead.publicContactOnly,
    },
    createdAt: currentContact?.createdAt || timestamp,
    updatedAt: timestamp,
  }

  if (currentContact) {
    await updateRow(CONTACTS_TABLE, { id: contact.id }, toContactRow(contact))
  } else {
    await insertRow(CONTACTS_TABLE, toContactRow(contact))
  }

  const currentLeadRow = await findRow(LEADS_TABLE, {
    organization_id: organization.id,
    contact_id: contact.id,
    pipeline: partnerType,
  })
  const currentLead = currentLeadRow ? mapLeadRow(currentLeadRow) : null
  const leadRecord: AcquisitionLeadRecord = {
    id: currentLead?.id || randomUUID(),
    organizationId: organization.id,
    contactId: contact.id,
    pipeline: partnerType,
    sourceType: params.sourceType,
    sourceTaskId: params.sourceTaskId,
    sourceRunId: params.sourceRunId,
    sourceDocumentUrl: params.lead.url || currentLead?.sourceDocumentUrl || null,
    qualificationReason: params.lead.suggestedAngle || params.lead.note || currentLead?.qualificationReason || null,
    fitScore: Math.max(currentLead?.fitScore || 0, params.lead.fit),
    priorityScore: Math.max(currentLead?.priorityScore || 0, params.lead.fit + (params.lead.contactChannel === "email" ? 12 : 6)),
    status:
      currentLead?.status && !["new", "reviewing", "qualified", "contacted"].includes(currentLead.status)
        ? currentLead.status
        : deriveDiscoveryLeadStatus(params.lead.fit),
    nextActionAt: timestamp,
    lastContactedAt: currentLead?.lastContactedAt || null,
    lastRepliedAt: currentLead?.lastRepliedAt || null,
    meta: {
      ...(currentLead?.meta || {}),
      latestLeadSnapshot: params.lead,
      audience: params.lead.audience,
      sourceLabel: params.lead.sourceLabel,
      publicContactOnly: params.lead.publicContactOnly,
      note: params.lead.note,
      suggestedAngle: params.lead.suggestedAngle,
    },
    createdAt: currentLead?.createdAt || timestamp,
    updatedAt: timestamp,
  }

  if (currentLead) {
    await updateRow(LEADS_TABLE, { id: leadRecord.id }, toLeadRow(leadRecord))
  } else {
    await insertRow(LEADS_TABLE, toLeadRow(leadRecord))
  }

  return {
    organization,
    contact,
    lead: leadRecord,
    created: {
      organization: !currentOrganization,
      contact: !currentContact,
      lead: !currentLead,
    },
  }
  */
}

async function loadOfferPackageByPartnerType(partnerType: AcquisitionPartnerType) {
  const rows = await loadRows(OFFER_PACKAGES_TABLE)
  return rows
    .map(mapOfferPackageRow)
    .filter((item) => item.partnerType === partnerType && item.active)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0] || null
}

async function ensureTrackingAssetsForPartnership(params: {
  partnership: AcquisitionPartnershipRecord
  organization: AcquisitionOrganizationProfile
  offerPackage: AcquisitionOfferPackage | null
  origin?: string | null
}) {
  const existingAssets = (await loadRows(TRACKING_ASSETS_TABLE))
    .map(mapTrackingAssetRow)
    .filter((item) => item.partnershipId === params.partnership.id)

  let marketingInvitationCode: MarketingInvitationCode | null = null
  let marketingCoupon: MarketingCoupon | null = null
  const ownerUserId = await findFallbackOwnerUserId()
  const trackingAssets = [...existingAssets]
  const timestamp = nowIso()
  const sourceCampaign = `acquisition-${params.partnership.partnerType}`
  const sourceMedium = params.partnership.partnerType === "blogger" ? "alliance" : "bd"
  const sourceContent = slugify(params.organization.name, params.partnership.partnerType)

  if (params.partnership.partnerType === "blogger") {
    const existingInviteAsset = trackingAssets.find((item) => item.assetType === "invite_code")
    const existingCouponAsset = trackingAssets.find((item) => item.assetType === "coupon")
    const existingLinkAsset = trackingAssets.find((item) => item.assetType === "link")

    if (!existingInviteAsset) {
      marketingInvitationCode = await upsertMarketingInvitationCode({
        code: createInviteCode(`${params.organization.name}-${params.organization.primaryPlatform || "blogger"}`),
        userId: ownerUserId,
        campaignSlug: sourceCampaign,
        partnerTier: "partner_package",
        partnerProduct: DEFAULT_CAMPAIGN_PRODUCT,
        partnerBenefitMonths: params.offerPackage?.proBenefitMonths ?? 36,
        fanDiscountRate: params.offerPackage?.couponDiscountRate ?? 20,
        orderCommissionRate: safeNumber((params.offerPackage?.meta?.commissionRates as Record<string, unknown> | undefined)?.first_year, 0.2),
        status: "active",
      })

      const inviteAsset: AcquisitionTrackingAsset = {
        id: randomUUID(),
        partnershipId: params.partnership.id,
        organizationId: params.organization.id,
        assetType: "invite_code",
        code: marketingInvitationCode.code,
        url: null,
        couponId: null,
        marketingInvitationCodeId: marketingInvitationCode.id,
        sourceCampaign,
        sourceMedium,
        sourceContent,
        active: true,
        expiresAt: marketingInvitationCode.expiresAt,
        meta: {
          campaignProduct: DEFAULT_CAMPAIGN_PRODUCT,
          partnerBenefitMonths: marketingInvitationCode.partnerBenefitMonths,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await insertRow(TRACKING_ASSETS_TABLE, toTrackingAssetRow(inviteAsset))
      trackingAssets.push(inviteAsset)
    }

    const inviteCode = marketingInvitationCode?.code || existingInviteAsset?.code || ""

    if (!existingCouponAsset) {
      marketingCoupon = await upsertMarketingCoupon({
        code: createCouponCode(`${params.organization.name}-fans`),
        userId: ownerUserId || "",
        assetType: "cash",
        audienceType: "linked_audience",
        partnerProduct: DEFAULT_CAMPAIGN_PRODUCT,
        sourceInvitationCode: inviteCode || null,
        orderCommissionRate: safeNumber((params.offerPackage?.meta?.commissionRates as Record<string, unknown> | undefined)?.first_year, 0.2),
        purchasePrice: params.offerPackage?.couponPriceRmb ?? 0,
        discountValue: params.offerPackage?.couponDiscountRate ?? 20,
        discountType: "percentage",
        minPurchase: 0,
        status: "available",
      })

      const couponAsset: AcquisitionTrackingAsset = {
        id: randomUUID(),
        partnershipId: params.partnership.id,
        organizationId: params.organization.id,
        assetType: "coupon",
        code: marketingCoupon.code,
        url: null,
        couponId: marketingCoupon.id,
        marketingInvitationCodeId: null,
        sourceCampaign,
        sourceMedium,
        sourceContent,
        active: true,
        expiresAt: marketingCoupon.expiresAt,
        meta: {
          discountValue: marketingCoupon.discountValue,
          discountType: marketingCoupon.discountType,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await insertRow(TRACKING_ASSETS_TABLE, toTrackingAssetRow(couponAsset))
      trackingAssets.push(couponAsset)
    }

    const couponCode = marketingCoupon?.code || existingCouponAsset?.code || null
    const resolvedInviteCode = marketingInvitationCode?.code || existingInviteAsset?.code || ""
    if (!existingLinkAsset && resolvedInviteCode) {
      const shareUrl = buildMarketingInviteShareUrl({
        code: resolvedInviteCode,
        campaignSlug: sourceCampaign,
        product: DEFAULT_CAMPAIGN_PRODUCT,
        tier: "partner_package",
        couponCode,
        origin: params.origin,
      })
      const linkAsset: AcquisitionTrackingAsset = {
        id: randomUUID(),
        partnershipId: params.partnership.id,
        organizationId: params.organization.id,
        assetType: "link",
        code: resolvedInviteCode,
        url: shareUrl,
        couponId: marketingCoupon?.id || existingCouponAsset?.couponId || null,
        marketingInvitationCodeId: marketingInvitationCode?.id || existingInviteAsset?.marketingInvitationCodeId || null,
        sourceCampaign,
        sourceMedium,
        sourceContent,
        active: true,
        expiresAt: null,
        meta: {
          sharePath: shareUrl,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await insertRow(TRACKING_ASSETS_TABLE, toTrackingAssetRow(linkAsset))
      trackingAssets.push(linkAsset)
    }
  }

  trackingAssets.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  return {
    trackingAssets,
    marketingInvitationCode,
    marketingCoupon,
  }
}

export async function loadAcquisitionOpsBootstrap(): Promise<AcquisitionOpsBootstrap> {
  await ensureSeedData()

  const [ruleSet, organizationsRows, contactsRows, leadsRows, crawlerTaskRows, crawlerRunRows, replyEventRows, offerPackageRows, partnershipRows, trackingAssetRows] =
    await Promise.all([
      loadRuleSet(),
      loadRows(ORGANIZATIONS_TABLE),
      loadRows(CONTACTS_TABLE),
      loadRows(LEADS_TABLE),
      loadRows(CRAWLER_TASKS_TABLE),
      loadRows(CRAWLER_RUNS_TABLE),
      loadRows(REPLY_EVENTS_TABLE),
      loadRows(OFFER_PACKAGES_TABLE),
      loadRows(PARTNERSHIPS_TABLE),
      loadRows(TRACKING_ASSETS_TABLE),
    ])

  const organizations = organizationsRows.map(mapOrganizationRow)
  const contacts = contactsRows.map(mapContactRow)
  const leads = leadsRows.map(mapLeadRow)
  const crawlerTasks = crawlerTaskRows.map(mapCrawlerTaskRow).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  const recentRuns: AcquisitionCrawlerRunSummary[] = crawlerRunRows
    .map(mapCrawlerRunRow)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, 8)
    .map((run) => {
      const task = crawlerTasks.find((item) => item.id === run.taskId)
      return {
        ...run,
        taskName: task?.name || null,
        targetType: task?.targetType || null,
      }
    })

  const contactsById = new Map(contacts.map((item) => [item.id, item]))
  const organizationsById = new Map(organizations.map((item) => [item.id, item]))
  const recentLeads: AcquisitionLeadSummary[] = leads
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 8)
    .map((lead) => ({
      ...lead,
      organizationName: organizationsById.get(lead.organizationId)?.name || null,
      contactValue: lead.contactId ? contactsById.get(lead.contactId)?.value || null : null,
      contactChannel: lead.contactId ? contactsById.get(lead.contactId)?.channel || null : null,
    }))

  const recentReplyEvents: AcquisitionReplyEventSummary[] = replyEventRows
    .map(mapReplyEventRow)
    .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))
    .slice(0, 8)
    .map((event) => ({
      ...event,
      organizationName: organizationsById.get(event.organizationId)?.name || null,
      contactValue: event.contactId ? contactsById.get(event.contactId)?.value || null : null,
    }))

  const trackingAssets = trackingAssetRows.map(mapTrackingAssetRow).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const partnerships: AcquisitionPartnershipSummary[] = partnershipRows
    .map(mapPartnershipRow)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 8)
    .map((partnership) => ({
      ...partnership,
      organizationName: organizationsById.get(partnership.organizationId)?.name || null,
      trackingAssetCount: trackingAssets.filter((item) => item.partnershipId === partnership.id).length,
    }))

  return {
    storage: {
      region: getRegion(),
      backend: getStorageBackend(),
    },
    ruleSet,
    crawlerTasks,
    recentRuns,
    recentLeads,
    recentReplyEvents,
    partnerships,
    trackingAssets: trackingAssets.slice(0, 12),
    offerPackages: offerPackageRows.map(mapOfferPackageRow).filter((item) => item.active),
    stats: {
      organizations: organizations.length,
      contacts: contacts.length,
      leads: leads.length,
      partnerships: partnershipRows.length,
      activePartnerships: partnershipRows.map(mapPartnershipRow).filter((item) => ["active", "contract_signed", "negotiating", "proposal_sent", "qualified"].includes(item.status)).length,
      trackingAssets: trackingAssets.length,
    },
  }
}

export async function persistCrawlerRun(params: {
  input: CrawlerRunInput
  leads: CrawlerLead[]
  locale?: "zh" | "en"
}): Promise<AcquisitionCrawlerPersistResult> {
  await ensureSeedData()

  const timestamp = nowIso()
  const task = await ensureRuntimeCrawlerTask(params.input)
  const qualifiedLeads = params.leads.filter((lead) => lead.fit >= 70).length
  const run: AcquisitionCrawlerRun = {
    id: randomUUID(),
    taskId: task.id,
    status: "completed",
    startedAt: timestamp,
    finishedAt: timestamp,
    fetchedDocuments: params.leads.length,
    extractedLeads: params.leads.length,
    qualifiedLeads,
    failedDocuments: 0,
    errorMessage: null,
    metrics: {
      public_contacts: params.leads.reduce((sum, lead) => sum + getCrawlerLeadContacts(lead).filter((contact) => contact.isPublicContact).length, 0),
      email_contacts: params.leads.reduce((sum, lead) => sum + getCrawlerLeadContacts(lead).filter((contact) => contact.channel === "email").length, 0),
      average_fit: params.leads.length ? Number((params.leads.reduce((sum, lead) => sum + lead.fit, 0) / params.leads.length).toFixed(2)) : 0,
    },
    meta: {
      input: params.input,
      locale: params.locale || "en",
    },
  }
  await insertRow(CRAWLER_RUNS_TABLE, toCrawlerRunRow(run))

  let organizationsCreated = 0
  let organizationsUpdated = 0
  let contactsCreated = 0
  let contactsUpdated = 0
  let leadsCreated = 0
  let leadsUpdated = 0
  const persistedLeadIds: string[] = []

  for (const lead of params.leads) {
    const persisted = await upsertLeadGraph({
      lead,
      sourceTaskId: task.id,
      sourceRunId: run.id,
      sourceType: "crawler",
      locale: params.locale === "zh" ? "zh" : "en",
    })

    if (persisted.created.organization) organizationsCreated += 1
    else organizationsUpdated += 1
    contactsCreated += persisted.counts?.contactsCreated || (persisted.created.contact ? 1 : 0)
    contactsUpdated += persisted.counts?.contactsUpdated || (persisted.created.contact ? 0 : 1)
    leadsCreated += persisted.counts?.leadsCreated || (persisted.created.lead ? 1 : 0)
    leadsUpdated += persisted.counts?.leadsUpdated || (persisted.created.lead ? 0 : 1)
    persistedLeadIds.push(persisted.lead.id)
  }

  const nextTask: AcquisitionCrawlerTask = {
    ...task,
    lastRunAt: timestamp,
    nextRunAt: new Date(Date.now() + task.frequencyMinutes * 60_000).toISOString(),
    updatedAt: timestamp,
  }
  await updateRow(CRAWLER_TASKS_TABLE, { id: nextTask.id }, toCrawlerTaskRow(nextTask))

  await appendEventLog({
    entityType: "crawler_run",
    entityId: run.id,
    eventType: "crawler.run.persisted",
    actorUserId: null,
    occurredAt: timestamp,
    payload: {
      taskId: task.id,
      input: params.input,
      extractedLeads: run.extractedLeads,
      qualifiedLeads,
      organizationsCreated,
      contactsCreated,
      leadsCreated,
    },
  })

  return {
    task: nextTask,
    run,
    organizationsCreated,
    organizationsUpdated,
    contactsCreated,
    contactsUpdated,
    leadsCreated,
    leadsUpdated,
    qualifiedLeads,
    persistedLeadIds,
  }
}

export async function saveReplyEvent(params: {
  lead: CrawlerLead
  replyText: string
  insight: AcquisitionReplyInsightInput
  locale?: "zh" | "en"
}): Promise<AcquisitionReplyPersistResult> {
  await ensureSeedData()

  const replyText = safeString(params.replyText)
  if (!replyText) {
    throw new Error("Reply content is required")
  }

  const persisted = await upsertLeadGraph({
    lead: params.lead,
    sourceTaskId: null,
    sourceRunId: null,
    sourceType: "crawler",
    locale: params.locale === "zh" ? "zh" : "en",
  })
  const timestamp = nowIso()
  const replyEvent: AcquisitionReplyEvent = {
    id: randomUUID(),
    outreachJobId: null,
    leadId: persisted.lead.id,
    organizationId: persisted.organization.id,
    contactId: persisted.contact.id,
    channel: params.lead.contactChannel,
    inboundText: replyText,
    sentimentScore: deriveSentimentScore(params.insight.disposition),
    disposition: params.insight.disposition,
    aiSummary: safeString(params.insight.summary) || null,
    suggestedNextAction: safeString(params.insight.nextStep) || null,
    requiresHumanReview: params.insight.disposition === "manual_review",
    receivedAt: timestamp,
    meta: {
      source: "distribution_workspace",
      locale: params.locale || "en",
      leadSnapshot: params.lead,
    },
  }
  await insertRow(REPLY_EVENTS_TABLE, toReplyEventRow(replyEvent))

  const nextLead: AcquisitionLeadRecord = {
    ...persisted.lead,
    status: deriveLeadStatusFromReply(params.insight.disposition),
    lastRepliedAt: timestamp,
    nextActionAt: timestamp,
    updatedAt: timestamp,
    meta: {
      ...persisted.lead.meta,
      lastReplyDisposition: params.insight.disposition,
      lastReplySummary: params.insight.summary,
      lastReplySuggestedNextAction: params.insight.nextStep,
    },
  }
  await updateRow(LEADS_TABLE, { id: nextLead.id }, toLeadRow(nextLead))

  const nextOrganization: AcquisitionOrganizationProfile = {
    ...persisted.organization,
    status: nextLead.status,
    updatedAt: timestamp,
    meta: {
      ...persisted.organization.meta,
      lastReplyDisposition: params.insight.disposition,
      lastReplyAt: timestamp,
    },
  }
  await updateRow(ORGANIZATIONS_TABLE, { id: nextOrganization.id }, toOrganizationRow(nextOrganization))

  await appendEventLog({
    entityType: "reply_event",
    entityId: replyEvent.id,
    eventType: "reply.captured",
    actorUserId: null,
    occurredAt: timestamp,
    payload: {
      leadId: nextLead.id,
      organizationId: nextOrganization.id,
      disposition: params.insight.disposition,
    },
  })

  return {
    replyEvent,
    organization: nextOrganization,
    contact: persisted.contact,
    lead: nextLead,
  }
}

export async function promotePartnership(params: {
  lead: CrawlerLead
  replyText: string
  insight: AcquisitionReplyInsightInput
  locale?: "zh" | "en"
  origin?: string | null
  assetTitle?: string | null
}): Promise<AcquisitionPartnershipActivationResult> {
  await ensureSeedData()

  const persisted = await saveReplyEvent({
    lead: params.lead,
    replyText: params.replyText,
    insight: params.insight,
    locale: params.locale,
  })

  const timestamp = nowIso()
  const offerPackage = await loadOfferPackageByPartnerType(persisted.lead.pipeline)
  const existingPartnershipRow = await findRow(PARTNERSHIPS_TABLE, { lead_id: persisted.lead.id })
  const currentPartnership = existingPartnershipRow ? mapPartnershipRow(existingPartnershipRow) : null
  const partnershipStatus = pickPartnershipStatus(currentPartnership?.status || null, derivePartnershipStatus(params.insight.disposition))
  const partnership: AcquisitionPartnershipRecord = {
    id: currentPartnership?.id || randomUUID(),
    organizationId: persisted.organization.id,
    leadId: persisted.lead.id,
    partnerType: persisted.lead.pipeline,
    status: partnershipStatus,
    offerPackageId: offerPackage?.id || currentPartnership?.offerPackageId || null,
    contractId: currentPartnership?.contractId || null,
    contractSignedAt: currentPartnership?.contractSignedAt || null,
    launchAt: currentPartnership?.launchAt || null,
    managerUserId: currentPartnership?.managerUserId || (await findFallbackOwnerUserId()) || null,
    notes: params.insight.nextStep || currentPartnership?.notes || null,
    meta: {
      ...(currentPartnership?.meta || {}),
      lastReplyDisposition: params.insight.disposition,
      lastReplySummary: params.insight.summary,
      assetTitle: safeString(params.assetTitle) || null,
    },
    createdAt: currentPartnership?.createdAt || timestamp,
    updatedAt: timestamp,
  }

  if (currentPartnership) {
    await updateRow(PARTNERSHIPS_TABLE, { id: partnership.id }, toPartnershipRow(partnership))
  } else {
    await insertRow(PARTNERSHIPS_TABLE, toPartnershipRow(partnership))
  }

  const generatedAssets =
    params.insight.disposition === "negative"
      ? {
          trackingAssets: (await loadRows(TRACKING_ASSETS_TABLE))
            .map(mapTrackingAssetRow)
            .filter((item) => item.partnershipId === partnership.id),
          marketingInvitationCode: null,
          marketingCoupon: null,
        }
      : await ensureTrackingAssetsForPartnership({
          partnership,
          organization: persisted.organization,
          offerPackage,
          origin: params.origin,
        })

  await appendEventLog({
    entityType: "partnership",
    entityId: partnership.id,
    eventType: "partnership.promoted",
    actorUserId: null,
    occurredAt: timestamp,
    payload: {
      leadId: partnership.leadId,
      organizationId: partnership.organizationId,
      status: partnership.status,
      offerPackageId: partnership.offerPackageId,
      trackingAssetCount: generatedAssets.trackingAssets.length,
    },
  })

  return {
    replyEvent: persisted.replyEvent,
    organization: persisted.organization,
    contact: persisted.contact,
    lead: persisted.lead,
    partnership,
    offerPackage,
    trackingAssets: generatedAssets.trackingAssets,
    marketingInvitationCode: generatedAssets.marketingInvitationCode,
    marketingCoupon: generatedAssets.marketingCoupon,
  }
}
