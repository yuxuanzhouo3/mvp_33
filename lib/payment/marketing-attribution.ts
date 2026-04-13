import { createMarketingSystemLedger, getMarketingCouponByCode, getMarketingCoupons, getMarketingInvitationCodes } from "@/lib/market/marketing"
import type { MarketingCoupon } from "@/lib/market/marketing-types"
import type { DatabaseClient } from "@/lib/database/types"

type RawOrder = Record<string, any>

export type OrderMarketingAttribution = {
  schemaVersion: 1
  triggeredBy: "coupon_code" | "repeat_attribution"
  couponId: string
  couponCode: string
  partnerUserId: string | null
  partnerProduct: string | null
  productCost: number
  sourceInvitationCode: string | null
  orderCommissionRate: number
  attributionExpiresAt: string | null
  minPurchase: number
  discountType: MarketingCoupon["discountType"]
  discountValue: number
  discountApplied: boolean
  originalAmount: number
  finalAmount: number
  netProfitAmount: number
  priorPaidOrderCount: number
  reusedFromOrderNo: string | null
}

export type MarketingOrderPricingResult = {
  finalAmount: number
  couponId?: string
  marketingAttribution: OrderMarketingAttribution | null
  reason:
    | "no_marketing_coupon"
    | "coupon_revoked"
    | "coupon_expired"
    | "coupon_user_mismatch"
    | "coupon_min_purchase_unmet"
    | "coupon_discount_applied"
    | "coupon_repeat_commission_only"
    | "coupon_exhausted_without_history"
    | "repeat_attribution_applied"
    | "repeat_attribution_expired"
    | "repeat_attribution_min_purchase_unmet"
    | "no_repeat_attribution"
}

function safeString(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim()
  return normalized || fallback
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function roundCurrency(value: unknown) {
  return Number(safeNumber(value).toFixed(2))
}

function clampRate(rate: unknown) {
  const normalized = safeNumber(rate)
  if (!Number.isFinite(normalized) || normalized <= 0) return 0
  const decimalRate = normalized > 1 ? normalized / 100 : normalized
  return Math.min(Math.max(decimalRate, 0), 1)
}

function parseJsonRecord(value: unknown) {
  if (!value) return {}
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, any> : {}
    } catch {
      return {}
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}
}

function isPaidOrder(order: RawOrder) {
  const status = safeString(order?.payment_status || order?.paymentStatus || order?.status).toLowerCase()
  return status === "paid" || status === "completed"
}

function getOrderTimestamp(order: RawOrder) {
  return safeString(order?.created_at || order?.createdAt || order?.updated_at || order?.updatedAt)
}

function isAttributionExpired(expiresAt?: string | null, atTime = new Date()) {
  if (!expiresAt) return false
  const expiresDate = new Date(expiresAt)
  if (!Number.isFinite(expiresDate.getTime())) return false
  return expiresDate < atTime
}

function couponUsedCount(coupon: MarketingCoupon) {
  const usedCount = Math.max(safeNumber(coupon.usedCount), coupon.status === "used" ? 1 : 0)
  return Math.floor(Math.max(usedCount, 0))
}

function applyCouponDiscount(amount: number, coupon: MarketingCoupon) {
  if (coupon.discountType === "percentage") {
    const discountPercent = Math.min(Math.max(safeNumber(coupon.discountValue), 0), 100)
    return roundCurrency(amount * (1 - discountPercent / 100))
  }

  const discountAmount = Math.max(safeNumber(coupon.discountValue), 0)
  return roundCurrency(Math.max(0, amount - discountAmount))
}

async function loadUserOrders(dbClient: DatabaseClient, userId: string) {
  if (!userId) return [] as RawOrder[]

  if (dbClient.type === "cloudbase") {
    try {
      const result = await dbClient.cloudbase.collection("orders").where({ user_id: userId }).get()
      return Array.isArray(result?.data) ? result.data : []
    } catch (error) {
      console.warn("[Marketing Attribution] Failed to load CloudBase orders:", error)
      return []
    }
  }

  const { data, error } = await dbClient.supabase
    .from("orders")
    .select("order_no,user_id,amount,original_amount,coupon_id,status,payment_status,callback_data,created_at,updated_at")
    .eq("user_id", userId)

  if (error) {
    console.warn("[Marketing Attribution] Failed to load Supabase orders:", error)
    return []
  }

  return Array.isArray(data) ? data : []
}

async function resolvePartnerUserId(coupon: MarketingCoupon) {
  const directUserId = safeString(coupon.userId)
  if (directUserId) return directUserId

  const invitationCode = safeString(coupon.sourceInvitationCode).toUpperCase()
  if (!invitationCode) return null

  const invitationCodes = await getMarketingInvitationCodes()
  const matched = invitationCodes.find((item) => safeString(item.code).toUpperCase() === invitationCode)
  return matched?.userId ? safeString(matched.userId) : null
}

function getOrderMarketingAttribution(order: RawOrder): OrderMarketingAttribution | null {
  const callbackData = parseJsonRecord(order?.callback_data || order?.callbackData)
  const payload = parseJsonRecord(callbackData.marketingAttribution)
  const couponId = safeString(payload.couponId)
  const couponCode = safeString(payload.couponCode)

  if (!couponId || !couponCode) {
    return null
  }

  return {
    schemaVersion: 1,
    triggeredBy: payload.triggeredBy === "repeat_attribution" ? "repeat_attribution" : "coupon_code",
    couponId,
    couponCode,
    partnerUserId: safeString(payload.partnerUserId) || null,
    partnerProduct: safeString(payload.partnerProduct) || null,
    productCost: Math.max(safeNumber(payload.productCost), 0),
    sourceInvitationCode: safeString(payload.sourceInvitationCode) || null,
    orderCommissionRate: safeNumber(payload.orderCommissionRate),
    attributionExpiresAt: safeString(payload.attributionExpiresAt) || null,
    minPurchase: Math.max(safeNumber(payload.minPurchase), 0),
    discountType: payload.discountType === "fixed" ? "fixed" : "percentage",
    discountValue: Math.max(safeNumber(payload.discountValue), 0),
    discountApplied: Boolean(payload.discountApplied),
    originalAmount: roundCurrency(payload.originalAmount),
    finalAmount: roundCurrency(payload.finalAmount),
    netProfitAmount: roundCurrency(payload.netProfitAmount),
    priorPaidOrderCount: Math.max(safeNumber(payload.priorPaidOrderCount), 0),
    reusedFromOrderNo: safeString(payload.reusedFromOrderNo) || null,
  }
}

function matchesPartnerAttribution(
  attribution: OrderMarketingAttribution,
  coupon: MarketingCoupon,
  partnerUserId: string | null,
) {
  if (attribution.couponId === safeString(coupon.id)) {
    return true
  }

  const couponInvitationCode = safeString(coupon.sourceInvitationCode).toUpperCase()
  const attributionInvitationCode = safeString(attribution.sourceInvitationCode).toUpperCase()
  if (couponInvitationCode && attributionInvitationCode && couponInvitationCode === attributionInvitationCode) {
    return true
  }

  const couponPartnerProduct = safeString(coupon.partnerProduct).toLowerCase()
  const attributionPartnerProduct = safeString(attribution.partnerProduct).toLowerCase()
  return Boolean(
    partnerUserId &&
      attribution.partnerUserId === partnerUserId &&
      couponPartnerProduct &&
      attributionPartnerProduct === couponPartnerProduct,
  )
}

function toRepeatAttribution(
  attribution: OrderMarketingAttribution,
  originalAmount: number,
  reusedFromOrderNo: string | null,
): OrderMarketingAttribution {
  return {
    ...attribution,
    triggeredBy: "repeat_attribution",
    discountApplied: false,
    originalAmount,
    finalAmount: originalAmount,
    netProfitAmount: originalAmount,
    reusedFromOrderNo,
  }
}

function buildCouponAttribution(input: {
  coupon: MarketingCoupon
  partnerUserId: string | null
  originalAmount: number
  finalAmount: number
  discountApplied: boolean
  priorPaidOrderCount: number
  triggeredBy: OrderMarketingAttribution["triggeredBy"]
  reusedFromOrderNo?: string | null
}) {
  return {
    schemaVersion: 1 as const,
    triggeredBy: input.triggeredBy,
    couponId: safeString(input.coupon.id),
    couponCode: safeString(input.coupon.code),
    partnerUserId: input.partnerUserId,
    partnerProduct: safeString(input.coupon.partnerProduct) || null,
    productCost: Math.max(safeNumber(input.coupon.productCost), 0),
    sourceInvitationCode: safeString(input.coupon.sourceInvitationCode) || null,
    orderCommissionRate: safeNumber(input.coupon.orderCommissionRate),
    attributionExpiresAt: safeString(input.coupon.expiresAt) || null,
    minPurchase: Math.max(safeNumber(input.coupon.minPurchase), 0),
    discountType: input.coupon.discountType,
    discountValue: Math.max(safeNumber(input.coupon.discountValue), 0),
    discountApplied: input.discountApplied,
    originalAmount: input.originalAmount,
    finalAmount: input.finalAmount,
    netProfitAmount: input.finalAmount,
    priorPaidOrderCount: input.priorPaidOrderCount,
    reusedFromOrderNo: input.reusedFromOrderNo || null,
  }
}

async function buildFallbackAttributionFromOrder(order: RawOrder) {
  const couponId = safeString(order?.coupon_id || order?.couponId)
  const marketingCouponPrefix = "marketing:"
  if (!couponId.toLowerCase().startsWith(marketingCouponPrefix)) {
    return null
  }

  const marketingCouponId = couponId.slice(marketingCouponPrefix.length).trim()
  if (!marketingCouponId) {
    return null
  }

  const coupons = await getMarketingCoupons()
  const coupon = coupons.find((item) => safeString(item.id) === marketingCouponId)
  if (!coupon) {
    return null
  }

  const partnerUserId = await resolvePartnerUserId(coupon)
  return buildCouponAttribution({
    coupon,
    partnerUserId,
    originalAmount: roundCurrency(order.original_amount ?? order.originalAmount ?? order.amount),
    finalAmount: roundCurrency(order.amount),
    discountApplied: true,
    priorPaidOrderCount: 0,
    triggeredBy: "coupon_code",
  })
}

function pickLatestActiveAttribution(orders: RawOrder[], amount: number) {
  const sortedOrders = [...orders]
    .filter(isPaidOrder)
    .sort((left, right) => {
      const leftTime = Date.parse(getOrderTimestamp(left))
      const rightTime = Date.parse(getOrderTimestamp(right))
      return rightTime - leftTime
    })

  for (const order of sortedOrders) {
    const attribution = getOrderMarketingAttribution(order)
    if (!attribution) continue
    if (!attribution.partnerUserId || safeNumber(attribution.orderCommissionRate) <= 0) continue
    if (isAttributionExpired(attribution.attributionExpiresAt)) continue
    if (amount < attribution.minPurchase) {
      return {
        attribution,
        orderNo: safeString(order?.order_no || order?.orderNo) || null,
        reason: "repeat_attribution_min_purchase_unmet" as const,
      }
    }
    return {
      attribution,
      orderNo: safeString(order?.order_no || order?.orderNo) || null,
      reason: "repeat_attribution_applied" as const,
    }
  }

  return null
}

export async function resolveMarketingOrderPricing(input: {
  dbClient: DatabaseClient
  userId: string
  amount: number
  couponCode?: string | null
}) {
  const userId = safeString(input.userId)
  const originalAmount = roundCurrency(input.amount)
  const normalizedCouponCode = safeString(input.couponCode)
  const orders = await loadUserOrders(input.dbClient, userId)
  const paidOrders = orders.filter(isPaidOrder)

  if (!normalizedCouponCode) {
    const repeatAttribution = pickLatestActiveAttribution(paidOrders, originalAmount)

    if (!repeatAttribution) {
      return {
        finalAmount: originalAmount,
        marketingAttribution: null,
        reason: "no_repeat_attribution" as const,
      }
    }

    if (repeatAttribution.reason === "repeat_attribution_min_purchase_unmet") {
      return {
        finalAmount: originalAmount,
        marketingAttribution: null,
        reason: "repeat_attribution_min_purchase_unmet" as const,
      }
    }

    return {
      finalAmount: originalAmount,
      marketingAttribution: toRepeatAttribution(
        repeatAttribution.attribution,
        originalAmount,
        repeatAttribution.orderNo,
      ),
      reason: "repeat_attribution_applied" as const,
    }
  }

  const marketingCoupon = await getMarketingCouponByCode(normalizedCouponCode)
  if (!marketingCoupon) {
    return {
      finalAmount: originalAmount,
      marketingAttribution: null,
      reason: "no_marketing_coupon" as const,
    }
  }

  const isExpired = isAttributionExpired(marketingCoupon.expiresAt)
  if (marketingCoupon.status === "revoked") {
    return {
      finalAmount: originalAmount,
      marketingAttribution: null,
      reason: "coupon_revoked" as const,
    }
  }

  if (marketingCoupon.status === "expired" || isExpired) {
    return {
      finalAmount: originalAmount,
      marketingAttribution: null,
      reason: "coupon_expired" as const,
    }
  }

  if (marketingCoupon.userId && marketingCoupon.userId !== userId) {
    return {
      finalAmount: originalAmount,
      marketingAttribution: null,
      reason: "coupon_user_mismatch" as const,
    }
  }

  const minPurchase = Math.max(safeNumber(marketingCoupon.minPurchase), 0)
  if (originalAmount < minPurchase) {
    return {
      finalAmount: originalAmount,
      marketingAttribution: null,
      reason: "coupon_min_purchase_unmet" as const,
    }
  }

  const partnerUserId = await resolvePartnerUserId(marketingCoupon)
  const priorAttributedPaidOrders = paidOrders.filter((order: any) => {
    const attribution = getOrderMarketingAttribution(order)
    return attribution ? matchesPartnerAttribution(attribution, marketingCoupon, partnerUserId) : false
  })

  const hasPriorAttributedPaidOrder = priorAttributedPaidOrders.length > 0
  const maxUses = marketingCoupon.maxUses === null ? null : Math.max(Math.floor(safeNumber(marketingCoupon.maxUses, 1)), 1)
  const hasRemainingUses = maxUses === null || couponUsedCount(marketingCoupon) < maxUses

  if (!hasPriorAttributedPaidOrder && !hasRemainingUses) {
    return {
      finalAmount: originalAmount,
      marketingAttribution: null,
      reason: "coupon_exhausted_without_history" as const,
    }
  }

  if (hasPriorAttributedPaidOrder) {
    return {
      finalAmount: originalAmount,
      marketingAttribution: buildCouponAttribution({
        coupon: marketingCoupon,
        partnerUserId,
        originalAmount,
        finalAmount: originalAmount,
        discountApplied: false,
        priorPaidOrderCount: priorAttributedPaidOrders.length,
        triggeredBy: "coupon_code",
        reusedFromOrderNo: safeString(
          priorAttributedPaidOrders
            .sort((left: any, right: any) => Date.parse(getOrderTimestamp(right)) - Date.parse(getOrderTimestamp(left)))[0]?.order_no,
        ) || null,
      }),
      reason: "coupon_repeat_commission_only" as const,
    }
  }

  const finalAmount = applyCouponDiscount(originalAmount, marketingCoupon)
  return {
    finalAmount,
    couponId: `marketing:${marketingCoupon.id}`,
    marketingAttribution: buildCouponAttribution({
      coupon: marketingCoupon,
      partnerUserId,
      originalAmount,
      finalAmount,
      discountApplied: true,
      priorPaidOrderCount: priorAttributedPaidOrders.length,
      triggeredBy: "coupon_code",
    }),
    reason: "coupon_discount_applied" as const,
  }
}

export function buildOrderCallbackData(marketingAttribution: OrderMarketingAttribution | null) {
  if (!marketingAttribution) {
    return null
  }

  return {
    marketingAttribution,
  }
}

export async function handleMarketingAttributedOrderPaid(input: {
  order: RawOrder
  orderNo: string
  occurredAt?: string | null
}) {
  const orderNo = safeString(input.orderNo)
  const order = input.order || {}
  const attribution = getOrderMarketingAttribution(order) || await buildFallbackAttributionFromOrder(order)

  if (!orderNo || !attribution) {
    return { handled: false as const, reason: "missing_attribution" as const }
  }

  if (!attribution.partnerUserId) {
    return { handled: false as const, reason: "missing_partner_user" as const }
  }

  const commissionRate = clampRate(attribution.orderCommissionRate)
  if (commissionRate <= 0) {
    return { handled: false as const, reason: "missing_commission_rate" as const }
  }

  const paidAmount = roundCurrency(order.amount ?? attribution.finalAmount ?? attribution.originalAmount)
  if (paidAmount <= 0) {
    return { handled: false as const, reason: "invalid_paid_amount" as const }
  }

  const productCost = roundCurrency(Math.max(safeNumber(attribution.productCost), 0))
  const netProfitAmount = roundCurrency(Math.max(0, paidAmount - productCost))
  const commissionAmount = roundCurrency(netProfitAmount * commissionRate)
  if (commissionAmount <= 0) {
    return { handled: false as const, reason: "zero_commission" as const }
  }

  const ledger = await createMarketingSystemLedger({
    userId: attribution.partnerUserId,
    assetType: "cash",
    direction: "credit",
    amount: commissionAmount,
    sourceType: "partner_order_commission",
    sourceId: `partner_order_commission:${orderNo}`,
    eventType: "order.paid",
    remark: `Partner commission from order ${orderNo}`,
    meta: {
      orderNo,
      buyerUserId: safeString(order.user_id || order.userId) || null,
      couponId: attribution.couponId,
      couponCode: attribution.couponCode,
      partnerProduct: attribution.partnerProduct,
      sourceInvitationCode: attribution.sourceInvitationCode,
      productCost,
      orderCommissionRate: attribution.orderCommissionRate,
      commissionRateDecimal: commissionRate,
      originalAmount: roundCurrency(order.original_amount ?? attribution.originalAmount),
      paidAmount,
      netProfitAmount,
      commissionAmount,
      discountApplied: attribution.discountApplied,
      attributionExpiresAt: attribution.attributionExpiresAt,
      commissionBasis: "paid_amount_minus_product_cost",
    },
    createdAt: safeString(input.occurredAt, new Date().toISOString()),
  })

  return {
    handled: true as const,
    reason: "commission_recorded" as const,
    commissionAmount,
    netProfitAmount,
    ledgerId: ledger.id,
  }
}
