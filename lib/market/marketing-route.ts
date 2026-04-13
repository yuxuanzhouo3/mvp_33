import { NextRequest, NextResponse } from "next/server"
import { verifyMarketAdminToken } from "@/lib/market/admin-auth"
import type {
  MarketingAssetType,
  MarketingCampaignStatus,
  MarketingCoupon,
  MarketingCouponDiscountType,
  MarketingCouponStatus,
  MarketingEventType,
  MarketingInvitationCode,
  MarketingInvitationStatus,
  MarketingProduct,
  MarketingRewardRecipient,
  MarketingTaskRecurrence,
  MarketingTaskStatus,
} from "@/lib/market/marketing-types"

const MARKETING_PRODUCT_VALUES: readonly MarketingProduct[] = ["orbitchat", "ai", "ecommerce"] as const
const MARKETING_CAMPAIGN_STATUS_VALUES: readonly MarketingCampaignStatus[] = ["draft", "active", "paused", "archived"] as const
const MARKETING_TASK_STATUS_VALUES: readonly MarketingTaskStatus[] = ["draft", "active", "paused", "archived"] as const
const MARKETING_INVITATION_STATUS_VALUES: readonly MarketingInvitationStatus[] = ["active", "expired", "exhausted", "revoked"] as const
const MARKETING_COUPON_STATUS_VALUES: readonly MarketingCouponStatus[] = ["available", "used", "expired", "revoked"] as const
const MARKETING_COUPON_DISCOUNT_TYPE_VALUES: readonly MarketingCouponDiscountType[] = ["percentage", "fixed"] as const
const MARKETING_EVENT_TYPE_VALUES: readonly MarketingEventType[] = [
  "user.login",
  "referral.registered",
  "referral.activated",
  "ad.completed",
  "order.paid",
  "subscription.upgraded",
  "ai.quota.exhausted",
] as const
const MARKETING_ASSET_TYPE_VALUES: readonly MarketingAssetType[] = ["cash", "points", "ai_quota", "vip_duration"] as const
const MARKETING_REWARD_RECIPIENT_VALUES: readonly MarketingRewardRecipient[] = [
  "actor",
  "payload.inviterUserId",
  "payload.invitedUserId",
  "payload.userId",
] as const
const MARKETING_TASK_RECURRENCE_VALUES: readonly MarketingTaskRecurrence[] = ["once", "daily", "repeatable", "streak"] as const
const MARKETING_PARTNER_TIER_VALUES: readonly MarketingInvitationCode["partnerTier"][] = ["general", "partner_package", "blogger_partner"] as const
const MARKETING_AUDIENCE_TYPE_VALUES: readonly MarketingCoupon["audienceType"][] = ["general", "linked_audience", "blogger_fans"] as const

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function parseEnumValue<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const normalized = normalizeString(value)
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : undefined
}

function parseEnumArray<T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : []
  const normalized = values
    .map((item) => normalizeString(item))
    .filter((item): item is T => (allowed as readonly string[]).includes(item))
  if (!normalized.length) return undefined
  return Array.from(new Set(normalized))
}

export function parseMarketingProducts(value: unknown) {
  return parseEnumArray(value, MARKETING_PRODUCT_VALUES)
}

export function parseMarketingCampaignStatus(value: unknown) {
  return parseEnumValue(value, MARKETING_CAMPAIGN_STATUS_VALUES)
}

export function parseMarketingTaskStatus(value: unknown) {
  return parseEnumValue(value, MARKETING_TASK_STATUS_VALUES)
}

export function parseMarketingInvitationStatus(value: unknown) {
  return parseEnumValue(value, MARKETING_INVITATION_STATUS_VALUES)
}

export function parseMarketingCouponStatus(value: unknown) {
  return parseEnumValue(value, MARKETING_COUPON_STATUS_VALUES)
}

export function parseMarketingCouponDiscountType(value: unknown) {
  return parseEnumValue(value, MARKETING_COUPON_DISCOUNT_TYPE_VALUES)
}

export function parseMarketingEventType(value: unknown) {
  return parseEnumValue(value, MARKETING_EVENT_TYPE_VALUES)
}

export function parseMarketingAssetType(value: unknown) {
  return parseEnumValue(value, MARKETING_ASSET_TYPE_VALUES)
}

export function parseMarketingRewardRecipient(value: unknown) {
  return parseEnumValue(value, MARKETING_REWARD_RECIPIENT_VALUES)
}

export function parseMarketingTaskRecurrence(value: unknown) {
  return parseEnumValue(value, MARKETING_TASK_RECURRENCE_VALUES)
}

export function parseMarketingPartnerTier(value: unknown) {
  const parsed = parseEnumValue(value, MARKETING_PARTNER_TIER_VALUES)
  if (parsed === "blogger_partner") return "partner_package"
  return parsed
}

export function parseMarketingCouponAudienceType(value: unknown) {
  const parsed = parseEnumValue(value, MARKETING_AUDIENCE_TYPE_VALUES)
  if (parsed === "blogger_fans") return "linked_audience"
  return parsed
}

export function verifyMarketingAdmin(request: NextRequest) {
  return verifyMarketAdminToken(request)
}

export async function readRouteJson<T extends Record<string, unknown> = Record<string, unknown>>(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return (body && typeof body === "object" ? body : {}) as T
}

export function successJson(payload: Record<string, unknown> = {}) {
  return NextResponse.json({ success: true, ...payload })
}

export function errorJson(error: unknown, fallback: string, status = 500) {
  const message = error instanceof Error ? error.message : String(error || fallback)
  return NextResponse.json(
    {
      success: false,
      error: message || fallback,
    },
    { status },
  )
}
