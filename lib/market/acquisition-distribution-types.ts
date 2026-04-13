import type {
  AcquisitionCrawlerPersistResult,
  AcquisitionOpsBootstrap,
  AcquisitionPartnershipActivationResult,
  AcquisitionReplyPersistResult,
} from "./acquisition-multichannel-types"

export interface DemoDistributionAsset {
  id: string
  title: string
  description: string
  url: string
  kind: "doc" | "pdf" | "ppt" | "html" | "video"
  fileName: string
  size: number
  category: "manual" | "finance" | "deck" | "video"
  fallback?: boolean
}

export interface CrawlerRunInput {
  targetType: "blogger" | "b2b" | "vc"
  keyword: string
  platform: string
  region: string
  limit: number
  mode?: "quick" | "deep"
  locale?: "zh" | "en"
}

export type CrawlerLeadContactChannel =
  | "email"
  | "dm"
  | "wechat"
  | "telegram"
  | "whatsapp"
  | "institution"
  | "agency"
  | "linkedin"
  | "x"
  | "website"

export interface CrawlerLeadContact {
  id: string
  name: string
  role: string
  channel: CrawlerLeadContactChannel
  value: string
  label?: string
  note?: string
  isPrimary: boolean
  isPublicContact: boolean
}

export interface CrawlerLead {
  id: string
  segment: "blogger" | "b2b" | "vc"
  title: string
  platform: string
  region: string
  url: string
  audience: string
  fit: number
  note: string
  organization: string
  contactName: string
  contactRole: string
  contactChannel: CrawlerLeadContactChannel
  contactValue: string
  primaryContactId: string | null
  contacts: CrawlerLeadContact[]
  sourceLabel: string
  publicContactOnly: boolean
  suggestedAngle: string
}

export type DistributionChannelMode = "intent" | "copy" | "direct"

export interface SharePlatformConfig {
  id: string
  label: string
  mode: DistributionChannelMode
  hint: string
}

export interface OwnedDistributionChannel {
  id: string
  label: string
  handle: string
  region: "CN" | "INTL"
  type: "owned"
  mode: DistributionChannelMode
  hint?: string
  isConnected?: boolean
  connectUrl?: string | null
}

export interface AcquisitionGuardrails {
  maxContactsPerRun: number
  publicContactOnly: boolean
  reviewRequired: boolean
  ownedChannelCount: number
}

export interface AcquisitionLeadSourceStatus {
  mode: "configured" | "live" | "missing"
  provider: string
  path: string | null
  note: string
  capabilities: string[]
}

export interface AcquisitionDistributionBootstrap {
  assets: DemoDistributionAsset[]
  sharePlatforms: SharePlatformConfig[]
  ownedChannels: OwnedDistributionChannel[]
  guardrails: AcquisitionGuardrails
  leadSource: AcquisitionLeadSourceStatus
  ops?: AcquisitionOpsBootstrap
}

export interface OutreachBatchItemResult {
  leadId: string
  organization: string
  contactChannel: CrawlerLead["contactChannel"]
  contactValue: string
  status: "sent" | "skipped" | "failed"
  message: string
}

export interface OutreachBatchResult {
  total: number
  sent: number
  skipped: number
  failed: number
  results: OutreachBatchItemResult[]
}

export interface DirectPublishResult {
  targetId: string
  targetLabel: string
  status: "published" | "failed"
  message: string
  externalId?: string | null
}

export type AcquisitionCrawlerPersistSummary = AcquisitionCrawlerPersistResult
export type AcquisitionReplyPersistSummary = AcquisitionReplyPersistResult
export type AcquisitionPartnershipActivationSummary = AcquisitionPartnershipActivationResult
