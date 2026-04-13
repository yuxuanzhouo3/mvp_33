import type { NextRequest } from "next/server"
import { getDatabase } from "@/lib/database/cloudbase-service"
import { resolveDeploymentRegion } from "@/lib/config/deployment-region"
import { getSupabaseAdminForDownloads } from "@/lib/downloads/supabase-admin"
import {
  createMarketingSystemLedger,
  listMarketingAssetAccounts,
  listMarketingSettings,
  recordMarketingEventOccurrence,
} from "@/lib/market/marketing"
import type { MarketingAssetType } from "@/lib/market/marketing-types"
import {
  bindReferralFromRequest,
  getUserInviteCenterData,
  getUserReferralRelations,
  getUserReferralRewards,
  recordReferralReward,
  type ReferralRegion,
} from "@/lib/market/referrals"

const USERS_COLLECTION = "users"
const ORDERS_COLLECTION = "orders"
const REFERRAL_RELATIONS_COLLECTION = "referral_relations"
const REFERRAL_REWARDS_COLLECTION = "referral_rewards"
const MARKETING_EVENTS_COLLECTION = "marketing_event_logs"
const INVITE_SIGNUP_CASH_REWARD_TYPE = "invite_signup_cash"
const INVITE_FIRST_ORDER_CASH_REWARD_TYPE = "invite_first_order_cash"
const INVITE_SEVEN_DAY_LOGIN_POINTS_REWARD_TYPE = "invite_seven_day_login_points"

type ReferralRelationRecord = {
  id: string
  inviterUserId: string
  invitedUserId: string
  status: string
  createdAt: string
  activatedAt: string | null
}

type PaidOrderSummary = {
  count: number
  firstPaidAt: string | null
}

export type InviteRewardAsset = "cash" | "points"

export type InviteProgramConfig = {
  signupCashReward: number
  firstOrderCashReward: number
  sevenDayLoginPointsReward: number
  withdrawThreshold: number
  pointsDecayGraceDays: number
  pointsDecayDailyRate: number
  pointsDecayMaxRate: number
}

export type InviteProgramCenterData = {
  referralCode: string
  shareUrl: string
  clickCount: number
  invitedCount: number
  conversionRate: number
  cashBalance: number
  pointsBalance: number
  withdrawThreshold: number
  canWithdraw: boolean
  signupCashReward: number
  firstOrderCashReward: number
  sevenDayLoginPointsReward: number
  pointsDecayGraceDays: number
  pointsDecayDailyRate: number
  pointsDecayMaxRate: number
}

export type InviteProgramRelationProgressRow = {
  relationId: string
  invitedUserId: string
  invitedEmail: string | null
  createdAt: string
  currentLoginStreak: number
  firstOrderAt: string | null
  signupRewarded: boolean
  firstOrderRewarded: boolean
  sevenDayLoginRewarded: boolean
  status: "registered" | "first_order" | "streak_rewarded"
}

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

function getRegion(): ReferralRegion {
  return resolveDeploymentRegion() === "INTL" ? "INTL" : "CN"
}

function toDayKey(value?: string | null) {
  const raw = safeString(value)
  if (!raw) return ""
  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) return ""
  return date.toISOString().slice(0, 10)
}

function addUtcDays(dayKey: string, days: number) {
  const date = new Date(`${dayKey}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime())) return ""
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function diffUtcDays(startValue?: string | null, endValue?: string | null) {
  const start = toDayKey(startValue)
  const end = toDayKey(endValue)
  if (!start || !end) return 0
  const startDate = new Date(`${start}T00:00:00.000Z`)
  const endDate = new Date(`${end}T00:00:00.000Z`)
  const diffMs = endDate.getTime() - startDate.getTime()
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)))
}

function computeCurrentLoginStreak(loginDayKeys: string[]) {
  const uniqueDays = Array.from(new Set(loginDayKeys.filter(Boolean))).sort()
  if (uniqueDays.length === 0) return 0

  let streak = 1
  for (let index = uniqueDays.length - 1; index > 0; index -= 1) {
    if (addUtcDays(uniqueDays[index - 1], 1) !== uniqueDays[index]) {
      break
    }
    streak += 1
  }
  return streak
}

function getInviteRewardAsset(rewardType: string): InviteRewardAsset {
  if (
    rewardType === INVITE_SEVEN_DAY_LOGIN_POINTS_REWARD_TYPE ||
    rewardType === "signup_inviter" ||
    rewardType === "signup_invited" ||
    rewardType === "first_use_inviter" ||
    rewardType === "first_use_invited"
  ) {
    return "points"
  }
  return "cash"
}

export function getInviteRewardDisplayLabel(rewardType: string, language: "zh" | "en" = "zh") {
  const isZh = language === "zh"
  switch (rewardType) {
    case INVITE_SIGNUP_CASH_REWARD_TYPE:
      return isZh ? "邀请注册奖励" : "Signup reward"
    case INVITE_FIRST_ORDER_CASH_REWARD_TYPE:
      return isZh ? "邀请首单奖励" : "First order reward"
    case INVITE_SEVEN_DAY_LOGIN_POINTS_REWARD_TYPE:
      return isZh ? "7日连续登录奖励" : "7-day login streak reward"
    case "signup_inviter":
      return isZh ? "旧版邀请注册奖励" : "Legacy signup reward"
    case "signup_invited":
      return isZh ? "旧版被邀请注册奖励" : "Legacy invitee signup reward"
    case "first_use_inviter":
      return isZh ? "旧版首次激活奖励" : "Legacy first activation reward"
    case "first_use_invited":
      return isZh ? "旧版被邀请首次激活奖励" : "Legacy invitee first activation reward"
    default:
      return rewardType
  }
}

async function loadUserLoginAt(userId: string) {
  const normalizedUserId = safeString(userId)
  if (!normalizedUserId) return null

  if (getRegion() === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data, error } = await supabase
      .from("users")
      .select("last_login_at")
      .eq("id", normalizedUserId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return data?.last_login_at ? String(data.last_login_at) : null
  }

  const db = await getDatabase()
  const result = await db.collection(USERS_COLLECTION).where({ id: normalizedUserId }).limit(1).get()
  const row = result?.data?.[0]
  return row?.last_login_at ? String(row.last_login_at) : null
}

async function loadPointsBalance(userId: string) {
  const normalizedUserId = safeString(userId)
  if (!normalizedUserId) return 0

  if (getRegion() === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data, error } = await supabase
      .from("marketing_asset_accounts")
      .select("available_balance")
      .eq("user_id", normalizedUserId)
      .eq("asset_type", "points")
      .maybeSingle()

    if (error) throw new Error(error.message)
    return safeNumber(data?.available_balance)
  }

  const db = await getDatabase()
  const result = await db
    .collection("marketing_asset_accounts")
    .where({ user_id: normalizedUserId, asset_type: "points" })
    .limit(1)
    .get()
  const row = result?.data?.[0]
  return safeNumber(row?.available_balance)
}

async function loadReferralRelationByInvitedUserId(invitedUserId: string): Promise<ReferralRelationRecord | null> {
  const normalizedUserId = safeString(invitedUserId)
  if (!normalizedUserId) return null

  if (getRegion() === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data, error } = await supabase
      .from(REFERRAL_RELATIONS_COLLECTION)
      .select("id,inviter_user_id,invited_user_id,status,created_at,activated_at")
      .eq("invited_user_id", normalizedUserId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data?.id) return null

    return {
      id: String(data.id),
      inviterUserId: safeString((data as any).inviter_user_id),
      invitedUserId: safeString((data as any).invited_user_id),
      status: safeString((data as any).status, "bound"),
      createdAt: safeString((data as any).created_at, nowIso()),
      activatedAt: (data as any).activated_at ? String((data as any).activated_at) : null,
    }
  }

  const db = await getDatabase()
  const result = await db
    .collection(REFERRAL_RELATIONS_COLLECTION)
    .where({ invited_user_id: normalizedUserId })
    .limit(1)
    .get()
  const row = result?.data?.[0]
  if (!row?._id && !row?.id) return null

  return {
    id: safeString(row?._id || row?.id),
    inviterUserId: safeString(row?.inviter_user_id),
    invitedUserId: safeString(row?.invited_user_id),
    status: safeString(row?.status, "bound"),
    createdAt: safeString(row?.created_at, nowIso()),
    activatedAt: row?.activated_at ? String(row.activated_at) : null,
  }
}

async function markReferralRelationActivated(relationId: string, occurredAt: string) {
  const normalizedRelationId = safeString(relationId)
  if (!normalizedRelationId) return

  if (getRegion() === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { error } = await supabase
      .from(REFERRAL_RELATIONS_COLLECTION)
      .update({
        status: "activated",
        activated_at: occurredAt,
      })
      .eq("id", normalizedRelationId)
      .is("activated_at", null)

    if (error) throw new Error(error.message)
    return
  }

  const db = await getDatabase()
  await db.collection(REFERRAL_RELATIONS_COLLECTION).doc(normalizedRelationId).update({
    status: "activated",
    activated_at: occurredAt,
    updated_at: occurredAt,
  })
}

async function hasRewardReference(referenceId: string) {
  const normalizedReferenceId = safeString(referenceId)
  if (!normalizedReferenceId) return false

  if (getRegion() === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data, error } = await supabase
      .from(REFERRAL_REWARDS_COLLECTION)
      .select("id")
      .eq("reference_id", normalizedReferenceId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return Boolean(data?.id)
  }

  try {
    const db = await getDatabase()
    const result = await db
      .collection(REFERRAL_REWARDS_COLLECTION)
      .where({ reference_id: normalizedReferenceId })
      .limit(1)
      .get()
    return Boolean(result?.data?.[0])
  } catch {
    return false
  }
}

async function loadPaidOrderSummary(userId: string): Promise<PaidOrderSummary> {
  const normalizedUserId = safeString(userId)
  if (!normalizedUserId) {
    return { count: 0, firstPaidAt: null }
  }

  if (getRegion() === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data, error } = await supabase
      .from(ORDERS_COLLECTION)
      .select("created_at,payment_status,status")
      .eq("user_id", normalizedUserId)

    if (error) throw new Error(error.message)
    const paidOrders = (data || [])
      .filter((row: any) => ["completed", "paid"].includes(String(row?.payment_status || row?.status || "")))
      .sort((left: any, right: any) => (String(left?.created_at || "") < String(right?.created_at || "") ? -1 : 1))

    return {
      count: paidOrders.length,
      firstPaidAt: paidOrders[0]?.created_at ? String(paidOrders[0].created_at) : null,
    }
  }

  const db = await getDatabase()
  const result = await db.collection(ORDERS_COLLECTION).where({ user_id: normalizedUserId }).get()
  const paidOrders = (Array.isArray(result?.data) ? result.data : [])
    .filter((row: any) => ["completed", "paid"].includes(String(row?.payment_status || row?.status || "")))
    .sort((left: any, right: any) => (String(left?.created_at || left?.updated_at || "") < String(right?.created_at || right?.updated_at || "") ? -1 : 1))

  return {
    count: paidOrders.length,
    firstPaidAt: paidOrders[0]?.created_at ? String(paidOrders[0].created_at) : null,
  }
}

async function loadPaidOrderSummaryMap(userIds: string[]) {
  const targetUserIds = Array.from(new Set(userIds.map((userId) => safeString(userId)).filter(Boolean)))
  const summaryMap = new Map<string, PaidOrderSummary>()

  if (targetUserIds.length === 0) {
    return summaryMap
  }

  if (getRegion() === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data, error } = await supabase
      .from(ORDERS_COLLECTION)
      .select("user_id,created_at,payment_status,status")
      .in("user_id", targetUserIds)

    if (error) throw new Error(error.message)

    for (const row of data || []) {
      const userId = safeString((row as any)?.user_id)
      if (!userId) continue
      if (!["completed", "paid"].includes(String((row as any)?.payment_status || (row as any)?.status || ""))) continue
      const current = summaryMap.get(userId) || { count: 0, firstPaidAt: null }
      const createdAt = (row as any)?.created_at ? String((row as any).created_at) : null
      current.count += 1
      if (createdAt && (!current.firstPaidAt || createdAt < current.firstPaidAt)) {
        current.firstPaidAt = createdAt
      }
      summaryMap.set(userId, current)
    }

    return summaryMap
  }

  const db = await getDatabase()
  const result = await db.collection(ORDERS_COLLECTION).get()
  for (const row of Array.isArray(result?.data) ? result.data : []) {
    const userId = safeString((row as any)?.user_id)
    if (!userId || !targetUserIds.includes(userId)) continue
    if (!["completed", "paid"].includes(String((row as any)?.payment_status || (row as any)?.status || ""))) continue
    const current = summaryMap.get(userId) || { count: 0, firstPaidAt: null }
    const createdAt = row?.created_at ? String(row.created_at) : null
    current.count += 1
    if (createdAt && (!current.firstPaidAt || createdAt < current.firstPaidAt)) {
      current.firstPaidAt = createdAt
    }
    summaryMap.set(userId, current)
  }

  return summaryMap
}

async function loadUserLoginStreak(userId: string) {
  const normalizedUserId = safeString(userId)
  if (!normalizedUserId) return 0

  if (getRegion() === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data, error } = await supabase
      .from(MARKETING_EVENTS_COLLECTION)
      .select("occurred_at")
      .eq("user_id", normalizedUserId)
      .eq("event_type", "user.login")

    if (error) throw new Error(error.message)
    return computeCurrentLoginStreak((data || []).map((row: any) => toDayKey(row?.occurred_at)))
  }

  const db = await getDatabase()
  const result = await db
    .collection(MARKETING_EVENTS_COLLECTION)
    .where({ user_id: normalizedUserId, event_type: "user.login" })
    .get()
  return computeCurrentLoginStreak((Array.isArray(result?.data) ? result.data : []).map((row: any) => toDayKey(row?.occurred_at)))
}

async function loadUserLoginStreakMap(userIds: string[]) {
  const targetUserIds = Array.from(new Set(userIds.map((userId) => safeString(userId)).filter(Boolean)))
  const dayMap = new Map<string, string[]>()

  if (targetUserIds.length === 0) {
    return new Map<string, number>()
  }

  if (getRegion() === "INTL") {
    const supabase = getSupabaseAdminForDownloads()
    const { data, error } = await supabase
      .from(MARKETING_EVENTS_COLLECTION)
      .select("user_id,occurred_at")
      .in("user_id", targetUserIds)
      .eq("event_type", "user.login")

    if (error) throw new Error(error.message)
    for (const row of data || []) {
      const userId = safeString((row as any)?.user_id)
      if (!userId) continue
      const current = dayMap.get(userId) || []
      current.push(toDayKey((row as any)?.occurred_at))
      dayMap.set(userId, current)
    }
  } else {
    const db = await getDatabase()
    const result = await db.collection(MARKETING_EVENTS_COLLECTION).where({ event_type: "user.login" }).get()
    for (const row of Array.isArray(result?.data) ? result.data : []) {
      const userId = safeString((row as any)?.user_id)
      if (!userId || !targetUserIds.includes(userId)) continue
      const current = dayMap.get(userId) || []
      current.push(toDayKey((row as any)?.occurred_at))
      dayMap.set(userId, current)
    }
  }

  return new Map(Array.from(dayMap.entries()).map(([userId, dayKeys]) => [userId, computeCurrentLoginStreak(dayKeys)]))
}

async function grantInviteReward(input: {
  relationId: string
  recipientUserId: string
  rewardType: string
  assetType: MarketingAssetType
  amount: number
  referenceId: string
  occurredAt: string
  remark: string
  meta?: Record<string, unknown>
}) {
  const amount = Math.max(0, Math.round(safeNumber(input.amount)))
  if (amount <= 0) {
    return { granted: false, alreadyProcessed: false }
  }

  const region = getRegion()
  const referenceId = safeString(input.referenceId)
  if (!referenceId) {
    throw new Error("referenceId is required")
  }

  if (await hasRewardReference(referenceId)) {
    return { granted: false, alreadyProcessed: true }
  }

  await createMarketingSystemLedger({
    userId: input.recipientUserId,
    assetType: input.assetType,
    direction: "credit",
    amount,
    sourceType: "invite_reward",
    sourceId: referenceId,
    eventType: input.rewardType,
    remark: input.remark,
    meta: input.meta || {},
    createdAt: input.occurredAt,
  })

  await recordReferralReward({
    region,
    relationId: input.relationId,
    userId: input.recipientUserId,
    rewardType: input.rewardType,
    amount,
    referenceId,
    status: "granted",
  })

  return { granted: true, alreadyProcessed: false }
}

async function applyPointsDecayForLogin(input: {
  userId: string
  occurredAt: string
  previousLastLoginAt?: string | null
  config: InviteProgramConfig
}) {
  const previousLastLoginAt =
    input.previousLastLoginAt === undefined
      ? await loadUserLoginAt(input.userId)
      : input.previousLastLoginAt

  const inactiveDays = diffUtcDays(previousLastLoginAt, input.occurredAt)
  const decayDays = inactiveDays - input.config.pointsDecayGraceDays
  if (decayDays <= 0) return { applied: false, decayAmount: 0 }

  const pointsBalance = await loadPointsBalance(input.userId)
  if (pointsBalance <= 0) return { applied: false, decayAmount: 0 }

  const totalRate = Math.min(
    decayDays * input.config.pointsDecayDailyRate,
    input.config.pointsDecayMaxRate,
  ) / 100
  if (totalRate <= 0) return { applied: false, decayAmount: 0 }

  const decayAmount = Math.floor(pointsBalance * totalRate)
  if (decayAmount <= 0) return { applied: false, decayAmount: 0 }

  await createMarketingSystemLedger({
    userId: input.userId,
    assetType: "points",
    direction: "debit",
    amount: decayAmount,
    sourceType: "points_decay",
    sourceId: `points_decay:${safeString(input.userId)}:${toDayKey(input.occurredAt)}`,
    eventType: "user.login",
    remark: `Points decay after ${inactiveDays} inactive days`,
    meta: {
      inactiveDays,
      decayDays,
      totalRatePercent: Number((totalRate * 100).toFixed(2)),
      previousLastLoginAt: previousLastLoginAt || null,
    },
    createdAt: input.occurredAt,
  })

  return {
    applied: true,
    decayAmount,
  }
}

export async function getInviteProgramConfig(): Promise<InviteProgramConfig> {
  const settings = await listMarketingSettings()
  const settingsMap = new Map(settings.map((setting) => [setting.key, setting.value]))

  return {
    signupCashReward: safeNumber(settingsMap.get("invite_signup_cash_reward"), 5),
    firstOrderCashReward: safeNumber(settingsMap.get("invite_first_order_cash_reward"), 10),
    sevenDayLoginPointsReward: safeNumber(settingsMap.get("invite_seven_day_login_points_reward"), 50),
    withdrawThreshold: safeNumber(settingsMap.get("withdraw_min_amount"), 20),
    pointsDecayGraceDays: safeNumber(settingsMap.get("invite_points_decay_grace_days"), 30),
    pointsDecayDailyRate: safeNumber(settingsMap.get("invite_points_decay_daily_rate"), 1),
    pointsDecayMaxRate: safeNumber(settingsMap.get("invite_points_decay_max_rate"), 50),
  }
}

export async function applyInviteSignupFromRequest(input: {
  request: NextRequest
  invitedUserId: string
  invitedEmail?: string | null
  occurredAt?: string
}) {
  const occurredAt = safeString(input.occurredAt, nowIso())
  const bindResult = await bindReferralFromRequest({
    request: input.request,
    invitedUserId: input.invitedUserId,
    invitedEmail: input.invitedEmail,
  })

  if (!bindResult?.bound || !bindResult.relationId || !bindResult.inviterUserId) {
    return bindResult
  }

  const config = await getInviteProgramConfig()
  await grantInviteReward({
    relationId: bindResult.relationId,
    recipientUserId: bindResult.inviterUserId,
    rewardType: INVITE_SIGNUP_CASH_REWARD_TYPE,
    assetType: "cash",
    amount: config.signupCashReward,
    referenceId: `${INVITE_SIGNUP_CASH_REWARD_TYPE}:${bindResult.relationId}`,
    occurredAt,
    remark: `Invite signup reward for ${bindResult.invitedUserId}`,
    meta: {
      invitedUserId: bindResult.invitedUserId,
      inviterUserId: bindResult.inviterUserId,
    },
  })

  return bindResult
}

export async function handleInviteProgramLogin(input: {
  userId: string
  occurredAt?: string
  source?: string | null
  previousLastLoginAt?: string | null
}) {
  const userId = safeString(input.userId)
  if (!userId) return { handled: false, reason: "missing_user_id" as const }

  const occurredAt = safeString(input.occurredAt, nowIso())
  const config = await getInviteProgramConfig()
  const relation = await loadReferralRelationByInvitedUserId(userId)

  await applyPointsDecayForLogin({
    userId,
    occurredAt,
    previousLastLoginAt: input.previousLastLoginAt,
    config,
  })

  await recordMarketingEventOccurrence({
    product: "orbitchat",
    eventType: "user.login",
    userId,
    occurredAt,
    source: input.source || "auth.login",
    payload: {
      userId,
    },
  })

  if (!relation?.id || !relation.inviterUserId) {
    return { handled: true, relationId: null, streakRewardGranted: false }
  }

  const referenceId = `${INVITE_SEVEN_DAY_LOGIN_POINTS_REWARD_TYPE}:${relation.id}`
  if (await hasRewardReference(referenceId)) {
    return { handled: true, relationId: relation.id, streakRewardGranted: false, alreadyProcessed: true }
  }

  const currentLoginStreak = await loadUserLoginStreak(userId)
  if (currentLoginStreak < 7) {
    return { handled: true, relationId: relation.id, streakRewardGranted: false, currentLoginStreak }
  }

  const rewardResult = await grantInviteReward({
    relationId: relation.id,
    recipientUserId: relation.inviterUserId,
    rewardType: INVITE_SEVEN_DAY_LOGIN_POINTS_REWARD_TYPE,
    assetType: "points",
    amount: config.sevenDayLoginPointsReward,
    referenceId,
    occurredAt,
    remark: `Invitee reached ${currentLoginStreak}-day login streak`,
    meta: {
      invitedUserId: relation.invitedUserId,
      inviterUserId: relation.inviterUserId,
      loginStreak: currentLoginStreak,
    },
  })

  return {
    handled: true,
    relationId: relation.id,
    streakRewardGranted: rewardResult.granted,
    currentLoginStreak,
  }
}

export async function handleInviteeFirstPaidOrder(input: {
  userId: string
  orderNo?: string | null
  occurredAt?: string
}) {
  const userId = safeString(input.userId)
  if (!userId) return { handled: false, reason: "missing_user_id" as const }

  const occurredAt = safeString(input.occurredAt, nowIso())
  const relation = await loadReferralRelationByInvitedUserId(userId)
  if (!relation?.id || !relation.inviterUserId) {
    return { handled: false, reason: "no_relation" as const }
  }

  const paidOrderSummary = await loadPaidOrderSummary(userId)
  if (paidOrderSummary.count !== 1) {
    return {
      handled: false,
      reason: paidOrderSummary.count === 0 ? "no_paid_order" as const : "not_first_order" as const,
      orderCount: paidOrderSummary.count,
    }
  }

  await markReferralRelationActivated(relation.id, paidOrderSummary.firstPaidAt || occurredAt)

  const config = await getInviteProgramConfig()
  const rewardResult = await grantInviteReward({
    relationId: relation.id,
    recipientUserId: relation.inviterUserId,
    rewardType: INVITE_FIRST_ORDER_CASH_REWARD_TYPE,
    assetType: "cash",
    amount: config.firstOrderCashReward,
    referenceId: `${INVITE_FIRST_ORDER_CASH_REWARD_TYPE}:${relation.id}`,
    occurredAt: paidOrderSummary.firstPaidAt || occurredAt,
    remark: `Invitee completed first order${input.orderNo ? ` (${input.orderNo})` : ""}`,
    meta: {
      invitedUserId: relation.invitedUserId,
      inviterUserId: relation.inviterUserId,
      orderNo: input.orderNo || null,
    },
  })

  return {
    handled: true,
    relationId: relation.id,
    rewardGranted: rewardResult.granted,
    alreadyProcessed: rewardResult.alreadyProcessed,
    orderCount: paidOrderSummary.count,
    firstPaidAt: paidOrderSummary.firstPaidAt,
  }
}

export async function getInviteProgramCenterData(input: {
  userId: string
  origin?: string | null
}): Promise<InviteProgramCenterData> {
  const [baseData, config, accountBundles] = await Promise.all([
    getUserInviteCenterData(input),
    getInviteProgramConfig(),
    listMarketingAssetAccounts({ userId: input.userId, page: 1, limit: 1 }),
  ])

  const accountBundle = accountBundles.rows[0]
  const cashBalance = safeNumber(accountBundle?.accounts.cash?.availableBalance)
  const pointsBalance = safeNumber(accountBundle?.accounts.points?.availableBalance)

  return {
    referralCode: baseData.referralCode,
    shareUrl: baseData.shareUrl,
    clickCount: baseData.clickCount,
    invitedCount: baseData.invitedCount,
    conversionRate: baseData.conversionRate,
    cashBalance,
    pointsBalance,
    withdrawThreshold: config.withdrawThreshold,
    canWithdraw: cashBalance >= config.withdrawThreshold,
    signupCashReward: config.signupCashReward,
    firstOrderCashReward: config.firstOrderCashReward,
    sevenDayLoginPointsReward: config.sevenDayLoginPointsReward,
    pointsDecayGraceDays: config.pointsDecayGraceDays,
    pointsDecayDailyRate: config.pointsDecayDailyRate,
    pointsDecayMaxRate: config.pointsDecayMaxRate,
  }
}

export async function getInviteProgramRelationProgress(input: {
  userId: string
  page?: number | string
  limit?: number | string
}) {
  const [relations, rewards] = await Promise.all([
    getUserReferralRelations(input),
    getUserReferralRewards({
      userId: input.userId,
      page: 1,
      limit: 500,
    }),
  ])

  const invitedUserIds = relations.rows.map((row: any) => safeString(row?.invitedUserId)).filter(Boolean)
  const [orderSummaryMap, loginStreakMap] = await Promise.all([
    loadPaidOrderSummaryMap(invitedUserIds),
    loadUserLoginStreakMap(invitedUserIds),
  ])

  const rewardTypesByRelation = new Map<string, Set<string>>()
  for (const reward of rewards.rows) {
    const relationId = safeString((reward as any)?.relationId)
    if (!relationId) continue
    const current = rewardTypesByRelation.get(relationId) || new Set<string>()
    current.add(safeString((reward as any)?.rewardType))
    rewardTypesByRelation.set(relationId, current)
  }

  const rows: InviteProgramRelationProgressRow[] = relations.rows.map((relation: any) => {
    const relationId = safeString(relation?.relationId || relation?.id)
    const invitedUserId = safeString(relation?.invitedUserId)
    const rewardTypes = rewardTypesByRelation.get(relationId) || new Set<string>()
    const paidOrderSummary = orderSummaryMap.get(invitedUserId) || { count: 0, firstPaidAt: null }
    const currentLoginStreak = loginStreakMap.get(invitedUserId) || 0
    const signupRewarded = rewardTypes.has(INVITE_SIGNUP_CASH_REWARD_TYPE) || rewardTypes.has("signup_inviter")
    const firstOrderRewarded = rewardTypes.has(INVITE_FIRST_ORDER_CASH_REWARD_TYPE) || rewardTypes.has("first_use_inviter")
    const sevenDayLoginRewarded = rewardTypes.has(INVITE_SEVEN_DAY_LOGIN_POINTS_REWARD_TYPE)

    return {
      relationId,
      invitedUserId,
      invitedEmail: relation?.invitedEmail || null,
      createdAt: safeString(relation?.createdAt, nowIso()),
      currentLoginStreak,
      firstOrderAt: paidOrderSummary.firstPaidAt,
      signupRewarded,
      firstOrderRewarded,
      sevenDayLoginRewarded,
      status: sevenDayLoginRewarded
        ? "streak_rewarded"
        : firstOrderRewarded || Boolean(paidOrderSummary.firstPaidAt)
          ? "first_order"
          : "registered",
    }
  })

  return {
    ...relations,
    rows,
  }
}

export async function getInviteProgramRewardHistory(input: {
  userId: string
  page?: number | string
  limit?: number | string
  language?: "zh" | "en"
}) {
  const rewards = await getUserReferralRewards(input)
  const language = input.language || "zh"

  return {
    ...rewards,
    rows: rewards.rows.map((reward: any) => ({
      ...reward,
      rewardAsset: getInviteRewardAsset(safeString(reward?.rewardType)),
      rewardLabel: getInviteRewardDisplayLabel(safeString(reward?.rewardType), language),
    })),
  }
}
