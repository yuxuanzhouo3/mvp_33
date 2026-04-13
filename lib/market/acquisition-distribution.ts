import { readFile } from "node:fs/promises"
import path from "node:path"
import { readDemoManifest } from "@/lib/demo-bundle"
import { sendEmail } from "@/lib/market/send-email"
import {
  getActiveDouyinAccount,
  getDirectPublishChannelConnectionState,
} from "@/lib/market/direct-publish-accounts"
import {
  createAcquisitionDistributionFallbackBootstrap,
  DEFAULT_OWNED_CHANNELS,
  DEFAULT_SHARE_PLATFORMS,
} from "./acquisition-distribution-shared"
import type {
  AcquisitionDistributionBootstrap,
  AcquisitionLeadSourceStatus,
  CrawlerLead,
  CrawlerLeadContact,
  CrawlerRunInput,
  DemoDistributionAsset,
  DirectPublishResult,
  OutreachBatchItemResult,
  OutreachBatchResult,
} from "./acquisition-distribution-types"

const MAX_CRAWLER_CONTACTS = 1000
const DEFAULT_LEAD_SOURCE_FILE = "config/market/acquisition-leads.json"

type CrawlerMode = NonNullable<CrawlerRunInput["mode"]>
type CrawlerProfile = {
  mode: CrawlerMode
  fetchTimeoutMs: number
  queryCount: number
  minSearchResultFetchLimit: number
  maxSearchResultFetchLimit: number
  providerResultLimit: number
  contactPagesPerDocument: number
  collectedLeadMultiplier: number
  collectedLeadMinimum: number
  importedLeadSampleMultiplier: number
  importedLeadSampleMinimum: number
}

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const LINKEDIN_REGEX = /https?:\/\/(?:[\w-]+\.)?linkedin\.com\/[^\s"'<>]+/gi
const TELEGRAM_URL_REGEX = /https?:\/\/(?:t\.me|telegram\.me)\/[A-Za-z0-9_]{3,64}(?!\/)/gi
const WHATSAPP_URL_REGEX = /https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^\s"'<>]+/gi
const X_URL_REGEX = /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[A-Za-z0-9_]{1,30}(?!\/)/gi
const AT_HANDLE_REGEX = /(^|\s)@[A-Za-z0-9_]{3,30}\b/g

const WECHAT_REGEX = /\b(?:wechat|weixin|wx|vx|\u5fae\u4fe1)\s*[:\uff1a]?\s*([A-Za-z][A-Za-z0-9_-]{4,30})/gi
const TELEGRAM_HANDLE_REGEX = /\b(?:telegram|tg)\s*[:\uff1a]?\s*(@?[A-Za-z0-9_]{3,64})/gi
const WHATSAPP_PHONE_REGEX = /\b(?:whatsapp|wa)\s*[:\uff1a]?\s*(\+?[0-9][0-9\s-]{6,20})/gi

const MAILTO_REGEX = /mailto:([^"'#>\s]+)/gi
const ANCHOR_TAG_REGEX = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi

const DIRECT_CONTACT_PATTERNS = [
  /contact us/i,
  /business inquiries?/i,
  /partnerships?/i,
  /brand partnerships?/i,
  /marketing/i,
  /media kit/i,
  /investor relations/i,
  /reach out/i,
  /(?:\u8054\u7cfb|\u8054\u7edc)\u6211\u4eec/u,
  /\u5546\u52a1\u5408\u4f5c/u,
  /\u5408\u4f5c\u8054\u7cfb/u,
  /\u5a92\u4f53\u8054\u7cfb/u,
  /\u6295\u8d44\u8005\u5173\u7cfb/u,
]

const HIGH_SIGNAL_SOURCE_PATTERNS = [
  /(?:^|[/?#._-])(contact|contact-us|about|team|partners?|business|cooperation|advertis(?:e|ing)|brand|media-kit|investor-relations)(?:$|[/?#._-])/i,
  /(?:\u8054\u7cfb\u6211\u4eec|\u5546\u52a1\u5408\u4f5c|\u5173\u4e8e\u6211\u4eec|\u56e2\u961f|\u5408\u4f5c\u65b9\u5f0f|\u5a92\u4f53\u8054\u7cfb|\u6295\u8d44\u8005\u5173\u7cfb)/u,
]

const LOW_SIGNAL_SOURCE_PATTERNS = [
  /(?:^|[/?#._-])(news|blog|article|articles|post|posts|report|reports|whitepaper|insights|privacy|terms|legal|career|careers|jobs?|login|signup|register|search|category|tag|author|feed|press-release)(?:$|[/?#._-])/i,
  /(?:\u65b0\u95fb|\u516c\u544a|\u7814\u62a5|\u767d\u76ae\u4e66|\u9690\u79c1|\u6761\u6b3e|\u62db\u8058|\u6ce8\u518c|\u767b\u5f55|\u6807\u7b7e|\u5206\u7c7b)/u,
]

const BROKEN_PAGE_PATTERNS = [
  /\b404\b/i,
  /page not found/i,
  /access denied/i,
  /forbidden/i,
  /temporarily unavailable/i,
  /captcha/i,
  /enable javascript/i,
]

type LeadSegment = CrawlerLead["segment"]
type LeadChannel = CrawlerLead["contactChannel"]
type LeadContact = CrawlerLeadContact
type LeadSourceRuntime = "file" | "tavily" | "serper" | "webhook"

type RawLeadInput = {
  id?: unknown
  segment?: unknown
  title?: unknown
  platform?: unknown
  region?: unknown
  url?: unknown
  audience?: unknown
  fit?: unknown
  note?: unknown
  organization?: unknown
  primaryContactId?: unknown
  contacts?: unknown
  contactName?: unknown
  contactRole?: unknown
  contactChannel?: unknown
  contactValue?: unknown
  sourceLabel?: unknown
  publicContactOnly?: unknown
  suggestedAngle?: unknown
}

type RawLeadContactInput = {
  id?: unknown
  name?: unknown
  role?: unknown
  channel?: unknown
  value?: unknown
  label?: unknown
  note?: unknown
  isPrimary?: unknown
  isPublicContact?: unknown
}

type LeadSourcePayload = {
  provider?: unknown
  leads?: unknown
}

type SearchDocument = {
  title: string
  url: string
  snippet: string
  content: string
  sourceLabel: string
}

type PageSnapshot = {
  url: string
  raw: string
  text: string
}

type LeadContactCandidate = {
  name?: string
  role?: string
  channel: LeadChannel
  value: string
  label?: string
  note?: string
  isPrimary?: boolean
}

function humanFileSize(size: number) {
  return `${(size / 1024).toFixed(1)} KB`
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() || fallback : fallback
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function safeBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback
}

function getCrawlerMode(input?: Pick<CrawlerRunInput, "mode"> | null): CrawlerMode {
  return input?.mode === "deep" ? "deep" : "quick"
}

function getCrawlerProfile(input?: Pick<CrawlerRunInput, "mode"> | CrawlerMode | null): CrawlerProfile {
  const mode =
    typeof input === "string"
      ? input === "deep"
        ? "deep"
        : "quick"
      : getCrawlerMode(input)

  if (mode === "deep") {
    return {
      mode,
      fetchTimeoutMs: 9000,
      queryCount: 7,
      minSearchResultFetchLimit: 14,
      maxSearchResultFetchLimit: 36,
      providerResultLimit: 18,
      contactPagesPerDocument: 4,
      collectedLeadMultiplier: 3,
      collectedLeadMinimum: 36,
      importedLeadSampleMultiplier: 8,
      importedLeadSampleMinimum: 96,
    }
  }

  return {
    mode,
    fetchTimeoutMs: 4000,
    queryCount: 3,
    minSearchResultFetchLimit: 8,
    maxSearchResultFetchLimit: 14,
    providerResultLimit: 10,
    contactPagesPerDocument: 2,
    collectedLeadMultiplier: 2,
    collectedLeadMinimum: 18,
    importedLeadSampleMultiplier: 4,
    importedLeadSampleMinimum: 24,
  }
}

function normalizeSegment(value: unknown): LeadSegment | null {
  const normalized = safeString(value).toLowerCase()
  if (normalized === "blogger" || normalized === "b2b" || normalized === "vc") return normalized
  return null
}

function normalizeChannel(value: unknown): LeadChannel | null {
  const normalized = safeString(value).toLowerCase()
  if (
    normalized === "email" ||
    normalized === "dm" ||
    normalized === "wechat" ||
    normalized === "telegram" ||
    normalized === "whatsapp" ||
    normalized === "institution" ||
    normalized === "agency" ||
    normalized === "linkedin" ||
    normalized === "x" ||
    normalized === "website"
  ) {
    return normalized
  }
  return null
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function canonicalizeUrl(value: string) {
  try {
    const parsed = new URL(value)
    parsed.hash = ""
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|spm$|ref$|source$|from$|fbclid$|gclid$)/i.test(key)) {
        parsed.searchParams.delete(key)
      }
    }
    const search = parsed.searchParams.toString()
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/"
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${pathname}${search ? `?${search}` : ""}`
  } catch {
    return safeString(value).toLowerCase()
  }
}

function normalizeTextForDedupe(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/['"`\u2018\u2019]/g, "")
    .replace(/[|:;,.!?()\[\]{}\-_/]+/g, " ")
    .replace(/\d{4}(?:年)?/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeOrganizationKey(value: string) {
  return normalizeTextForDedupe(value)
    .replace(/\b(?:official|contact|about|team|business|press|media|news|report|annual|sustainability)\b/g, " ")
    .replace(/(?:官网|加入我们|联系我们|联络我们|关于我们|关于|首页|新闻|公告|报告|财经|媒体|合作|联系方式)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeContactValueForDedupe(channel: LeadChannel, value: string) {
  const normalized = safeString(value).toLowerCase()
  if (!normalized) return ""
  if (channel === "email" || channel === "wechat") return normalized
  if (channel === "linkedin" || channel === "x" || channel === "website") return canonicalizeUrl(normalized)
  return normalized
}

function getLeadChannelPriority(channel: LeadChannel) {
  if (channel === "email") return 0
  if (channel === "institution") return 1
  if (channel === "agency") return 2
  if (channel === "linkedin") return 3
  if (channel === "dm") return 4
  if (channel === "telegram") return 5
  if (channel === "whatsapp") return 6
  if (channel === "website") return 7
  if (channel === "wechat") return 8
  return 9
}

function buildLeadContactId(channel: LeadChannel, value: string, name = "") {
  const normalizedValue = normalizeContactValueForDedupe(channel, value)
  const normalizedName = normalizeTextForDedupe(name)
  return `${channel}-${normalizedValue || normalizedName || "contact"}`
}

function normalizeLeadContact(
  raw: RawLeadContactInput,
  params: {
    organization: string
    fallbackName?: string
    fallbackRole?: string
    publicContactOnly?: boolean
  },
): LeadContact | null {
  const channel = normalizeChannel(raw.channel)
  const value = safeString(raw.value)
  if (!channel || !value) return null

  const fallbackName = safeString(params.fallbackName, params.organization || "Business contact")
  const fallbackRole = safeString(params.fallbackRole, "Business contact")
  const name = safeString(raw.name, fallbackName)
  const role = safeString(raw.role, fallbackRole)

  return {
    id: safeString(raw.id, buildLeadContactId(channel, value, name)),
    name,
    role,
    channel,
    value,
    label: safeString(raw.label) || undefined,
    note: safeString(raw.note) || undefined,
    isPrimary: safeBoolean(raw.isPrimary, false),
    isPublicContact: safeBoolean(raw.isPublicContact, params.publicContactOnly ?? true),
  }
}

function dedupeLeadContacts(contacts: LeadContact[]) {
  const merged = new Map<string, LeadContact>()

  for (const contact of contacts) {
    const key = `${contact.channel}:${normalizeContactValueForDedupe(contact.channel, contact.value)}`
    const current = merged.get(key)
    if (!current) {
      merged.set(key, contact)
      continue
    }

    merged.set(key, {
      ...current,
      id: current.id || contact.id,
      name: current.name || contact.name,
      role: current.role || contact.role,
      label: current.label || contact.label,
      note: current.note || contact.note,
      isPrimary: current.isPrimary || contact.isPrimary,
      isPublicContact: current.isPublicContact && contact.isPublicContact,
    })
  }

  return [...merged.values()].sort((left, right) => {
    const channelDelta = getLeadChannelPriority(left.channel) - getLeadChannelPriority(right.channel)
    if (channelDelta !== 0) return channelDelta
    return left.name.localeCompare(right.name)
  })
}

function pickPrimaryLeadContact(contacts: LeadContact[], preferredContactId?: string | null) {
  const preferred = preferredContactId ? contacts.find((contact) => contact.id === preferredContactId) : null
  if (preferred) return preferred

  const explicitPrimary = contacts.find((contact) => contact.isPrimary)
  if (explicitPrimary) return explicitPrimary

  return (
    [...contacts].sort((left, right) => {
      const channelDelta = getLeadChannelPriority(left.channel) - getLeadChannelPriority(right.channel)
      if (channelDelta !== 0) return channelDelta
      return left.name.localeCompare(right.name)
    })[0] || null
  )
}

function getLeadContacts(lead: CrawlerLead): LeadContact[] {
  if (Array.isArray(lead.contacts) && lead.contacts.length) {
    return dedupeLeadContacts(
      lead.contacts
        .map((contact) =>
          normalizeLeadContact(contact as RawLeadContactInput, {
            organization: lead.organization,
            fallbackName: lead.contactName,
            fallbackRole: lead.contactRole,
            publicContactOnly: lead.publicContactOnly,
          }),
        )
        .filter((contact): contact is LeadContact => Boolean(contact)),
    )
  }

  const fallback = normalizeLeadContact(
    {
      id: lead.primaryContactId || undefined,
      name: lead.contactName,
      role: lead.contactRole,
      channel: lead.contactChannel,
      value: lead.contactValue,
      isPrimary: true,
      isPublicContact: lead.publicContactOnly,
    },
    {
      organization: lead.organization,
      fallbackName: lead.contactName,
      fallbackRole: lead.contactRole,
      publicContactOnly: lead.publicContactOnly,
    },
  )

  return fallback ? [fallback] : []
}

function createCrawlerLead(input: {
  id: string
  segment: LeadSegment
  title: string
  platform: string
  region: string
  url: string
  audience: string
  fit: number
  note: string
  organization: string
  contacts: LeadContact[]
  sourceLabel: string
  publicContactOnly: boolean
  suggestedAngle: string
  primaryContactId?: string | null
}) {
  const contacts = dedupeLeadContacts(input.contacts)
  const primaryContact =
    pickPrimaryLeadContact(contacts, input.primaryContactId) ||
    normalizeLeadContact(
      {
        channel: "email",
        value: "",
      },
      {
        organization: input.organization,
        publicContactOnly: input.publicContactOnly,
      },
    )

  if (!primaryContact) {
    throw new Error("Crawler lead requires at least one valid contact")
  }

  const normalizedContacts = contacts.map((contact) => ({
    ...contact,
    isPrimary: contact.id === primaryContact.id,
  }))

  return {
    id: input.id,
    segment: input.segment,
    title: input.title,
    platform: input.platform,
    region: input.region,
    url: input.url,
    audience: input.audience,
    fit: input.fit,
    note: input.note,
    organization: input.organization,
    contactName: primaryContact.name,
    contactRole: primaryContact.role,
    contactChannel: primaryContact.channel,
    contactValue: primaryContact.value,
    primaryContactId: primaryContact.id,
    contacts: normalizedContacts,
    sourceLabel: input.sourceLabel,
    publicContactOnly: input.publicContactOnly,
    suggestedAngle: input.suggestedAngle,
  } satisfies CrawlerLead
}

function getSearchResultFetchLimit(limit: number, input?: Pick<CrawlerRunInput, "mode"> | CrawlerMode | null) {
  const profile = getCrawlerProfile(input)
  const desired = Math.ceil(limit * (profile.mode === "deep" ? 1.8 : 1.2))
  return Math.min(Math.max(desired, profile.minSearchResultFetchLimit), profile.maxSearchResultFetchLimit)
}

function getProviderResultLimit(limit: number, input?: Pick<CrawlerRunInput, "mode"> | CrawlerMode | null) {
  const profile = getCrawlerProfile(input)
  const desired = Math.ceil(limit * (profile.mode === "deep" ? 1.5 : 1.1))
  return Math.min(Math.max(desired, Math.min(8, profile.providerResultLimit)), profile.providerResultLimit)
}

function getCrawlerCollectionTarget(limit: number, input?: Pick<CrawlerRunInput, "mode"> | CrawlerMode | null) {
  const profile = getCrawlerProfile(input)
  return Math.max(limit * profile.collectedLeadMultiplier, profile.collectedLeadMinimum)
}

function getImportedLeadSampleLimit(limit: number, input?: Pick<CrawlerRunInput, "mode"> | CrawlerMode | null) {
  const profile = getCrawlerProfile(input)
  return Math.max(limit * profile.importedLeadSampleMultiplier, profile.importedLeadSampleMinimum)
}

function stripHtml(value: string) {
  return normalizeWhitespace(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, '"'),
  )
}

function resolveLeadSourcePath() {
  const configured = safeString(process.env.MARKET_LEAD_SOURCE_FILE)
  const relativeOrDefault = configured || DEFAULT_LEAD_SOURCE_FILE
  const absolute = path.isAbsolute(relativeOrDefault) ? relativeOrDefault : path.join(process.cwd(), relativeOrDefault)

  return {
    absolute,
    displayPath: relativeOrDefault,
    explicitlyConfigured: Boolean(configured),
  }
}

function resolveLeadProviderRuntime(): LeadSourceRuntime {
  const configured = safeString(process.env.MARKET_LEAD_SOURCE_PROVIDER).toLowerCase()
  if (configured === "tavily" || configured === "serper" || configured === "webhook") return configured
  return "file"
}

function createLeadPreviewUrl(input: {
  id: string
  segment: LeadSegment
  platform: string
  region: string
  organization: string
  contactName: string
  contactRole: string
  contactChannel: LeadChannel
  contactValue: string
  sourceLabel: string
}) {
  const params = new URLSearchParams({
    id: input.id,
    segment: input.segment,
    platform: input.platform,
    region: input.region,
    organization: input.organization,
    contactName: input.contactName,
    contactRole: input.contactRole,
    contactChannel: input.contactChannel,
    contactValue: input.contactValue,
    sourceLabel: input.sourceLabel,
  })

  return `/market/acquisition/distribution/lead-preview?${params.toString()}`
}

function normalizeLead(raw: RawLeadInput, index: number): CrawlerLead | null {
  const organization = safeString(raw.organization)
  const segment = normalizeSegment(raw.segment)

  if (!segment || !organization) return null

  const id = safeString(raw.id, `lead-${index + 1}`)
  const platform = safeString(raw.platform, "web")
  const region = safeString(raw.region, "Global")
  const sourceLabel = safeString(raw.sourceLabel, "Imported public business source")
  const publicContactOnly = raw.publicContactOnly !== false
  const fallbackName = safeString(raw.contactName, organization)
  const fallbackRole = safeString(raw.contactRole, "Business contact")
  const rawContacts = Array.isArray(raw.contacts) ? raw.contacts : []
  const contacts = dedupeLeadContacts(
    [
      ...rawContacts
        .map((item) =>
          normalizeLeadContact((item || {}) as RawLeadContactInput, {
            organization,
            fallbackName,
            fallbackRole,
            publicContactOnly,
          }),
        )
        .filter((contact): contact is LeadContact => Boolean(contact)),
      ...(() => {
        const legacyContact = normalizeLeadContact(
          {
            id: raw.primaryContactId,
            name: raw.contactName,
            role: raw.contactRole,
            channel: raw.contactChannel,
            value: raw.contactValue,
            isPrimary: true,
            isPublicContact: raw.publicContactOnly,
          },
          {
            organization,
            fallbackName,
            fallbackRole,
            publicContactOnly,
          },
        )
        return legacyContact ? [legacyContact] : []
      })(),
    ],
  )

  if (!contacts.length) return null
  const primaryContact = pickPrimaryLeadContact(contacts, safeString(raw.primaryContactId)) || contacts[0]

  return createCrawlerLead({
    id,
    segment,
    title: safeString(raw.title, `${organization} lead`),
    platform,
    region,
    url:
      safeString(raw.url) ||
      createLeadPreviewUrl({
        id,
        segment,
        platform,
        region,
        organization,
        contactName: primaryContact.name,
        contactRole: primaryContact.role,
        contactChannel: primaryContact.channel,
        contactValue: primaryContact.value,
        sourceLabel,
      }),
    audience: safeString(raw.audience, "-"),
    fit: Math.min(Math.max(safeNumber(raw.fit, 75), 0), 100),
    note: safeString(raw.note, "Imported public-facing business contact."),
    organization,
    contacts,
    sourceLabel,
    publicContactOnly,
    suggestedAngle: safeString(raw.suggestedAngle, "Review manually before outreach."),
    primaryContactId: primaryContact.id,
  })
}

async function readJsonFromUrl(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`Lead provider request failed with ${response.status}`)
  }
  return (await response.json()) as unknown
}

async function readPageSnapshot(url: string, input?: Pick<CrawlerRunInput, "mode"> | CrawlerMode | null): Promise<PageSnapshot | null> {
  const profile = getCrawlerProfile(input)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), profile.fetchTimeoutMs)

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "MornChat Market Discovery/1.0 (+public-business-contact-only)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.2",
      },
      signal: controller.signal,
    })

    if (!response.ok) return null
    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("text") && !contentType.includes("html") && !contentType.includes("json")) return null
    const raw = (await response.text()).slice(0, 60000)
    return {
      url,
      raw,
      text: stripHtml(raw),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeSourceStatus(input: {
  mode: AcquisitionLeadSourceStatus["mode"]
  provider: string
  path?: string | null
  note: string
  capabilities?: string[]
}): AcquisitionLeadSourceStatus {
  return {
    mode: input.mode,
    provider: input.provider,
    path: input.path ?? null,
    note: input.note,
    capabilities: input.capabilities || [],
  }
}

async function readFileLeadSource(): Promise<{ provider: string; leads: CrawlerLead[]; status: AcquisitionLeadSourceStatus }> {
  const sourcePath = resolveLeadSourcePath()

  try {
    const raw = await readFile(sourcePath.absolute, "utf8")
    const parsed = JSON.parse(raw) as unknown
    const payload = Array.isArray(parsed) ? ({ provider: "JSON import", leads: parsed } satisfies LeadSourcePayload) : (parsed as LeadSourcePayload)
    const provider = safeString(payload.provider, "JSON import")
    const rawLeads = Array.isArray(payload.leads) ? payload.leads : Array.isArray(parsed) ? parsed : []
    const leads = rawLeads
      .map((item, index) => normalizeLead((item || {}) as RawLeadInput, index))
      .filter((item): item is CrawlerLead => Boolean(item))
      .filter((item) => item.publicContactOnly)

    return {
      provider,
      leads,
      status: normalizeSourceStatus({
        mode: "configured",
        provider,
        path: sourcePath.displayPath,
        note: leads.length
          ? `Loaded ${leads.length} public business contacts from ${sourcePath.displayPath}.`
          : "Imported lead file is configured, but it currently contains no valid public business contacts.",
        capabilities: ["local import", "manual curation", "review-first"],
      }),
    }
  } catch (error) {
    const code = String((error as NodeJS.ErrnoException)?.code || "")
    const note =
      code === "ENOENT"
        ? `No lead source found at ${sourcePath.displayPath}. Add a JSON file or switch MARKET_LEAD_SOURCE_PROVIDER to a live provider.`
        : `Lead source at ${sourcePath.displayPath} could not be read. Check that the JSON structure is valid.`

    return {
      provider: "Unconfigured",
      leads: [],
      status: normalizeSourceStatus({
        mode: "missing",
        provider: sourcePath.explicitlyConfigured ? "Configured file" : "Local JSON import",
        path: sourcePath.displayPath,
        note,
        capabilities: ["fallback import"],
      }),
    }
  }
}

function buildLeadQueries(input: CrawlerRunInput) {
  const keyword = safeString(input.keyword)
  const platform = safeString(input.platform, "web")
  const regionLabel = input.region === "CN" ? "China" : input.region === "INTL" ? "international" : "global"
  const regionLabelZh = input.region === "CN" ? "中国" : input.region === "INTL" ? "海外" : "全球"
  const segmentQuery =
    input.targetType === "blogger"
      ? {
          zh: "博主 OR 创作者 OR KOL 商务合作 联系方式",
          en: "creator OR influencer OR KOL brand partnership contact",
        }
      : input.targetType === "vc"
        ? {
            zh: "VC OR 投资机构 合作邮箱 OR 合伙人 联系方式",
            en: "venture capital firm partner email OR platform team contact",
          }
        : {
            zh: "ToB 企业 商务合作 邮箱 OR business development contact",
            en: "B2B company business development email OR partnerships contact",
          }

  if (input.locale === "zh") {
    return uniqueStrings([
      `${keyword || "AI"} ${platform} ${segmentQuery.zh}`,
      `${keyword || "AI"} ${regionLabelZh} ${segmentQuery.zh}`,
      `${platform} ${segmentQuery.zh}`,
    ]).slice(0, 3)
  }

  return uniqueStrings([
    `${keyword || "AI"} ${platform} ${segmentQuery.en}`,
    `${keyword || "AI"} ${regionLabel} ${segmentQuery.en}`,
    `${platform} ${segmentQuery.en}`,
  ]).slice(0, 3)
}

function buildExpandedLeadQueries(input: CrawlerRunInput) {
  const profile = getCrawlerProfile(input)
  const keyword = safeString(input.keyword, "AI")
  const platform = safeString(input.platform, "web")
  const regionLabel = input.region === "CN" ? "China" : input.region === "INTL" ? "international" : "global"
  const regionLabelZh = input.region === "CN" ? "中国" : input.region === "INTL" ? "海外" : "全球"
  const siteFilter =
    platform === "xiaohongshu"
      ? "site:xiaohongshu.com"
      : platform === "douyin"
        ? "site:douyin.com"
        : platform === "bilibili"
          ? "site:bilibili.com"
          : platform === "weibo"
            ? "site:weibo.com"
            : platform === "linkedin"
              ? "site:linkedin.com"
              : platform === "x"
                ? "(site:x.com OR site:twitter.com)"
                : ""

  const segmentTerms =
    input.targetType === "blogger"
      ? ["creator", "influencer", "KOL", "brand partnership", "business contact"]
      : input.targetType === "vc"
        ? ["venture capital", "fund", "partner", "platform team", "investor relations"]
        : ["B2B company", "SaaS", "business development", "partnership", "contact"]
  const segmentTermsZh =
    input.targetType === "blogger"
      ? ["博主", "创作者", "KOL", "品牌合作", "商务联系"]
      : input.targetType === "vc"
        ? ["投资机构", "基金", "合伙人", "平台团队", "投资者关系"]
        : ["ToB 企业", "SaaS", "商务拓展", "合作伙伴", "联系我们"]

  const contactTerms = ["email", "contact us", "business inquiry", "partnership", "marketing", "BD"]
  const contactTermsZh = ["邮箱", "联系方式", "商务合作", "联系我们", "市场合作", "BD"]

  return uniqueStrings([
    ...buildLeadQueries(input),
    ...segmentTerms.flatMap((segment) =>
      uniqueStrings([
        `${keyword} ${segment} ${siteFilter}`.trim(),
        `${platform} ${segment} ${contactTerms.join(" OR ")}`.trim(),
        `${keyword} ${regionLabel} ${segment}`.trim(),
      ]),
    ),
    ...segmentTermsZh.flatMap((segment) =>
      uniqueStrings([
        `${keyword} ${segment}`.trim(),
        `${platform} ${segment} ${contactTermsZh.join(" OR ")}`.trim(),
        `${regionLabelZh} ${segment}`.trim(),
      ]),
    ),
  ]).slice(0, Math.max(profile.queryCount * 3, 12))
}

function getProviderStatus(): AcquisitionLeadSourceStatus {
  const runtime = resolveLeadProviderRuntime()

  if (runtime === "tavily") {
    const configured = Boolean(safeString(process.env.TAVILY_API_KEY))
    return normalizeSourceStatus({
      mode: configured ? "live" : "missing",
      provider: "Tavily live web search",
      path: configured ? "TAVILY_API_KEY" : null,
      note: configured
        ? "Live web search is enabled. Queries public pages and extracts public business contact methods at runtime."
        : "Tavily provider is selected but TAVILY_API_KEY is missing.",
      capabilities: ["live web search", "public email extraction", "review-first"],
    })
  }

  if (runtime === "serper") {
    const configured = Boolean(safeString(process.env.SERPER_API_KEY))
    return normalizeSourceStatus({
      mode: configured ? "live" : "missing",
      provider: "Serper live search",
      path: configured ? "SERPER_API_KEY" : null,
      note: configured
        ? "Serper is enabled. Search results are crawled at runtime to extract public business contact methods."
        : "Serper provider is selected but SERPER_API_KEY is missing.",
      capabilities: ["google-style search", "page crawl", "public contact extraction"],
    })
  }

  if (runtime === "webhook") {
    const webhookUrl = safeString(process.env.MARKET_LEAD_SOURCE_WEBHOOK_URL)
    return normalizeSourceStatus({
      mode: webhookUrl ? "live" : "missing",
      provider: "Lead source webhook",
      path: webhookUrl || null,
      note: webhookUrl
        ? "Webhook provider is enabled. The server expects normalized public-contact leads or raw search results from your connector."
        : "Webhook provider is selected but MARKET_LEAD_SOURCE_WEBHOOK_URL is missing.",
      capabilities: ["custom connector", "live enrichment", "review-first"],
    })
  }

  return normalizeSourceStatus({
    mode: "configured",
    provider: "Local JSON import",
    path: resolveLeadSourcePath().displayPath,
    note: "Using imported leads from a local JSON file. Switch provider to Tavily, Serper, or webhook for live discovery.",
    capabilities: ["local import", "manual curation"],
  })
}

function getRegionCode(region: string) {
  if (region === "CN") return { hl: "zh-cn", gl: "cn" }
  if (region === "INTL") return { hl: "en", gl: "us" }
  return { hl: "en", gl: "us" }
}

async function searchWithTavily(input: CrawlerRunInput, limit: number) {
  const apiKey = safeString(process.env.TAVILY_API_KEY)
  if (!apiKey) return []

  const profile = getCrawlerProfile(input)
  const queries = buildExpandedLeadQueries(input)
  const results: SearchDocument[] = []

  for (const query of queries) {
    const payload = await readJsonFromUrl("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        topic: "general",
        search_depth: profile.mode === "deep" ? "advanced" : "basic",
        include_answer: false,
        include_raw_content: true,
        max_results: getProviderResultLimit(limit, input),
      }),
    })

    const documents = Array.isArray((payload as { results?: unknown[] }).results) ? (payload as { results: unknown[] }).results : []
    for (const result of documents) {
      const item = result as Record<string, unknown>
      const url = safeString(item.url)
      if (!url) continue
      results.push({
        title: safeString(item.title, url),
        url,
        snippet: safeString(item.content),
        content: safeString(item.raw_content),
        sourceLabel: "Tavily search",
      })
    }
  }

  return dedupeDocuments(results)
}

async function searchWithSerper(input: CrawlerRunInput, limit: number) {
  const apiKey = safeString(process.env.SERPER_API_KEY)
  if (!apiKey) return []

  const queries = buildExpandedLeadQueries(input)
  const regionCode = getRegionCode(input.region)
  const results: SearchDocument[] = []

  for (const query of queries) {
    const payload = await readJsonFromUrl("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        q: query,
        hl: regionCode.hl,
        gl: regionCode.gl,
        num: getProviderResultLimit(limit, input),
      }),
    })

    const documents = Array.isArray((payload as { organic?: unknown[] }).organic) ? (payload as { organic: unknown[] }).organic : []
    for (const result of documents) {
      const item = result as Record<string, unknown>
      const url = safeString(item.link)
      if (!url) continue
      results.push({
        title: safeString(item.title, url),
        url,
        snippet: safeString(item.snippet),
        content: "",
        sourceLabel: "Serper search",
      })
    }
  }

  return dedupeDocuments(results)
}

async function searchWithWebhook(input: CrawlerRunInput, limit: number) {
  const webhookUrl = safeString(process.env.MARKET_LEAD_SOURCE_WEBHOOK_URL)
  if (!webhookUrl) return { leads: [] as CrawlerLead[], documents: [] as SearchDocument[] }

  const payload = await readJsonFromUrl(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "run_market_lead_discovery",
      targetType: input.targetType,
      keyword: input.keyword,
      platform: input.platform,
      region: input.region,
      locale: input.locale,
      mode: getCrawlerMode(input),
      limit,
      publicContactOnly: true,
      maxContactsPerRun: MAX_CRAWLER_CONTACTS,
    }),
  })

  const normalizedLeadItems = Array.isArray((payload as { leads?: unknown[] }).leads)
    ? (payload as { leads: unknown[] }).leads
    : Array.isArray(payload)
      ? payload
      : []

  const leads = normalizedLeadItems
    .map((item, index) => normalizeLead((item || {}) as RawLeadInput, index))
    .filter((item): item is CrawlerLead => Boolean(item))
    .filter((item) => item.publicContactOnly)

  const documents = Array.isArray((payload as { results?: unknown[] }).results)
    ? (payload as { results: unknown[] }).results
        .map((result) => {
          const item = result as Record<string, unknown>
          const url = safeString(item.url)
          if (!url) return null
          return {
            title: safeString(item.title, url),
            url,
            snippet: safeString(item.snippet),
            content: safeString(item.content),
            sourceLabel: safeString(item.sourceLabel, "Webhook connector"),
          } satisfies SearchDocument
        })
        .filter((item): item is SearchDocument => Boolean(item))
    : []

  return { leads, documents }
}

function matchesTargetType(lead: CrawlerLead, targetType: CrawlerRunInput["targetType"]) {
  return lead.segment === targetType
}

function matchesPlatform(lead: CrawlerLead, platform: string) {
  const normalized = safeString(platform).toLowerCase()
  if (!normalized) return true
  return safeString(lead.platform).toLowerCase().includes(normalized)
}

function matchesRegion(lead: CrawlerLead, region: string) {
  const normalized = safeString(region).toLowerCase()
  if (!normalized || normalized === "global") return true
  return safeString(lead.region).toLowerCase() === normalized
}

function matchesKeyword(lead: CrawlerLead, keyword: string) {
  const normalized = safeString(keyword).toLowerCase()
  if (!normalized) return true

  const haystack = [
    lead.title,
    lead.organization,
    lead.note,
    lead.suggestedAngle,
    lead.sourceLabel,
    lead.contactRole,
    lead.contactName,
    lead.contactValue,
    ...getLeadContacts(lead).flatMap((contact) => [contact.name, contact.role, contact.channel, contact.value, contact.label || "", contact.note || ""]),
    lead.platform,
    lead.region,
  ]
    .join(" ")
    .toLowerCase()

  return haystack.includes(normalized)
}

function dedupeDocuments(documents: SearchDocument[]) {
  const seenUrls = new Set<string>()
  const seenTitleKeys = new Set<string>()
  return documents.filter((document) => {
    const canonicalUrl = canonicalizeUrl(document.url)
    const hostname = safeString(canonicalUrl).replace(/^https?:\/\//, "").split("/")[0]
    const titleKey = normalizeTextForDedupe(document.title)
    if (!canonicalUrl || seenUrls.has(canonicalUrl)) return false
    if (hostname && titleKey) {
      const hostTitleKey = `${hostname}:${titleKey}`
      if (seenTitleKeys.has(hostTitleKey)) return false
      seenTitleKeys.add(hostTitleKey)
    }
    seenUrls.add(canonicalUrl)
    return true
  })
}

function toHostnameLabel(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "")
    return hostname
      .split(".")
      .slice(0, -1)
      .join(" ")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase())
  } catch {
    return "Public contact"
  }
}

function splitTitleParts(title: string) {
  return title
    .split(/[|:：;,_\-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function isGenericOrganizationPart(value: string) {
  const normalized = normalizeOrganizationKey(value)
  if (!normalized) return true
  if (normalized.length > 40) return true
  if (/^(company|official|contact|about|team|news|report|annual|sustainability|press|media)$/i.test(normalized)) return true
  if (/^(?:公司公告|公告|报告|官网|加入我们|联系我们|联络我们|关于我们|关于|首页|新闻|财经|媒体|合作|联系方式)$/.test(value.trim())) return true
  if (!/[\p{L}\p{N}]/u.test(normalized)) return true
  return false
}

function extractOrganizationFromTitle(title: string, fallbackUrl: string) {
  const normalizedTitle = normalizeWhitespace(title)
  const announcementMatch = normalizedTitle.match(/公司公告[_\s-]*([^:：|｜-]{2,40})/i)
  if (announcementMatch?.[1]) return announcementMatch[1].trim()

  const parts = splitTitleParts(normalizedTitle)
  const bestPart = parts.find((part) => !isGenericOrganizationPart(part))
  if (bestPart) return bestPart

  return toHostnameLabel(fallbackUrl)
}

function detectContactRole(text: string, segment: LeadSegment) {
  const normalized = text.toLowerCase()
  const roleMatches = [
    "business development",
    "partnerships",
    "marketing",
    "creator partnerships",
    "brand partnerships",
    "investor relations",
    "partner",
    "founder",
    "商务合作",
    "市场合作",
    "投资者关系",
  ]

  const matched = roleMatches.find((role) => normalized.includes(role.toLowerCase()))
  if (matched) return matched
  if (segment === "blogger") return "Brand partnership contact"
  if (segment === "vc") return "Partner / platform contact"
  return "Business development contact"
}

function deriveContactIdentity(document: SearchDocument, segment: LeadSegment) {
  const titleParts = splitTitleParts(document.title)
  const organization = extractOrganizationFromTitle(document.title, document.url)
  const firstPart = titleParts.find((part) => !isGenericOrganizationPart(part)) || organization
  const contactName =
    firstPart.toLowerCase().includes(organization.toLowerCase()) || firstPart.length > 40 || isGenericOrganizationPart(firstPart)
      ? `${organization} team`
      : firstPart

  const role = detectContactRole(`${document.title} ${document.snippet} ${document.content}`, segment)
  return {
    organization,
    contactName,
    contactRole: role,
  }
}

function extractEmails(text: string) {
  const matches = text.match(EMAIL_REGEX) || []
  return uniqueStrings(
    matches.filter((email) => {
      const normalized = email.toLowerCase()
      return !normalized.endsWith(".png") && !normalized.endsWith(".jpg") && !normalized.includes("example.")
    }),
  )
}

function extractLinkedinUrls(text: string) {
  return uniqueStrings(text.match(LINKEDIN_REGEX) || [])
}

function extractWechatContacts(text: string) {
  return uniqueStrings(Array.from(text.matchAll(WECHAT_REGEX)).map((match) => safeString(match[1])))
}

function extractTelegramContacts(text: string) {
  return uniqueStrings([
    ...(text.match(TELEGRAM_URL_REGEX) || []),
    ...Array.from(text.matchAll(TELEGRAM_HANDLE_REGEX))
      .map((match) => safeString(match[1]))
      .filter(Boolean)
      .map((value) => (value.startsWith("@") ? value : `@${value}`)),
  ])
}

function extractWhatsappContacts(text: string) {
  return uniqueStrings([
    ...(text.match(WHATSAPP_URL_REGEX) || []),
    ...Array.from(text.matchAll(WHATSAPP_PHONE_REGEX))
      .map((match) => safeString(match[1]))
      .filter(Boolean)
      .map((value) => value.replace(/\s+/g, "")),
  ])
}

function matchesAnyPattern(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => new RegExp(pattern.source, pattern.flags.replace(/g/g, "")).test(value))
}

function countPatternMatches(value: string, patterns: RegExp[]) {
  return patterns.reduce(
    (count, pattern) => count + (new RegExp(pattern.source, pattern.flags.replace(/g/g, "")).test(value) ? 1 : 0),
    0,
  )
}

function resolveUrlLike(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return ""
  }
}

function extractAnchorTargets(rawHtml: string, baseUrl: string) {
  return Array.from(rawHtml.matchAll(ANCHOR_TAG_REGEX))
    .map((match) => {
      const href = safeString(match[1])
      const label = stripHtml(safeString(match[2]))
      const url = resolveUrlLike(href, baseUrl)
      return { href, label, url }
    })
    .filter((entry) => Boolean(entry.href) && Boolean(entry.url))
}

function extractMailtoEmails(rawHtml: string) {
  return uniqueStrings(
    Array.from(rawHtml.matchAll(MAILTO_REGEX))
      .flatMap((match) => decodeURIComponent(safeString(match[1])).split("?")[0].split(/[;,]/))
      .flatMap((value) => extractEmails(value)),
  )
}

function extractHrefUrls(rawHtml: string, baseUrl: string, matcher: (value: string) => boolean) {
  return uniqueStrings(
    extractAnchorTargets(rawHtml, baseUrl)
      .map((entry) => entry.url)
      .filter((value) => matcher(value)),
  )
}

function isLikelyContactUrl(value: string) {
  return matchesAnyPattern(value, HIGH_SIGNAL_SOURCE_PATTERNS)
}

function isLowSignalUrl(value: string) {
  return matchesAnyPattern(value, LOW_SIGNAL_SOURCE_PATTERNS)
}

function extractCandidateContactUrls(rawHtml: string, baseUrl: string, input?: Pick<CrawlerRunInput, "mode"> | CrawlerMode | null) {
  const profile = getCrawlerProfile(input)
  const hrefMatches = Array.from(rawHtml.matchAll(/href=["']([^"'#]+)["']/gi))
  const keywords = ["contact", "about", "team", "business", "partner", "press", "media", "合作", "联系", "商务", "关于"]

  return uniqueStrings(
    hrefMatches
      .map((match) => safeString(match[1]))
      .filter(Boolean)
      .map((href) => {
        try {
          return new URL(href, baseUrl).toString()
        } catch {
          return ""
        }
      })
      .filter((url) => {
        const normalized = url.toLowerCase()
        return keywords.some((keyword) => normalized.includes(keyword))
      }),
  ).slice(0, profile.contactPagesPerDocument)
}

function isLikelyValidEmail(email: string, sourceUrl: string, segment: LeadSegment) {
  const normalized = email.toLowerCase()
  if (!normalized.includes("@")) return false
  if (["example.", "noreply", "no-reply", "donotreply", "do-not-reply", "privacy@", "abuse@", "copyright@"].some((flag) => normalized.includes(flag))) {
    return false
  }

  const freeMailboxDomains = ["gmail.com", "outlook.com", "hotmail.com", "qq.com", "163.com", "126.com", "yahoo.com"]
  const emailDomain = normalized.split("@")[1] || ""
  try {
    const sourceHostname = new URL(sourceUrl).hostname.replace(/^www\./, "")
    if (sourceHostname.endsWith(emailDomain) || emailDomain.endsWith(sourceHostname)) return true
  } catch {
    return true
  }

  if (segment === "blogger" && freeMailboxDomains.includes(emailDomain)) return true
  return !freeMailboxDomains.includes(emailDomain)
}

function extractXContacts(text: string, sourceUrl = "") {
  const urlMatches = uniqueStrings(text.match(X_URL_REGEX) || [])
  const sourceIsX = /(?:twitter\.com|x\.com)/i.test(sourceUrl)
  const contextIsX = /(twitter|x\.com|x profile|twitter profile|推特|x 平台)/i.test(text)
  const handleMatches = sourceIsX || contextIsX
    ? Array.from(text.matchAll(AT_HANDLE_REGEX))
        .map((match) => match[0].trim())
        .filter((value) => value.startsWith("@"))
    : []
  return uniqueStrings([...urlMatches, ...handleMatches])
}

function collectWebsiteContact(document: SearchDocument, text: string) {
  const normalized = text.toLowerCase()
  const loweredUrl = document.url.toLowerCase()
  if (["/contact", "/about", "/team", "/partners", "/business", "/press", "/media"].some((token) => loweredUrl.includes(token))) return document.url
  if (normalized.includes("contact us") || normalized.includes("business inquiries") || normalized.includes("联系我们") || normalized.includes("商务合作")) {
    return document.url
  }
  return ""
}

function scoreLead(document: SearchDocument, contactChannel: LeadChannel, input: CrawlerRunInput) {
  let score = 62
  const haystack = `${document.title} ${document.snippet} ${document.content}`.toLowerCase()
  if (safeString(input.keyword) && haystack.includes(input.keyword.toLowerCase())) score += 10
  if (safeString(input.platform) && haystack.includes(input.platform.toLowerCase())) score += 6
  if (safeString(input.region) && haystack.includes(input.region.toLowerCase())) score += 4
  if (contactChannel === "email") score += 12
  if (["dm", "institution", "agency", "linkedin", "wechat", "telegram", "whatsapp", "x"].includes(contactChannel)) score += 7
  if (contactChannel === "website") score += 5
  if (/contact|about|team|partner|business|press|media/i.test(document.url)) score += 6
  if (/business|partnership|marketing|bd|contact/i.test(haystack)) score += 5
  return Math.min(score, 96)
}

function extractCandidateContactUrlsEnhanced(rawHtml: string, baseUrl: string, input?: Pick<CrawlerRunInput, "mode"> | CrawlerMode | null) {
  const profile = getCrawlerProfile(input)
  let baseHost = ""
  try {
    baseHost = new URL(baseUrl).hostname.replace(/^www\./i, "")
  } catch {
    baseHost = ""
  }

  return uniqueStrings(
    extractAnchorTargets(rawHtml, baseUrl)
      .filter((entry) => {
        if (!entry.url || entry.url.startsWith("mailto:") || entry.url.startsWith("tel:")) return false
        try {
          const hostname = new URL(entry.url).hostname.replace(/^www\./i, "")
          return !baseHost || hostname === baseHost
        } catch {
          return false
        }
      })
      .filter((entry) => {
        const normalized = `${entry.url} ${entry.label}`.toLowerCase()
        return isLikelyContactUrl(normalized) && !isLowSignalUrl(normalized)
      })
      .map((entry) => entry.url),
  ).slice(0, profile.contactPagesPerDocument)
}

function collectWebsiteContactsEnhanced(document: SearchDocument, pageSnapshots: PageSnapshot[], text: string) {
  const candidates = [
    ...pageSnapshots
      .filter((item) => isLikelyContactUrl(item.url) || matchesAnyPattern(item.text, DIRECT_CONTACT_PATTERNS))
      .map((item) => item.url),
  ]

  if (isLikelyContactUrl(document.url) || matchesAnyPattern(text, DIRECT_CONTACT_PATTERNS)) {
    candidates.push(document.url)
  }

  return uniqueStrings(candidates).slice(0, 2)
}

function assessLeadSourceDocument(
  document: SearchDocument,
  primaryPage: PageSnapshot | null,
  pageSnapshots: PageSnapshot[],
  combinedText: string,
  input: CrawlerRunInput,
) {
  const fullSignal = `${document.url}\n${pageSnapshots.map((item) => item.url).join("\n")}\n${document.title}\n${document.snippet}\n${document.content}\n${combinedText}`
  const normalizedSignal = fullSignal.toLowerCase()
  const strongContactIntent = matchesAnyPattern(fullSignal, HIGH_SIGNAL_SOURCE_PATTERNS) || matchesAnyPattern(fullSignal, DIRECT_CONTACT_PATTERNS)
  const lowSignalCount = countPatternMatches(fullSignal, LOW_SIGNAL_SOURCE_PATTERNS)
  const brokenPage = matchesAnyPattern(fullSignal, BROKEN_PAGE_PATTERNS)
  const thinSearchResult = document.snippet.length + document.content.length < 160

  let qualityScore = 0
  if (primaryPage) qualityScore += 8
  else qualityScore -= 6

  if (pageSnapshots.length > 1) qualityScore += 4
  if (combinedText.length >= 500) qualityScore += 6
  else if (combinedText.length >= 220) qualityScore += 3
  else qualityScore -= 5

  if (strongContactIntent) qualityScore += 8
  if (matchesAnyPattern(fullSignal, DIRECT_CONTACT_PATTERNS)) qualityScore += 4
  if (safeString(input.keyword) && normalizedSignal.includes(input.keyword.toLowerCase())) qualityScore += 4
  if (safeString(input.platform) && normalizedSignal.includes(input.platform.toLowerCase())) qualityScore += 3
  qualityScore -= lowSignalCount * 4
  if (brokenPage) qualityScore -= 12

  return {
    qualityScore,
    openedPrimaryPage: Boolean(primaryPage),
    shouldSkip:
      brokenPage ||
      (!primaryPage && !strongContactIntent && thinSearchResult) ||
      (qualityScore < 2 && !strongContactIntent) ||
      (lowSignalCount >= 3 && !strongContactIntent),
  }
}

function scoreLeadWithSignals(
  document: SearchDocument,
  contactChannel: LeadChannel,
  input: CrawlerRunInput,
  options: {
    qualityScore: number
    contactCount: number
    openedPrimaryPage: boolean
  },
) {
  let score = scoreLead(document, contactChannel, input)
  if (options.openedPrimaryPage) score += 4
  if (options.contactCount > 1) score += Math.min(10, (options.contactCount - 1) * 2)
  score += Math.max(-12, Math.min(12, options.qualityScore))
  return Math.max(35, Math.min(score, 98))
}

function isPreviewLeadUrl(url: string) {
  return /\/market\/acquisition\/distribution\/lead-preview\?/i.test(url)
}

function buildSuggestedAngle(segment: LeadSegment, keyword: string, platform: string, locale: "zh" | "en" = "en") {
  const cleanKeyword = safeString(keyword, "your product")
  const channel = platform || (locale === "zh" ? "目标渠道" : "channel")

  if (locale === "zh") {
    if (segment === "blogger") {
      return `建议从 ${channel} 的低门槛内容合作切入，围绕 ${cleanKeyword} 提供体验包、粉丝福利和分成方案。`
    }
    if (segment === "vc") {
      return `建议从市场机会、产品验证进展以及 ${cleanKeyword} 对基金平台或被投网络的协同价值切入。`
    }
    return `建议先展示具体业务场景、可落地 Demo 和 ${cleanKeyword} 带来的业务价值，再推进合作沟通。`
  }

  if (segment === "blogger") {
    return `Lead with a low-lift ${channel} content angle, creator package, fan discount, and revenue-share terms around ${cleanKeyword}.`
  }
  if (segment === "vc") {
    return `Lead with portfolio value, market traction, and why ${cleanKeyword} is relevant to the fund's platform or founder network.`
  }
  return `Lead with a concrete use case, demo bundle, and business value of ${cleanKeyword} for the target company.`
}

async function buildLeadsFromDocuments(documents: SearchDocument[], input: CrawlerRunInput, limit: number) {
  const profile = getCrawlerProfile(input)
  const results: CrawlerLead[] = []
  const seenDocuments = new Set<string>()
  const seen = new Set<string>()
  const uniqueOrganizations = new Set<string>()

  for (const document of documents.slice(0, getSearchResultFetchLimit(limit, input))) {
    const primaryPage = await readPageSnapshot(document.url, input)
    const relatedPages = primaryPage
      ? await Promise.all(
          extractCandidateContactUrlsEnhanced(primaryPage.raw, document.url, input)
            .slice(0, profile.contactPagesPerDocument)
            .map((url) => readPageSnapshot(url, input)),
        )
      : []
    const pageSnapshots = [primaryPage, ...relatedPages].filter((item): item is PageSnapshot => Boolean(item))
    const rawCombined = [document.content, ...pageSnapshots.map((item) => item.raw)].filter(Boolean).join("\n")
    const combinedText = normalizeWhitespace(
      [document.title, document.snippet, document.content, ...pageSnapshots.map((item) => item.text)].filter(Boolean).join("\n"),
    )
    if (!combinedText) continue

    const assessment = assessLeadSourceDocument(document, primaryPage, pageSnapshots, combinedText, input)
    if (assessment.shouldSkip) continue

    const identity = deriveContactIdentity(document, input.targetType)
    const organizationKey = normalizeOrganizationKey(identity.organization) || normalizeTextForDedupe(document.title)
    if (!organizationKey && !assessment.openedPrimaryPage) continue
    const documentKey = `${organizationKey}:${canonicalizeUrl(document.url)}`
    if (seenDocuments.has(documentKey)) continue
    seenDocuments.add(documentKey)

    const emailValues = uniqueStrings([...extractEmails(combinedText), ...extractMailtoEmails(rawCombined)])
    const linkedinValues = uniqueStrings([
      ...extractLinkedinUrls(combinedText),
      ...extractHrefUrls(rawCombined, document.url, (value) => /https?:\/\/(?:[\w-]+\.)?linkedin\.com\//i.test(value)),
    ])
    const telegramValues = uniqueStrings([
      ...extractTelegramContacts(combinedText),
      ...extractHrefUrls(rawCombined, document.url, (value) => /https?:\/\/(?:t\.me|telegram\.me)\//i.test(value)),
    ])
    const whatsappValues = uniqueStrings([
      ...extractWhatsappContacts(combinedText),
      ...extractHrefUrls(rawCombined, document.url, (value) => /https?:\/\/(?:wa\.me|api\.whatsapp\.com)\//i.test(value)),
    ])
    const xValues = uniqueStrings([
      ...extractXContacts(combinedText, document.url),
      ...extractHrefUrls(rawCombined, document.url, (value) => /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\//i.test(value)),
    ])

    const contactCandidates: LeadContactCandidate[] = [
      ...emailValues
        .filter((value) => isLikelyValidEmail(value, document.url, input.targetType))
        .map((value) => ({ channel: "email" as const, value, name: identity.contactName, role: identity.contactRole, isPrimary: true })),
      ...linkedinValues.map((value) => ({ channel: "linkedin" as const, value, name: identity.contactName, role: identity.contactRole })),
      ...extractWechatContacts(combinedText).map((value) => ({ channel: "wechat" as const, value, name: identity.contactName, role: identity.contactRole })),
      ...telegramValues.map((value) => ({ channel: "telegram" as const, value, name: identity.contactName, role: identity.contactRole })),
      ...whatsappValues.map((value) => ({ channel: "whatsapp" as const, value, name: identity.contactName, role: identity.contactRole })),
      ...xValues.map((value) => ({ channel: "x" as const, value, name: identity.contactName, role: identity.contactRole })),
    ]

    const normalizedPlatform = safeString(input.platform, "web").toLowerCase()
    if (input.targetType === "blogger" && normalizedPlatform && !["website", "linkedin", "x"].includes(normalizedPlatform)) {
      contactCandidates.push({
        channel: "dm",
        value: document.url,
        name: identity.contactName,
        role: identity.contactRole,
        label: `${normalizedPlatform} DM`,
        note: "Use the profile page for a manual DM follow-up.",
      })
    }

    for (const websiteContact of collectWebsiteContactsEnhanced(document, pageSnapshots, combinedText)) {
      contactCandidates.push({
        channel: "website",
        value: websiteContact,
        name: identity.organization,
        role: identity.contactRole,
        label: "Public contact page",
      })
    }

    const contacts = dedupeLeadContacts(
      contactCandidates
        .map((candidate) =>
          normalizeLeadContact(candidate, {
            organization: identity.organization,
            fallbackName: identity.contactName,
            fallbackRole: identity.contactRole,
            publicContactOnly: true,
          }),
        )
        .filter((contact): contact is LeadContact => Boolean(contact)),
    ).slice(0, 8)

    if (!contacts.length) continue

    const id = `live-${results.length + 1}`
    const sourceLabel = `${document.sourceLabel} 路 public web result`
    const primaryContact = pickPrimaryLeadContact(contacts) || contacts[0]
    const fit = Math.max(
      ...contacts.map((contact) =>
        scoreLeadWithSignals(document, contact.channel, input, {
          qualityScore: assessment.qualityScore,
          contactCount: contacts.length,
          openedPrimaryPage: assessment.openedPrimaryPage,
        }),
      ),
    )
    results.push(
      createCrawlerLead({
        id,
        segment: input.targetType,
        title: document.title || `${identity.organization} lead`,
        platform: safeString(input.platform, "web"),
        region: safeString(input.region, "Global"),
        url:
          document.url ||
          createLeadPreviewUrl({
            id,
            segment: input.targetType,
            platform: safeString(input.platform, "web"),
            region: safeString(input.region, "Global"),
            organization: identity.organization,
            contactName: primaryContact.name,
            contactRole: primaryContact.role,
            contactChannel: primaryContact.channel,
            contactValue: primaryContact.value,
            sourceLabel,
          }),
        audience: input.targetType === "blogger" ? "Creator audience" : input.targetType === "vc" ? "Investor network" : "Business buyers",
        fit,
        note: "Discovered from public web pages and filtered to public business-contact methods only.",
        organization: identity.organization,
        contacts,
        sourceLabel,
        publicContactOnly: true,
        suggestedAngle: buildSuggestedAngle(input.targetType, input.keyword, input.platform, input.locale),
        primaryContactId: primaryContact.id,
      }),
    )

    if (results.length >= getCrawlerCollectionTarget(limit, input)) {
      return prioritizeLeadResults(results, limit)
    }

    continue

    let documentLeadCount = 0

    for (const candidate of contactCandidates) {
      const organizationKey = normalizeOrganizationKey(identity.organization) || normalizeTextForDedupe(document.title)
      const dedupeKey = `${organizationKey}:${candidate.channel}:${normalizeContactValueForDedupe(candidate.channel, candidate.value)}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      documentLeadCount += 1

      const id = `live-${results.length + 1}`
      const sourceLabel = `${document.sourceLabel} 路 public web result`
      results.push({
        id,
        segment: input.targetType,
        title: document.title || `${identity.organization} lead`,
        platform: safeString(input.platform, "web"),
        region: safeString(input.region, "Global"),
        url: document.url || createLeadPreviewUrl({
          id,
          segment: input.targetType,
          platform: safeString(input.platform, "web"),
          region: safeString(input.region, "Global"),
          organization: identity.organization,
          contactName: identity.contactName,
          contactRole: identity.contactRole,
          contactChannel: candidate.channel,
          contactValue: candidate.value,
          sourceLabel,
        }),
        audience: input.targetType === "blogger" ? "Creator audience" : input.targetType === "vc" ? "Investor network" : "Business buyers",
        fit: scoreLead(document, candidate.channel, input),
        note: "Discovered from public web pages and filtered to public business-contact methods only.",
        organization: identity.organization,
        contactName: identity.contactName,
        contactRole: identity.contactRole,
        contactChannel: candidate.channel,
        contactValue: candidate.value,
        primaryContactId: `${candidate.channel}-${candidate.value}`,
        contacts: [
          {
            id: `${candidate.channel}-${candidate.value}`,
            name: identity.contactName,
            role: identity.contactRole,
            channel: candidate.channel,
            value: candidate.value,
            isPrimary: true,
            isPublicContact: true,
          },
        ],
        sourceLabel,
        publicContactOnly: true,
        suggestedAngle: buildSuggestedAngle(input.targetType, input.keyword, input.platform, input.locale),
      })
      if (organizationKey) uniqueOrganizations.add(organizationKey)

      if (results.length >= Math.max(limit * 3, 48) && uniqueOrganizations.size >= limit) {
        return prioritizeLeadResults(results, limit)
      }

      if (documentLeadCount >= 5) {
        break
      }
    }
  }

  return prioritizeLeadResults(results, limit)
}

function getChannelPriority(channel: LeadChannel) {
  return getLeadChannelPriority(channel)
}

function prioritizeLeadResults(leads: CrawlerLead[], limit: number) {
  const grouped = new Map<string, CrawlerLead>()

  for (const lead of leads) {
    const organizationKey = normalizeOrganizationKey(lead.organization) || normalizeTextForDedupe(lead.title) || lead.id
    const current = grouped.get(organizationKey)
    if (!current) {
      grouped.set(organizationKey, createCrawlerLead({ ...lead, contacts: getLeadContacts(lead), primaryContactId: lead.primaryContactId }))
      continue
    }

    const mergedContacts = dedupeLeadContacts([...getLeadContacts(current), ...getLeadContacts(lead)])
    const preferredPrimary =
      pickPrimaryLeadContact(mergedContacts, current.primaryContactId)?.id ||
      pickPrimaryLeadContact(mergedContacts, lead.primaryContactId)?.id ||
      null

    grouped.set(
      organizationKey,
      createCrawlerLead({
        id: current.id,
        segment: current.segment,
        title: current.title.length >= lead.title.length ? current.title : lead.title,
        platform: current.platform || lead.platform,
        region: current.region || lead.region,
        url: current.url || lead.url,
        audience: current.audience !== "-" ? current.audience : lead.audience,
        fit: Math.max(current.fit, lead.fit),
        note: current.note.length >= lead.note.length ? current.note : lead.note,
        organization: current.organization,
        contacts: mergedContacts,
        sourceLabel: current.sourceLabel.length >= lead.sourceLabel.length ? current.sourceLabel : lead.sourceLabel,
        publicContactOnly: current.publicContactOnly && lead.publicContactOnly,
        suggestedAngle: current.suggestedAngle.length >= lead.suggestedAngle.length ? current.suggestedAngle : lead.suggestedAngle,
        primaryContactId: preferredPrimary,
      }),
    )
  }

  return [...grouped.values()]
    .sort((left, right) => {
      const leftContacts = getLeadContacts(left)
      const rightContacts = getLeadContacts(right)
      if (rightContacts.length !== leftContacts.length) return rightContacts.length - leftContacts.length

      const channelDelta = getChannelPriority(left.contactChannel) - getChannelPriority(right.contactChannel)
      if (channelDelta !== 0) return channelDelta
      if (right.fit !== left.fit) return right.fit - left.fit
      const previewDelta = Number(isPreviewLeadUrl(left.url)) - Number(isPreviewLeadUrl(right.url))
      if (previewDelta !== 0) return previewDelta
      return left.organization.localeCompare(right.organization)
    })
    .slice(0, limit)

  const exactSeen = new Set<string>()
  const deduped = leads
    .filter((lead) => {
      const key = `${normalizeOrganizationKey(lead.organization)}:${lead.contactChannel}:${normalizeContactValueForDedupe(lead.contactChannel, lead.contactValue)}`
      if (!key || exactSeen.has(key)) return false
      exactSeen.add(key)
      return true
    })
    .sort((left, right) => {
      const channelDelta = getChannelPriority(left.contactChannel) - getChannelPriority(right.contactChannel)
      if (channelDelta !== 0) return channelDelta
      if (right.fit !== left.fit) return right.fit - left.fit
      return left.organization.localeCompare(right.organization)
    })

  const selected: CrawlerLead[] = []
  const overflow: CrawlerLead[] = []
  const seenOrganizations = new Set<string>()

  for (const lead of deduped) {
    const organizationKey = normalizeOrganizationKey(lead.organization) || normalizeTextForDedupe(lead.title) || lead.id
    if (!seenOrganizations.has(organizationKey)) {
      seenOrganizations.add(organizationKey)
      selected.push(lead)
    } else {
      overflow.push(lead)
    }
  }

  return [...selected, ...overflow].slice(0, limit)
}

async function runLiveLeadSearch(input: CrawlerRunInput, limit: number) {
  const runtime = resolveLeadProviderRuntime()

  if (runtime === "webhook") {
    const webhook = await searchWithWebhook(input, limit)
    const webhookLeads = webhook.leads
      .filter((lead) => matchesTargetType(lead, input.targetType))
      .filter((lead) => matchesPlatform(lead, input.platform))
      .filter((lead) => matchesRegion(lead, input.region))
      .filter((lead) => matchesKeyword(lead, input.keyword))

    if (webhookLeads.length) return prioritizeLeadResults(webhookLeads, limit)
    return buildLeadsFromDocuments(webhook.documents, input, limit)
  }

  const documents = runtime === "tavily" ? await searchWithTavily(input, limit) : await searchWithSerper(input, limit)
  return buildLeadsFromDocuments(documents, input, limit)
}

function getOutreachTemplateValues(locale: "zh" | "en", lead: CrawlerLead) {
  return getFormalOutreachTemplateValues(locale, lead)
}

function localizeContactRole(locale: "zh" | "en", role: string, segment: LeadSegment) {
  const fallback =
    segment === "blogger"
      ? locale === "zh"
        ? "创作者合作负责人"
        : "Creator partnership lead"
      : segment === "vc"
        ? locale === "zh"
          ? "投资合作负责人"
          : "Investment partnership lead"
        : locale === "zh"
          ? "商务拓展负责人"
          : "Business development lead"

  if (!role.trim()) return fallback
  if (locale !== "zh") return role
  if (/[\u4e00-\u9fff]/.test(role)) return role

  const normalized = role.trim().toLowerCase()
  if (/business development|bd manager|partnership lead|partnership contact/.test(normalized)) return "商务拓展负责人"
  if (/creator partner|brand partnership|content partner/.test(normalized)) return "创作者合作负责人"
  if (/platform partner|investment partner|fund/.test(normalized)) return "投资合作负责人"
  if (/agency/.test(normalized)) return "代理合作联系人"
  if (/regional partnerships/.test(normalized)) return "区域合作负责人"
  return fallback
}

function localizeSuggestedAngle(locale: "zh" | "en", lead: CrawlerLead) {
  if (locale !== "zh") return lead.suggestedAngle
  if (/[\u4e00-\u9fff]/.test(lead.suggestedAngle)) return lead.suggestedAngle

  if (lead.segment === "blogger") {
    return "建议从内容方向匹配、真实体验场景、粉丝权益和合作转化方式切入。"
  }
  if (lead.segment === "vc") {
    return "建议从市场机会、产品验证进展、协同空间和后续对接价值切入。"
  }
  return "建议从明确业务场景、效率提升和可落地 Demo 切入合作沟通。"
}

function getFormalOutreachTemplateValues(locale: "zh" | "en", lead: CrawlerLead) {
  if (lead.segment === "blogger") {
    return {
      contactName: lead.contactName,
      organization: lead.organization,
      platform: lead.platform,
      region: lead.region,
      contactValue: lead.contactValue,
      sourceLabel: lead.sourceLabel,
      contactRole: localizeContactRole(locale, lead.contactRole, lead.segment),
      suggestedAngle: localizeSuggestedAngle(locale, lead),
      segmentLabel: locale === "zh" ? "创作者 / 内容合作伙伴" : "Creator / content partner",
      collaborationHook:
        locale === "zh"
          ? "可以从内容选题、产品体验、粉丝权益和分佣合作几个方向快速试点。"
          : "Lead with content angles, product testing, audience perks, and affiliate upside.",
      valuePoints:
        locale === "zh"
          ? "1. 可直接使用的 demo 素材和测评资料\n2. 粉丝优惠、邀请码和分佣机制\n3. 可复用的后续推广内容"
          : "1. demo assets ready for reviews or walkthroughs\n2. audience discounts, invite codes, and commission setup\n3. reusable post-launch content for follow-up promotion",
    }
  }

  if (lead.segment === "vc") {
    return {
      contactName: lead.contactName,
      organization: lead.organization,
      platform: lead.platform,
      region: lead.region,
      contactValue: lead.contactValue,
      sourceLabel: lead.sourceLabel,
      contactRole: localizeContactRole(locale, lead.contactRole, lead.segment),
      suggestedAngle: localizeSuggestedAngle(locale, lead),
      segmentLabel: locale === "zh" ? "VC / 投资合作伙伴" : "VC / investment partner",
      collaborationHook:
        locale === "zh"
          ? "建议围绕市场机会、产品验证、投后协同和后续跟进价值展开沟通。"
          : "Focus on market opportunity, product validation signals, portfolio fit, and follow-on value.",
      valuePoints:
        locale === "zh"
          ? "1. 产品 demo、市场材料和演示资料\n2. 目标客户与合作路径说明\n3. 便于后续会议和内部同步的精简资料包"
          : "1. product demo and market-facing materials\n2. customer and partnership conversion paths\n3. a concise pack that can support a follow-up conversation",
    }
  }

  return {
    contactName: lead.contactName,
    organization: lead.organization,
    platform: lead.platform,
    region: lead.region,
    contactValue: lead.contactValue,
    sourceLabel: lead.sourceLabel,
    contactRole: localizeContactRole(locale, lead.contactRole, lead.segment),
    suggestedAngle: localizeSuggestedAngle(locale, lead),
    segmentLabel: locale === "zh" ? "ToB 合作伙伴" : "B2B partner",
    collaborationHook:
      locale === "zh"
        ? "建议从明确业务场景、效率收益和可落地 Demo 切入合作讨论。"
        : "Lead with a concrete business use case, workflow efficiency gains, and a practical demo.",
    valuePoints:
      locale === "zh"
        ? "1. 面向业务团队的 demo 资料包\n2. 可复述的效率提升场景与合作价值说明\n3. 便于内部转发和后续跟进的简版材料"
        : "1. a business-ready demo bundle\n2. efficiency and rollout talking points\n3. concise internal-forward materials",
  }
}

function fillTemplate(template: string, lead: CrawlerLead, locale: "zh" | "en" = "en") {
  const values = getFormalOutreachTemplateValues(locale, lead)
  return template
    .replaceAll("{{contactName}}", values.contactName)
    .replaceAll("{{organization}}", values.organization)
    .replaceAll("{{platform}}", values.platform)
    .replaceAll("{{region}}", values.region)
    .replaceAll("{{contactValue}}", values.contactValue)
    .replaceAll("{{sourceLabel}}", values.sourceLabel)
    .replaceAll("{{contactRole}}", values.contactRole)
    .replaceAll("{{suggestedAngle}}", values.suggestedAngle)
    .replaceAll("{{segmentLabel}}", values.segmentLabel)
    .replaceAll("{{collaborationHook}}", values.collaborationHook)
    .replaceAll("{{valuePoints}}", values.valuePoints)
}

function resolveLeadContactByChannel(lead: CrawlerLead, channel: LeadChannel) {
  const contacts = getLeadContacts(lead)
  const activeContact = pickPrimaryLeadContact(contacts, lead.primaryContactId)
  if (activeContact?.channel === channel) return activeContact
  return contacts.find((contact) => contact.channel === channel) || null
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function buildWeChatOaArticleHtml(input: { title: string; body: string; url: string; assetUrl?: string | null }) {
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => `<p>${escapeHtml(segment).replace(/\n/g, "<br>")}</p>`)

  const ctaLink = input.url ? `<p><a href="${escapeHtml(input.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(input.url)}</a></p>` : ""
  const assetLink =
    input.assetUrl && input.assetUrl !== input.url
      ? `<p><a href="${escapeHtml(input.assetUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(input.assetUrl)}</a></p>`
      : ""

  return [`<h1>${escapeHtml(input.title)}</h1>`, ...paragraphs, assetLink, ctaLink].filter(Boolean).join("\n")
}

function isPublicHttpsUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "https:"
  } catch {
    return false
  }
}

async function getWeChatOaAccessToken() {
  const explicitToken = safeString(process.env.WECHAT_OA_ACCESS_TOKEN)
  if (explicitToken) return explicitToken

  const appId = safeString(process.env.WECHAT_OA_APP_ID)
  const appSecret = safeString(process.env.WECHAT_OA_APP_SECRET)
  if (!appId || !appSecret) {
    throw new Error("WECHAT_OA_APP_ID / WECHAT_OA_APP_SECRET not configured")
  }

  const tokenUrl = new URL("https://api.weixin.qq.com/cgi-bin/token")
  tokenUrl.searchParams.set("grant_type", "client_credential")
  tokenUrl.searchParams.set("appid", appId)
  tokenUrl.searchParams.set("secret", appSecret)

  const payload = (await readJsonFromUrl(tokenUrl.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  })) as {
    access_token?: string
    errcode?: number
    errmsg?: string
  }

  if (payload.errcode || !payload.access_token) {
    throw new Error(payload.errmsg || "Failed to fetch WeChat OA access token")
  }

  return payload.access_token
}

async function publishToWeChatOa(params: {
  title: string
  text: string
  url: string
  assetUrl?: string | null
}): Promise<DirectPublishResult> {
  const thumbMediaId = safeString(process.env.WECHAT_OA_THUMB_MEDIA_ID)
  if (!thumbMediaId) {
    return {
      targetId: "wechat-oa",
      targetLabel: "WeChat OA",
      status: "failed",
      message: "Configure WECHAT_OA_THUMB_MEDIA_ID before direct publishing to WeChat OA.",
    }
  }

  if (!isPublicHttpsUrl(params.url)) {
    return {
      targetId: "wechat-oa",
      targetLabel: "WeChat OA",
      status: "failed",
      message: "WeChat OA direct publish requires a public HTTPS landing URL.",
    }
  }

  const accessToken = await getWeChatOaAccessToken()
  const articlePayload = {
    articles: [
      {
        title: params.title,
        author: safeString(process.env.WECHAT_OA_AUTHOR, "OrbitChat Team"),
        digest: safeString(process.env.WECHAT_OA_DIGEST, params.text.slice(0, 120)),
        content: buildWeChatOaArticleHtml({
          title: params.title,
          body: params.text,
          url: params.url,
          assetUrl: params.assetUrl,
        }),
        content_source_url: params.url,
        thumb_media_id: thumbMediaId,
        need_open_comment: 0,
        only_fans_can_comment: 0,
      },
    ],
  }

  const draftResponse = (await readJsonFromUrl(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(articlePayload),
  })) as {
    media_id?: string
    errcode?: number
    errmsg?: string
  }

  if (draftResponse.errcode || !draftResponse.media_id) {
    return {
      targetId: "wechat-oa",
      targetLabel: "WeChat OA",
      status: "failed",
      message: draftResponse.errmsg || "WeChat OA draft creation failed.",
    }
  }

  const publishResponse = (await readJsonFromUrl(`https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ media_id: draftResponse.media_id }),
  })) as {
    publish_id?: string
    errcode?: number
    errmsg?: string
  }

  if (publishResponse.errcode) {
    return {
      targetId: "wechat-oa",
      targetLabel: "WeChat OA",
      status: "failed",
      message: publishResponse.errmsg || "WeChat OA publish submission failed.",
      externalId: draftResponse.media_id,
    }
  }

  return {
    targetId: "wechat-oa",
    targetLabel: "WeChat OA",
    status: "published",
    message: "WeChat OA article submitted for publishing.",
    externalId: publishResponse.publish_id || draftResponse.media_id,
  }
}

async function publishViaConnectorWebhook(params: {
  targetId: string
  targetLabel: string
  webhookUrl: string
  payload: Record<string, unknown>
}): Promise<DirectPublishResult> {
  const response = (await readJsonFromUrl(params.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params.payload),
  })) as {
    success?: boolean
    message?: string
    publishId?: string
    id?: string
  }

  if (response.success === false) {
    return {
      targetId: params.targetId,
      targetLabel: params.targetLabel,
      status: "failed",
      message: response.message || `${params.targetLabel} direct publish failed.`,
      externalId: response.publishId || response.id || null,
    }
  }

  return {
    targetId: params.targetId,
    targetLabel: params.targetLabel,
    status: "published",
    message: response.message || `${params.targetLabel} publish triggered.`,
    externalId: response.publishId || response.id || null,
  }
}

async function publishToDouyin(params: {
  title: string
  text: string
  url: string
  asset: Pick<DemoDistributionAsset, "fileName" | "kind"> & {
    url?: string | null
  }
}): Promise<DirectPublishResult> {
  if (params.asset.kind !== "video") {
    return {
      targetId: "douyin-brand",
      targetLabel: "Douyin",
      status: "failed",
      message: "Douyin direct publish currently requires a video asset.",
    }
  }

  const account = await getActiveDouyinAccount()
  if (!account?.access_token) {
    return {
      targetId: "douyin-brand",
      targetLabel: "Douyin",
      status: "failed",
      message: "Authorize a Douyin brand account before direct publishing.",
    }
  }

  const sourceUrl = safeString(params.asset.url || params.url)
  if (!isPublicHttpsUrl(sourceUrl)) {
    return {
      targetId: "douyin-brand",
      targetLabel: "Douyin",
      status: "failed",
      message: "Douyin direct publish requires a public HTTPS video URL.",
    }
  }

  const assetResponse = await fetch(sourceUrl)
  if (!assetResponse.ok) {
    return {
      targetId: "douyin-brand",
      targetLabel: "Douyin",
      status: "failed",
      message: `Unable to fetch the selected video asset (${assetResponse.status}).`,
    }
  }

  const assetBlob = await assetResponse.blob()
  const formData = new FormData()
  formData.append("video", assetBlob, safeString(params.asset.fileName, "distribution-video.mp4"))
  const openId = safeString(account.open_id)
  const uploadUrl = new URL("https://open.douyin.com/video/upload/")
  if (openId) uploadUrl.searchParams.set("open_id", openId)

  const uploadResponse = await fetch(uploadUrl.toString(), {
    method: "POST",
    headers: {
      "access-token": account.access_token,
    },
    body: formData,
  })

  const uploadPayload = (await uploadResponse.json()) as {
    data?: {
      error_code?: number
      description?: string
      video?: {
        video_id?: string
      }
    }
    extra?: {
      description?: string
    }
  }

  const videoId = safeString(uploadPayload.data?.video?.video_id)
  if (!uploadResponse.ok || !videoId || Number(uploadPayload.data?.error_code || 0) !== 0) {
    return {
      targetId: "douyin-brand",
      targetLabel: "Douyin",
      status: "failed",
      message: uploadPayload.data?.description || uploadPayload.extra?.description || "Douyin video upload failed.",
    }
  }

  const createUrl = new URL("https://open.douyin.com/video/create/")
  if (openId) createUrl.searchParams.set("open_id", openId)

  const createResponse = await fetch(createUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "access-token": account.access_token,
    },
    body: JSON.stringify({
      video_id: videoId,
      text: [params.title, params.text, params.url].filter(Boolean).join("\n\n").slice(0, 2200),
    }),
  })

  const createPayload = (await createResponse.json()) as {
    data?: {
      error_code?: number
      description?: string
      item_id?: string
    }
    extra?: {
      description?: string
    }
  }

  if (!createResponse.ok || Number(createPayload.data?.error_code || 0) !== 0 || !createPayload.data?.item_id) {
    return {
      targetId: "douyin-brand",
      targetLabel: "Douyin",
      status: "failed",
      message: createPayload.data?.description || createPayload.extra?.description || "Douyin publish creation failed.",
      externalId: videoId,
    }
  }

  return {
    targetId: "douyin-brand",
    targetLabel: "Douyin",
    status: "published",
    message: "Douyin video submitted for review and publishing.",
    externalId: createPayload.data.item_id,
  }
}

export async function publishDistributionTarget(params: {
  targetId: string
  title: string
  text: string
  url: string
  asset?: Pick<DemoDistributionAsset, "id" | "title" | "kind" | "fileName"> & {
    url?: string | null
  }
  locale?: "zh" | "en"
}): Promise<DirectPublishResult> {
  const targetId = safeString(params.targetId)
  const assetUrl = safeString(params.asset?.url)

  if (targetId === "wechat-oa") {
    return publishToWeChatOa({
      title: params.title,
      text: params.text,
      url: params.url,
      assetUrl,
    })
  }

  if (targetId === "douyin-brand") {
    return publishToDouyin({
      title: params.title,
      text: params.text,
      url: params.url,
      asset: {
        fileName: safeString(params.asset?.fileName, "distribution-video.mp4"),
        kind: params.asset?.kind || "video",
        url: assetUrl || null,
      },
    })
  }

  return {
    targetId,
    targetLabel: targetId,
    status: "failed",
    message: "Direct publish is not configured for this target.",
  }
}

export async function loadAcquisitionDistributionBootstrap(): Promise<AcquisitionDistributionBootstrap> {
  const manifest = await readDemoManifest()
  const runtime = resolveLeadProviderRuntime()
  const liveStatus = runtime === "file" ? (await readFileLeadSource()).status : getProviderStatus()

  const assets: DemoDistributionAsset[] =
    manifest?.items.map((item) => ({
      id: item.id,
      title: item.title,
      description: `${item.description} 路 ${humanFileSize(item.size)}`,
      url: item.url,
      kind: item.kind,
      fileName: item.fileName,
      size: item.size,
      category: item.category,
      fallback: item.fallback,
    })) || []

  const ownedChannels = await Promise.all(
    DEFAULT_OWNED_CHANNELS.map(async (channel) => {
      if (channel.mode !== "direct") return channel
      try {
        const status = await getDirectPublishChannelConnectionState(channel.id)
        return {
          ...channel,
          hint: status.note || channel.hint,
          isConnected: status.isConnected,
          connectUrl: status.connectUrl,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Connection status is temporarily unavailable."
        return {
          ...channel,
          hint: channel.hint ? `${channel.hint} (${message})` : message,
          isConnected: false,
          connectUrl: channel.id === "douyin-brand" ? "/api/market-admin/admin/acquisition/distribution/douyin/connect" : null,
        }
      }
    }),
  )

  return createAcquisitionDistributionFallbackBootstrap({
    assets,
    sharePlatforms: DEFAULT_SHARE_PLATFORMS,
    ownedChannels,
    leadSource: liveStatus,
    maxContactsPerRun: MAX_CRAWLER_CONTACTS,
  })
}

export async function runAcquisitionCrawler(input: CrawlerRunInput): Promise<CrawlerLead[]> {
  const mode = getCrawlerMode(input)
  const safeLimit = Number.isFinite(input.limit)
    ? Math.min(Math.max(Math.floor(input.limit), 1), MAX_CRAWLER_CONTACTS)
    : 12

  const runtime = resolveLeadProviderRuntime()

  if (runtime === "file") {
    const source = await readFileLeadSource()
    if (source.status.mode !== "configured") {
      return []
    }

    const importedLeads = source.leads
      .filter((lead) => matchesTargetType(lead, input.targetType))
      .filter((lead) => matchesPlatform(lead, input.platform))
      .filter((lead) => matchesRegion(lead, input.region))
      .filter((lead) => matchesKeyword(lead, input.keyword))
      .filter((lead) => lead.publicContactOnly)

    return prioritizeLeadResults(importedLeads.slice(0, getImportedLeadSampleLimit(safeLimit, mode)), safeLimit)
  }

  const sourceStatus = getProviderStatus()
  if (sourceStatus.mode !== "live") {
    return []
  }

  const liveLeads = await runLiveLeadSearch(input, safeLimit)
  return prioritizeLeadResults(
    liveLeads.filter((lead) => lead.publicContactOnly),
    safeLimit,
  )
}

export async function sendOutreachEmailBatch(params: {
  leads: CrawlerLead[]
  subject: string
  body: string
  locale?: "zh" | "en"
}): Promise<OutreachBatchResult> {
  const leads = Array.isArray(params.leads) ? params.leads.slice(0, MAX_CRAWLER_CONTACTS) : []
  const results: OutreachBatchItemResult[] = []
  const seenEmails = new Set<string>()

  for (const lead of leads) {
    const emailContact = resolveLeadContactByChannel(lead, "email")
    if (!emailContact) {
      results.push({
        leadId: lead.id,
        organization: lead.organization,
        contactChannel: lead.contactChannel,
        contactValue: lead.contactValue,
        status: "skipped",
        message: "Only public email contacts can be sent in batch. Other channels stay in review/manual follow-up.",
      })
      continue
    }

    const email = safeString(emailContact.value).toLowerCase()
    if (!email) {
      results.push({
        leadId: lead.id,
        organization: lead.organization,
        contactChannel: emailContact.channel,
        contactValue: emailContact.value,
        status: "skipped",
        message: "Missing email address.",
      })
      continue
    }

    if (seenEmails.has(email)) {
      results.push({
        leadId: lead.id,
        organization: lead.organization,
        contactChannel: emailContact.channel,
        contactValue: emailContact.value,
        status: "skipped",
        message: "Duplicate email skipped in this batch.",
      })
      continue
    }
    seenEmails.add(email)

    const leadForEmail = createCrawlerLead({
      ...lead,
      contacts: getLeadContacts(lead).map((contact) => ({ ...contact, isPrimary: contact.id === emailContact.id })),
      primaryContactId: emailContact.id,
    })
    const result = await sendEmail({
      to: email,
      subject: fillTemplate(params.subject, leadForEmail, params.locale || "en"),
      body: fillTemplate(params.body, leadForEmail, params.locale || "en"),
    })

    results.push({
      leadId: lead.id,
      organization: lead.organization,
      contactChannel: emailContact.channel,
      contactValue: emailContact.value,
      status: result.success ? "sent" : "failed",
      message: result.message,
    })
  }

  return {
    total: results.length,
    sent: results.filter((item) => item.status === "sent").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  }
}
