import { NextRequest } from "next/server"
import { listMarketingTaskTemplates, saveMarketingTaskTemplate } from "@/lib/market/marketing"
import {
  errorJson,
  parseMarketingAssetType,
  parseMarketingEventType,
  parseMarketingProducts,
  parseMarketingRewardRecipient,
  parseMarketingTaskRecurrence,
  parseMarketingTaskStatus,
  readRouteJson,
  successJson,
  verifyMarketingAdmin,
} from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const taskTemplates = await listMarketingTaskTemplates({
      status: searchParams.get("status") || undefined,
      taskType: searchParams.get("taskType") || undefined,
      query: searchParams.get("query") || undefined,
    })
    return successJson({ taskTemplates })
  } catch (error) {
    return errorJson(error, "Failed to load marketing task templates")
  }
}

export async function POST(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const body = await readRouteJson(request)
    const taskTemplate = await saveMarketingTaskTemplate({
      id: typeof body.id === "string" ? body.id : undefined,
      slug: String(body.slug || ""),
      name: String(body.name || ""),
      campaignSlug: typeof body.campaignSlug === "string" ? body.campaignSlug : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      taskType: typeof body.taskType === "string" ? body.taskType : undefined,
      eventType: parseMarketingEventType(body.eventType),
      rewardAsset: parseMarketingAssetType(body.rewardAsset),
      rewardAmount: typeof body.rewardAmount === "number" ? body.rewardAmount : undefined,
      rewardRecipient: parseMarketingRewardRecipient(body.rewardRecipient),
      thresholdValue: typeof body.thresholdValue === "number" ? body.thresholdValue : undefined,
      thresholdUnit: typeof body.thresholdUnit === "string" ? body.thresholdUnit : undefined,
      dailyLimit:
        typeof body.dailyLimit === "number" ? body.dailyLimit : body.dailyLimit === null ? null : undefined,
      lifetimeLimit:
        typeof body.lifetimeLimit === "number" ? body.lifetimeLimit : body.lifetimeLimit === null ? null : undefined,
      recurrence: parseMarketingTaskRecurrence(body.recurrence),
      decayPolicy: typeof body.decayPolicy === "string" ? body.decayPolicy : undefined,
      riskRules: typeof body.riskRules === "object" && body.riskRules ? (body.riskRules as Record<string, unknown>) : undefined,
      products: parseMarketingProducts(body.products),
      meta: typeof body.meta === "object" && body.meta ? (body.meta as Record<string, unknown>) : undefined,
      status: parseMarketingTaskStatus(body.status),
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
    })
    return successJson({ taskTemplate })
  } catch (error) {
    return errorJson(error, "Failed to save marketing task template")
  }
}
