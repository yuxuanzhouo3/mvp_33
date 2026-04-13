import { NextRequest } from "next/server"
import { deleteMarketingCoupon, getMarketingCoupons, upsertMarketingCoupon } from "@/lib/market/marketing"
import {
  errorJson,
  parseMarketingAssetType,
  parseMarketingCouponAudienceType,
  parseMarketingCouponDiscountType,
  parseMarketingCouponStatus,
  readRouteJson,
  successJson,
  verifyMarketingAdmin,
} from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const coupons = await getMarketingCoupons()
    return successJson({ coupons })
  } catch (error) {
    return errorJson(error, "Failed to load marketing coupons")
  }
}

export async function POST(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const body = await readRouteJson(request)
    const coupon = await upsertMarketingCoupon({
      id: typeof body.id === "string" ? body.id : undefined,
      code: typeof body.code === "string" ? body.code.trim().toUpperCase() : undefined,
      userId: typeof body.userId === "string" ? body.userId.trim() : undefined,
      assetType: parseMarketingAssetType(body.assetType),
      audienceType: parseMarketingCouponAudienceType(body.audienceType),
      partnerProduct:
        typeof body.partnerProduct === "string"
          ? body.partnerProduct.trim() || null
          : body.partnerProduct === null
            ? null
            : undefined,
      productCost: typeof body.productCost === "number" ? body.productCost : undefined,
      sourceInvitationCode:
        typeof body.sourceInvitationCode === "string"
          ? body.sourceInvitationCode.trim() || null
          : body.sourceInvitationCode === null
            ? null
            : undefined,
      orderCommissionRate: typeof body.orderCommissionRate === "number" ? body.orderCommissionRate : undefined,
      purchasePrice: typeof body.purchasePrice === "number" ? body.purchasePrice : undefined,
      discountValue: typeof body.discountValue === "number" ? body.discountValue : undefined,
      discountType: parseMarketingCouponDiscountType(body.discountType),
      minPurchase: typeof body.minPurchase === "number" ? body.minPurchase : undefined,
      maxUses:
        typeof body.maxUses === "number"
          ? body.maxUses
          : body.maxUses === null
            ? null
            : undefined,
      usedCount: typeof body.usedCount === "number" ? body.usedCount : undefined,
      usedByUserId:
        typeof body.usedByUserId === "string"
          ? body.usedByUserId.trim() || null
          : body.usedByUserId === null
            ? null
            : undefined,
      usedOrderNo:
        typeof body.usedOrderNo === "string"
          ? body.usedOrderNo.trim() || null
          : body.usedOrderNo === null
            ? null
            : undefined,
      usedAt:
        typeof body.usedAt === "string"
          ? body.usedAt
          : body.usedAt === null
            ? null
            : undefined,
      status: parseMarketingCouponStatus(body.status),
      expiresAt:
        typeof body.expiresAt === "string"
          ? body.expiresAt
          : body.expiresAt === null
            ? null
            : undefined,
    })
    return successJson({ coupon })
  } catch (error) {
    return errorJson(error, "Failed to save marketing coupon")
  }
}

export async function DELETE(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const id = request.nextUrl.searchParams.get("id")?.trim()
    if (!id) {
      return errorJson(new Error("Coupon id is required"), "Coupon id is required", 400)
    }
    await deleteMarketingCoupon(id)
    return successJson({})
  } catch (error) {
    return errorJson(error, "Failed to delete marketing coupon")
  }
}
