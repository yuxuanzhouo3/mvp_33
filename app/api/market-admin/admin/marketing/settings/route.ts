import { NextRequest } from "next/server"
import { listMarketingSettings, saveMarketingSetting } from "@/lib/market/marketing"
import { errorJson, readRouteJson, successJson, verifyMarketingAdmin } from "@/lib/market/marketing-route"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const settings = await listMarketingSettings()
    return successJson({ settings })
  } catch (error) {
    return errorJson(error, "Failed to load marketing settings")
  }
}

export async function POST(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const body = await readRouteJson(request)
    const setting = await saveMarketingSetting({
      id: typeof body.id === "string" ? body.id : undefined,
      key: String(body.key || ""),
      value: body.value,
      description: typeof body.description === "string" ? body.description : undefined,
    })
    return successJson({ setting })
  } catch (error) {
    return errorJson(error, "Failed to save marketing setting")
  }
}
