import { NextRequest } from "next/server"
import { deleteMarketingInvitationCode, getMarketingInvitationCodes, upsertMarketingInvitationCode } from "@/lib/market/marketing"
import {
  errorJson,
  parseMarketingPartnerTier,
  parseMarketingInvitationStatus,
  readRouteJson,
  successJson,
  verifyMarketingAdmin,
} from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const invitationCodes = await getMarketingInvitationCodes()
    return successJson({ invitationCodes })
  } catch (error) {
    return errorJson(error, "Failed to load marketing invitation codes")
  }
}

export async function POST(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const body = await readRouteJson(request)
    const invitationCode = await upsertMarketingInvitationCode({
      id: typeof body.id === "string" ? body.id : undefined,
      code: typeof body.code === "string" ? body.code.trim().toUpperCase() : undefined,
      userId: typeof body.userId === "string" ? body.userId.trim() : undefined,
      partnerTier: parseMarketingPartnerTier(body.partnerTier),
      partnerProduct:
        typeof body.partnerProduct === "string"
          ? body.partnerProduct.trim() || null
          : body.partnerProduct === null
            ? null
            : undefined,
      productCost: typeof body.productCost === "number" ? body.productCost : undefined,
      partnerBenefitMonths: typeof body.partnerBenefitMonths === "number" ? body.partnerBenefitMonths : undefined,
      fanDiscountRate: typeof body.fanDiscountRate === "number" ? body.fanDiscountRate : undefined,
      orderCommissionRate: typeof body.orderCommissionRate === "number" ? body.orderCommissionRate : undefined,
      campaignSlug:
        typeof body.campaignSlug === "string"
          ? body.campaignSlug.trim() || null
          : body.campaignSlug === null
            ? null
            : undefined,
      maxUses:
        typeof body.maxUses === "number"
          ? body.maxUses
          : body.maxUses === null
            ? null
            : undefined,
      usedCount: typeof body.usedCount === "number" ? body.usedCount : undefined,
      status: parseMarketingInvitationStatus(body.status),
      expiresAt:
        typeof body.expiresAt === "string"
          ? body.expiresAt
          : body.expiresAt === null
            ? null
            : undefined,
    })
    return successJson({ invitationCode })
  } catch (error) {
    return errorJson(error, "Failed to save marketing invitation code")
  }
}

export async function DELETE(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const id = request.nextUrl.searchParams.get("id")?.trim()
    if (!id) {
      return errorJson(new Error("Invitation code id is required"), "Invitation code id is required", 400)
    }
    await deleteMarketingInvitationCode(id)
    return successJson({})
  } catch (error) {
    return errorJson(error, "Failed to delete marketing invitation code")
  }
}
