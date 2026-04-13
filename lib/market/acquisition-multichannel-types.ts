import type { MarketingCoupon, MarketingInvitationCode } from "./marketing-types"

export type AcquisitionPartnerType = "blogger" | "enterprise" | "advertiser" | "vc"

export type AcquisitionLeadSourceType =
  | "crawler"
  | "manual"
  | "import"
  | "referral"
  | "event"
  | "api"

export type AcquisitionContactChannel =
  | "email"
  | "dm"
  | "telegram"
  | "whatsapp"
  | "institution"
  | "agency"
  | "linkedin"
  | "wechat"
  | "x"
  | "website"
  | "phone"
  | "other"

export type AcquisitionLeadStatus =
  | "new"
  | "reviewing"
  | "qualified"
  | "disqualified"
  | "contacted"
  | "replied"
  | "negotiating"
  | "contract_pending"
  | "partner_active"
  | "closed_lost"

export type AcquisitionCrawlerTaskStatus = "draft" | "active" | "paused" | "archived"
export type AcquisitionCrawlerRunStatus = "queued" | "running" | "completed" | "failed" | "partial"
export type AcquisitionOutreachChannel = "email" | "crm_task" | "manual_dm"
export type AcquisitionOutreachStatus = "draft" | "queued" | "sent" | "delivered" | "replied" | "failed" | "cancelled"
export type AcquisitionReplyDisposition = "positive" | "needs_info" | "negotiating" | "negative" | "manual_review"
export type AcquisitionPartnershipStatus = "prospecting" | "qualified" | "proposal_sent" | "negotiating" | "contract_signed" | "active" | "paused" | "closed"
export type AcquisitionTrackingAssetType = "link" | "coupon" | "invite_code" | "qr_code"
export type AcquisitionOrderRevenueType = "first_year" | "renewal" | "lifetime" | "trial_upgrade" | "enterprise_contract"
export type AcquisitionCommissionStatus = "pending" | "approved" | "settled" | "reversed" | "frozen"
export type AcquisitionAdMetricSource = "platform_api" | "crawler_estimate" | "manual"
export type AcquisitionVcPreferenceLevel = "core" | "adjacent" | "opportunistic"

export interface AcquisitionRuleSet {
  id: string
  key: string
  version: number
  scope: "global" | AcquisitionPartnerType
  enabled: boolean
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AcquisitionOrganizationProfile {
  id: string
  partnerType: AcquisitionPartnerType
  name: string
  legalName: string | null
  region: string
  market: "CN" | "US" | "EU" | "GLOBAL" | string
  primaryPlatform: string | null
  domain: string | null
  tags: string[]
  followerMin: number | null
  followerMax: number | null
  estimatedAudienceSize: number | null
  demandSummary: string | null
  leadScore: number
  sourceType: AcquisitionLeadSourceType
  sourceUrl: string | null
  sourceLabel: string | null
  status: AcquisitionLeadStatus
  ownerUserId: string | null
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AcquisitionContactProfile {
  id: string
  organizationId: string
  name: string
  role: string | null
  channel: AcquisitionContactChannel
  value: string
  isPrimary: boolean
  isPublicContact: boolean
  verificationStatus: "unverified" | "verified" | "bounced" | "invalid"
  locale: string | null
  timezone: string | null
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AcquisitionLeadRecord {
  id: string
  organizationId: string
  contactId: string | null
  pipeline: AcquisitionPartnerType
  sourceType: AcquisitionLeadSourceType
  sourceTaskId: string | null
  sourceRunId: string | null
  sourceDocumentUrl: string | null
  qualificationReason: string | null
  fitScore: number
  priorityScore: number
  status: AcquisitionLeadStatus
  nextActionAt: string | null
  lastContactedAt: string | null
  lastRepliedAt: string | null
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AcquisitionCrawlerTask {
  id: string
  name: string
  targetType: AcquisitionPartnerType
  status: AcquisitionCrawlerTaskStatus
  provider: "file" | "tavily" | "serper" | "webhook" | "custom"
  targetSites: string[]
  selectors: Array<{
    field: string
    selector: string
    attr?: string | null
  }>
  region: string
  locale: string
  keywordQuery: string
  frequencyMinutes: number
  maxResultsPerRun: number
  dedupeKey: string[]
  publicContactOnly: boolean
  config: Record<string, unknown>
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AcquisitionCrawlerRun {
  id: string
  taskId: string
  status: AcquisitionCrawlerRunStatus
  startedAt: string
  finishedAt: string | null
  fetchedDocuments: number
  extractedLeads: number
  qualifiedLeads: number
  failedDocuments: number
  errorMessage: string | null
  metrics: Record<string, number>
  meta: Record<string, unknown>
}

export interface AcquisitionOutreachTemplate {
  id: string
  partnerType: AcquisitionPartnerType
  channel: AcquisitionOutreachChannel
  locale: string
  scene: "cold_outreach" | "follow_up" | "proposal" | "vc_intro" | "enterprise_bd"
  subjectTemplate: string | null
  bodyTemplate: string
  variables: string[]
  aiPrompt: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface AcquisitionOutreachSequence {
  id: string
  name: string
  partnerType: AcquisitionPartnerType
  active: boolean
  steps: Array<{
    step: number
    channel: AcquisitionOutreachChannel
    delayHours: number
    templateId: string
    guardRuleKey: string | null
  }>
  createdAt: string
  updatedAt: string
}

export interface AcquisitionOutreachJob {
  id: string
  leadId: string
  organizationId: string
  contactId: string | null
  sequenceId: string | null
  templateId: string | null
  channel: AcquisitionOutreachChannel
  status: AcquisitionOutreachStatus
  subjectRendered: string | null
  bodyRendered: string
  sentByUserId: string | null
  providerMessageId: string | null
  scheduledAt: string | null
  sentAt: string | null
  deliveredAt: string | null
  failedAt: string | null
  failureReason: string | null
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AcquisitionReplyEvent {
  id: string
  outreachJobId: string | null
  leadId: string
  organizationId: string
  contactId: string | null
  channel: AcquisitionContactChannel
  inboundText: string
  sentimentScore: number | null
  disposition: AcquisitionReplyDisposition
  aiSummary: string | null
  suggestedNextAction: string | null
  requiresHumanReview: boolean
  receivedAt: string
  meta: Record<string, unknown>
}

export interface AcquisitionOfferPackage {
  id: string
  partnerType: AcquisitionPartnerType
  name: string
  billingProduct: string | null
  billingCycle: AcquisitionOrderRevenueType | null
  proBenefitMonths: number
  couponDiscountRate: number
  couponPriceRmb: number | null
  commissionRuleId: string | null
  contractTemplateKey: string | null
  active: boolean
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AcquisitionPartnershipRecord {
  id: string
  organizationId: string
  leadId: string
  partnerType: AcquisitionPartnerType
  status: AcquisitionPartnershipStatus
  offerPackageId: string | null
  contractId: string | null
  contractSignedAt: string | null
  launchAt: string | null
  managerUserId: string | null
  notes: string | null
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AcquisitionTrackingAsset {
  id: string
  partnershipId: string
  organizationId: string
  assetType: AcquisitionTrackingAssetType
  code: string
  url: string | null
  couponId: string | null
  marketingInvitationCodeId: string | null
  sourceCampaign: string | null
  sourceMedium: string | null
  sourceContent: string | null
  active: boolean
  expiresAt: string | null
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AcquisitionAttributionEvent {
  id: string
  organizationId: string
  partnershipId: string | null
  trackingAssetId: string | null
  userId: string | null
  eventType: "click" | "signup" | "order_paid" | "renewal_paid" | "subscription_upgraded"
  orderId: string | null
  revenueType: AcquisitionOrderRevenueType | null
  orderAmount: number | null
  currency: string | null
  occurredAt: string
  meta: Record<string, unknown>
}

export interface AcquisitionCommissionRule {
  id: string
  partnerType: AcquisitionPartnerType
  name: string
  active: boolean
  rates: Array<{
    revenueType: AcquisitionOrderRevenueType
    percentage: number
    minimumAmount?: number | null
    maximumAmount?: number | null
  }>
  settlementDelayDays: number
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AcquisitionCommissionLedger {
  id: string
  organizationId: string
  partnershipId: string
  attributionEventId: string
  commissionRuleId: string
  revenueType: AcquisitionOrderRevenueType
  grossAmount: number
  commissionRate: number
  commissionAmount: number
  currency: string
  status: AcquisitionCommissionStatus
  settledAt: string | null
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AcquisitionAdRevenueSnapshot {
  id: string
  platform: string
  accountId: string
  revenueDate: string
  impressions: number
  clicks: number
  ecpm: number | null
  cpc: number | null
  revenue: number
  currency: string
  source: AcquisitionAdMetricSource
  meta: Record<string, unknown>
  createdAt: string
}

export interface AcquisitionCompetitorAdSlot {
  id: string
  competitorName: string
  pageUrl: string
  adType: string
  estimatedBid: number | null
  currency: string | null
  placement: string | null
  screenshotUrl: string | null
  crawledAt: string
  meta: Record<string, unknown>
}

export interface AcquisitionVcProfile {
  id: string
  organizationId: string
  firmName: string
  stageFocus: string[]
  thesisTags: string[]
  geography: string[]
  checkSizeMin: number | null
  checkSizeMax: number | null
  preferenceLevel: AcquisitionVcPreferenceLevel
  decisionMakerContactId: string | null
  aiAngleSummary: string | null
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AcquisitionAiDraft {
  id: string
  organizationId: string
  contactId: string | null
  templateId: string | null
  scene: string
  locale: string
  inputContext: Record<string, unknown>
  subject: string | null
  body: string
  createdByUserId: string | null
  createdAt: string
}

export interface AcquisitionEventLog {
  id: string
  entityType:
    | "organization"
    | "contact"
    | "lead"
    | "crawler_task"
    | "crawler_run"
    | "outreach_job"
    | "reply_event"
    | "partnership"
    | "tracking_asset"
    | "commission_ledger"
    | "ad_snapshot"
    | "vc_profile"
  entityId: string
  eventType: string
  actorUserId: string | null
  occurredAt: string
  payload: Record<string, unknown>
}

export interface AcquisitionMultichannelRulesConfig {
  version: number
  global: {
    markets: string[]
    requireManualReviewBeforeContract: boolean
    defaultSettlementDelayDays: number
    maxCrawlerResultsPerRun: number
    maxBatchEmailsPerRun: number
  }
  bloggerAlliance: {
    fanTiers: Array<{
      id: string
      minFollowers: number
      maxFollowers: number
      preferredChannels: AcquisitionContactChannel[]
      defaultOffer: {
        proBenefitMonths: number
        couponDiscountRate: number
        couponPriceRmbMax: number
      }
    }>
    commissionRates: Partial<Record<AcquisitionOrderRevenueType, number>>
    autoAdvanceRules: {
      positiveReplyKeywords: string[]
      needsInfoKeywords: string[]
      negotiatingKeywords: string[]
    }
  }
  enterpriseProcurement: {
    leadQualification: {
      minimumDemandScore: number
      preferredRoles: string[]
      priorityRegions: string[]
    }
    contractStrategy: {
      defaultContractTemplate: string
      legalReviewRequiredAboveAmount: number
    }
  }
  crawlerTasks: {
    blogger: {
      frequencyMinutes: number
      targetSites: string[]
      selectors: AcquisitionCrawlerTask["selectors"]
    }
    enterprise: {
      frequencyMinutes: number
      targetSites: string[]
      selectors: AcquisitionCrawlerTask["selectors"]
    }
    vc: {
      frequencyMinutes: number
      targetSites: string[]
      selectors: AcquisitionCrawlerTask["selectors"]
    }
  }
  adRevenue: {
    platformPullFrequencyMinutes: number
    competitorCrawlFrequencyMinutes: number
    watchlistPlatforms: string[]
    bidAlertThreshold: {
      currency: string
      value: number
    }
  }
  vcOutreach: {
    contactRules: {
      preferredRoles: string[]
      minimumPreferenceScore: number
    }
    aiDrafting: {
      tone: string
      requiredSections: string[]
    }
  }
}

export interface AcquisitionReplyInsightInput {
  disposition: AcquisitionReplyDisposition
  summary: string
  nextStep: string
}

export interface AcquisitionCrawlerRunSummary extends AcquisitionCrawlerRun {
  taskName: string | null
  targetType: AcquisitionPartnerType | null
}

export interface AcquisitionLeadSummary extends AcquisitionLeadRecord {
  organizationName: string | null
  contactValue: string | null
  contactChannel: AcquisitionContactChannel | null
}

export interface AcquisitionReplyEventSummary extends AcquisitionReplyEvent {
  organizationName: string | null
  contactValue: string | null
}

export interface AcquisitionPartnershipSummary extends AcquisitionPartnershipRecord {
  organizationName: string | null
  trackingAssetCount: number
}

export interface AcquisitionOpsBootstrap {
  storage: {
    region: "CN" | "INTL"
    backend: "cloudbase" | "supabase"
  }
  ruleSet: AcquisitionRuleSet | null
  crawlerTasks: AcquisitionCrawlerTask[]
  recentRuns: AcquisitionCrawlerRunSummary[]
  recentLeads: AcquisitionLeadSummary[]
  recentReplyEvents: AcquisitionReplyEventSummary[]
  partnerships: AcquisitionPartnershipSummary[]
  trackingAssets: AcquisitionTrackingAsset[]
  offerPackages: AcquisitionOfferPackage[]
  stats: {
    organizations: number
    contacts: number
    leads: number
    partnerships: number
    activePartnerships: number
    trackingAssets: number
  }
}

export interface AcquisitionCrawlerPersistResult {
  task: AcquisitionCrawlerTask
  run: AcquisitionCrawlerRun
  organizationsCreated: number
  organizationsUpdated: number
  contactsCreated: number
  contactsUpdated: number
  leadsCreated: number
  leadsUpdated: number
  qualifiedLeads: number
  persistedLeadIds: string[]
}

export interface AcquisitionReplyPersistResult {
  replyEvent: AcquisitionReplyEvent
  organization: AcquisitionOrganizationProfile
  contact: AcquisitionContactProfile | null
  lead: AcquisitionLeadRecord
}

export interface AcquisitionPartnershipActivationResult {
  replyEvent: AcquisitionReplyEvent | null
  organization: AcquisitionOrganizationProfile
  contact: AcquisitionContactProfile | null
  lead: AcquisitionLeadRecord
  partnership: AcquisitionPartnershipRecord
  offerPackage: AcquisitionOfferPackage | null
  trackingAssets: AcquisitionTrackingAsset[]
  marketingInvitationCode: MarketingInvitationCode | null
  marketingCoupon: MarketingCoupon | null
}
