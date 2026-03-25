import { NextRequest } from "next/server"
import {
  verifyMarketingAdmin,
  readRouteJson,
  successJson,
  errorJson,
} from "@/lib/market/marketing-route"
import { resolveDeploymentRegion } from "@/lib/config/deployment-region"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Profile settings are stored as a simple JSON blob in a single env-variable
 * override file OR in the database. For MVP we keep them in-memory with
 * env-var fallback so no extra DB table is needed.
 *
 * In production you'd persist to a `admin_settings` table.
 * For now: GET returns env-vars, POST saves to a runtime cache that also
 * gets picked up by send-email.ts via getSmtpOverrides().
 */

// Runtime cache (survives until server restart)
// Shared via global so hot-reload doesn't wipe it in dev
const globalForProfile = globalThis as unknown as {
  __profileSmtpOverrides?: {
    cn_user?: string
    cn_pass?: string
    intl_user?: string
    intl_pass?: string
  }
}
if (!globalForProfile.__profileSmtpOverrides) {
  globalForProfile.__profileSmtpOverrides = {}
}

export function getSmtpOverrides() {
  return globalForProfile.__profileSmtpOverrides || {}
}

export async function GET(request: NextRequest) {
  const authResult = verifyMarketingAdmin(request)
  if (!authResult.ok) return authResult.response

  const region = resolveDeploymentRegion()
  const overrides = getSmtpOverrides()

  return successJson({
    profile: {
      username: authResult.admin.username || "admin",
      region,
      smtp: {
        cn_user: overrides.cn_user || process.env.SMTP_CN_USER || "mornscience@sina.cn",
        cn_configured: !!(overrides.cn_user || process.env.SMTP_CN_USER || true),
        intl_user: overrides.intl_user || process.env.SMTP_INTL_USER || "mornscience@gmail.com",
        intl_configured: !!(overrides.intl_user || process.env.SMTP_INTL_USER || true),
      },
    },
  })
}

export async function POST(request: NextRequest) {
  const authResult = verifyMarketingAdmin(request)
  if (!authResult.ok) return authResult.response

  try {
    const body = await readRouteJson(request)
    const action = String(body.action || "")

    if (action === "update_smtp") {
      const target = String(body.target || "") // "cn" | "intl"
      const user = String(body.user || "").trim()
      const pass = String(body.pass || "").trim()

      if (!target || !["cn", "intl"].includes(target)) {
        return errorJson("Invalid target", "请指定 cn 或 intl", 400)
      }
      if (!user) {
        return errorJson("Missing user", "邮箱地址不能为空", 400)
      }

      if (target === "cn") {
        globalForProfile.__profileSmtpOverrides!.cn_user = user
        if (pass) globalForProfile.__profileSmtpOverrides!.cn_pass = pass
      } else {
        globalForProfile.__profileSmtpOverrides!.intl_user = user
        if (pass) globalForProfile.__profileSmtpOverrides!.intl_pass = pass
      }

      return successJson({ message: `${target.toUpperCase()} 邮箱已更新为 ${user}` })
    }

    return errorJson("Unknown action", "Unknown action", 400)
  } catch (error) {
    return errorJson(error, "Failed to process profile action")
  }
}
