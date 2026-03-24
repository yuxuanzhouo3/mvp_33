export type MarketingRegion = "CN" | "INTL"

export type MarketingAssetType = "cash" | "points" | "ai_quota" | "vip_duration"
export type MarketingCampaignStatus = "draft" | "active" | "paused" | "archived"
export type MarketingTaskStatus = "draft" | "active" | "paused" | "archived"
export type MarketingTaskRecurrence = "once" | "daily" | "repeatable" | "streak"
export type MarketingRewardRecipient = "actor" | "payload.inviterUserId" | "payload.invitedUserId" | "payload.userId"
export type MarketingLedgerStatus = "available" | "frozen" | "reversed" | "settled"
export type MarketingWithdrawalStatus = "pending" | "approved" | "rejected" | "frozen"
export type MarketingRiskSeverity = "low" | "medium" | "high"
export type MarketingRiskStatus = "open" | "reviewing" | "resolved" | "dismissed" | "frozen"
export type MarketingRiskListType = "user" | "device" | "ip"
export type MarketingRiskListStatus = "active" | "disabled"

export type MarketingEventType =
  | "user.login"
  | "referral.registered"
  | "referral.activated"
  | "ad.completed"
  | "order.paid"
  | "subscription.upgraded"
  | "ai.quota.exhausted"

export type MarketingProduct = "orbitchat" | "ai" | "ecommerce"

export interface MarketingSetting {
  id: string
  key: string
  value: unknown
  description: string
  createdAt: string
  updatedAt: string
}

export interface MarketingCampaign {
  id: string
  slug: string
  name: string
  description: string
  campaignType: string
  productScope: MarketingProduct[]
  highlight: string
  status: MarketingCampaignStatus
  startAt: string | null
  endAt: string | null
  sortOrder: number
  rules: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MarketingTaskTemplate {
  id: string
  slug: string
  campaignSlug: string
  name: string
  description: string
  taskType: string
  eventType: MarketingEventType
  rewardAsset: MarketingAssetType
  rewardAmount: number
  rewardRecipient: MarketingRewardRecipient
  thresholdValue: number
  thresholdUnit: string
  dailyLimit: number | null
  lifetimeLimit: number | null
  recurrence: MarketingTaskRecurrence
  decayPolicy: string
  riskRules: Record<string, unknown>
  products: MarketingProduct[]
  meta: Record<string, unknown>
  status: MarketingTaskStatus
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface MarketingAssetAccount {
  id: string
  userId: string
  assetType: MarketingAssetType
  availableBalance: number
  frozenBalance: number
  lifetimeEarned: number
  lifetimeSpent: number
  pendingExpiryAmount: number
  nextExpiryAt: string | null
  lastEventAt: string | null
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MarketingAssetLedger {
  id: string
  userId: string
  assetType: MarketingAssetType
  direction: "credit" | "debit"
  amount: number
  availableAfter: number
  frozenAfter: number
  sourceType: string
  sourceId: string
  eventType: string
  remark: string
  operatorId: string | null
  status: MarketingLedgerStatus
  expiresAt: string | null
  meta: Record<string, unknown>
  createdAt: string
}

export interface MarketingUserTask {
  id: string
  userId: string
  templateSlug: string
  templateName: string
  campaignSlug: string
  eventType: MarketingEventType
  progressValue: number
  progressTarget: number
  completionCount: number
  rewardTotal: number
  streakCount: number
  lastEventAt: string | null
  lastCompletedAt: string | null
  status: "pending" | "in_progress" | "completed" | "capped"
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MarketingEventLog {
  id: string
  product: MarketingProduct
  eventType: MarketingEventType
  userId: string
  occurredAt: string
  source: string | null
  deviceFingerprint: string | null
  ipHash: string | null
  payload: Record<string, unknown>
  status: "pending" | "processed" | "risk_blocked"
  processedAt: string | null
  resultSummary: Record<string, unknown>
  createdAt: string
}

export interface MarketingWithdrawal {
  id: string
  userId: string
  amount: number
  thresholdAmount: number
  channel: string
  status: MarketingWithdrawalStatus
  requestedAt: string
  reviewedAt: string | null
  reviewedBy: string | null
  reviewNote: string | null
  meta: Record<string, unknown>
}

export interface MarketingRiskEvent {
  id: string
  userId: string | null
  riskCode: string
  severity: MarketingRiskSeverity
  status: MarketingRiskStatus
  sourceEventId: string | null
  deviceFingerprint: string | null
  ipHash: string | null
  description: string
  evidence: Record<string, unknown>
  createdAt: string
  reviewedAt: string | null
  reviewedBy: string | null
  reviewNote: string | null
}

export interface MarketingRiskListItem {
  id: string
  listType: MarketingRiskListType
  targetValue: string
  status: MarketingRiskListStatus
  reason: string
  operatorId: string | null
  expiresAt: string | null
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MarketingUserLite {
  userId: string
  name: string
  email: string | null
  lastLoginAt: string | null
  credits: number
  tokensRemaining: number
  subscriptionType: string | null
  subscriptionExpiresAt: string | null
}

export interface MarketingAccountBundle {
  user: MarketingUserLite
  accounts: Record<MarketingAssetType, MarketingAssetAccount | null>
  previewWarnings: string[]
}

export interface MarketingOverview {
  region: MarketingRegion
  generatedAt: string
  assetTotals: Record<MarketingAssetType, { available: number; frozen: number }>
  pendingWithdrawals: { count: number; amount: number }
  riskSummary: { openCount: number; frozenCount: number; highSeverityCount: number }
  campaignSummary: { active: number; draft: number; paused: number; archived: number }
  taskSummary: { totalTemplates: number; activeTemplates: number; participants: number; completions: number; conversionRate: number }
  productDistribution: Array<{ product: MarketingProduct; events: number; users: number }>
}

export interface MarketingReports {
  assetDistribution: Array<{ assetType: MarketingAssetType; available: number; frozen: number; userCount: number }>
  taskPerformance: Array<{
    templateSlug: string
    templateName: string
    participants: number
    completions: number
    rewardTotal: number
    conversionRate: number
  }>
  withdrawalStats: {
    pendingCount: number
    approvedCount: number
    rejectedCount: number
    frozenCount: number
    pendingAmount: number
    approvedAmount: number
  }
  riskBreakdown: Array<{ riskCode: string; count: number; highSeverityCount: number }>
  productDistribution: Array<{ product: MarketingProduct; events: number; users: number }>
  recentEvents: MarketingEventLog[]
}

export interface MarketingSimulationInput {
  product: MarketingProduct
  eventType: MarketingEventType
  userId: string
  occurredAt: string
  payload: Record<string, unknown>
  deviceFingerprint?: string | null
  ipHash?: string | null
  source?: string | null
}

export interface MarketingSimulationResult {
  eventLog: MarketingEventLog
  touchedUsers: string[]
  rewardedLedgers: MarketingAssetLedger[]
  riskEvents: MarketingRiskEvent[]
  updatedTasks: MarketingUserTask[]
}

export interface MarketingListResult<T> {
  page: number
  limit: number
  total: number
  rows: T[]
}
