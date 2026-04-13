import { NextRequest } from "next/server"
import {
  verifyMarketingAdmin,
  readRouteJson,
  successJson,
  errorJson,
} from "@/lib/market/marketing-route"
import {
  loadAcquisitionBootstrap,
  insertBlogger,
  insertB2BLead,
  updateB2BLeadStatus,
  insertVCLead,
  updateVCLeadStatus,
  insertAd,
  updateBloggerStatus,
  updateAd,
} from "@/lib/market/acquisition"
import { sendEmail } from "@/lib/market/send-email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const data = await loadAcquisitionBootstrap()
    return successJson({ data })
  } catch (error) {
    return errorJson(error, "Failed to load acquisition data")
  }
}

export async function POST(request: NextRequest) {
  const auth = verifyMarketingAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const body = await readRouteJson(request)
    const action = String(body.action || "")

    if (action === "insert_blogger") {
      const result = await insertBlogger({
        name: String(body.name || ""),
        platform: String(body.platform || ""),
        followers: String(body.followers || ""),
        email: String(body.email || ""),
        cost: String(body.cost || ""),
        commission: String(body.commission || ""),
      })
      return successJson({ result })
    }

    if (action === "insert_b2b_lead") {
      const result = await insertB2BLead({
        name: String(body.name || ""),
        region: String(body.region || ""),
        contact: String(body.contact || ""),
        email: String(body.email || ""),
        estValue: String(body.estValue || ""),
      })
      return successJson({ result })
    }

    if (action === "update_b2b_status") {
      const result = await updateB2BLeadStatus(
        String(body.id || ""),
        String(body.status || ""),
      )
      return successJson({ result })
    }

    if (action === "insert_vc_lead") {
      const result = await insertVCLead({
        name: String(body.name || ""),
        region: String(body.region || ""),
        contact: String(body.contact || ""),
        email: String(body.email || ""),
        focus: String(body.focus || ""),
      })
      return successJson({ result })
    }

    if (action === "update_vc_status") {
      const result = await updateVCLeadStatus(
        String(body.id || ""),
        String(body.status || ""),
      )
      return successJson({ result })
    }

    if (action === "insert_ad") {
      const result = await insertAd({
        brand: String(body.brand || ""),
        type: String(body.type || ""),
        duration: String(body.duration || ""),
        reward: String(body.reward || ""),
      })
      return successJson({ result })
    }

    if (action === "update_blogger_status") {
      const result = await updateBloggerStatus(
        String(body.id || ""),
        String(body.status || ""),
      )
      return successJson({ result })
    }

    if (action === "update_ad") {
      const result = await updateAd(String(body.id || ""), {
        duration: body.duration !== undefined ? String(body.duration) : undefined,
        reward: body.reward !== undefined ? String(body.reward) : undefined,
        status: body.status !== undefined ? String(body.status) : undefined,
      })
      return successJson({ result })
    }

    if (action === "send_email") {
      const to = String(body.to || "")
      const subject = String(body.subject || "")
      const emailBody = String(body.body || "")
      if (!to || !subject) {
        return errorJson("Missing required fields", "收件邮箱和主题不能为空", 400)
      }
      const result = await sendEmail({ to, subject, body: emailBody })
      if (!result.success) {
        return errorJson(result.message, result.message, 500)
      }
      return successJson({ result })
    }

    return errorJson("Unknown action", "Unknown action", 400)
  } catch (error) {
    return errorJson(error, "Failed to process acquisition action")
  }
}
