import { getDeploymentRegion } from '@/config'

type TpnsRegion = 'CN' | 'INTL'

type TpnsConfig = {
  accessId: string
  secretKey: string
  host: string
}

export type TpnsPushTarget = {
  token: string
  userId?: string
}

export type TpnsPushPayload = {
  title: string
  content: string
  customContent?: Record<string, unknown>
}

function getTpnsConfig(region: TpnsRegion): TpnsConfig | null {
  if (region === 'CN') {
    const accessId = (process.env.TPNS_CN_ACCESS_ID || '').trim()
    const secretKey = (process.env.TPNS_CN_SECRET_KEY || '').trim()
    const host = (process.env.TPNS_CN_API_HOST || 'api.tpns.tencent.com').trim()
    if (!accessId || !secretKey) return null
    return { accessId, secretKey, host }
  }

  const accessId = (process.env.TPNS_GLOBAL_ACCESS_ID || '').trim()
  const secretKey = (process.env.TPNS_GLOBAL_SECRET_KEY || '').trim()
  const host = (process.env.TPNS_GLOBAL_API_HOST || 'api.tpns.sgp.tencent.com').trim()
  if (!accessId || !secretKey) return null
  return { accessId, secretKey, host }
}

function buildAuthorizationHeader(accessId: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${accessId}:${secretKey}`).toString('base64')}`
}

export async function sendTpnsAndroidNotification(
  targets: TpnsPushTarget[],
  payload: TpnsPushPayload,
  region: TpnsRegion = getDeploymentRegion(),
): Promise<{ success: boolean; skipped?: string; response?: unknown }> {
  const uniqueTokens = Array.from(new Set(targets.map((target) => String(target.token || '').trim()).filter(Boolean)))
  if (uniqueTokens.length === 0) {
    return { success: false, skipped: 'no_tokens' }
  }

  const config = getTpnsConfig(region)
  if (!config) {
    return { success: false, skipped: 'missing_tpns_server_credentials' }
  }

  const response = await fetch(`https://${config.host}/v3/push/app`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: buildAuthorizationHeader(config.accessId, config.secretKey),
    },
    body: JSON.stringify({
      audience_type: 'token',
      token_list: uniqueTokens,
      platform: 'android',
      message_type: 'notify',
      message: {
        title: payload.title,
        content: payload.content,
        android: {
          custom_content: JSON.stringify(payload.customContent || {}),
          action: {
            action_type: 1,
          },
        },
      },
    }),
  })

  const responseText = await response.text()
  let parsed: unknown = responseText
  try {
    parsed = JSON.parse(responseText)
  } catch {
    // Keep raw text for logs.
  }

  if (!response.ok) {
    throw new Error(`[TPNS] push failed (${response.status}): ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`)
  }

  return {
    success: true,
    response: parsed,
  }
}
