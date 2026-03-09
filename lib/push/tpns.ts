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

function readEnv(names: string[]): string {
  for (const name of names) {
    const value = String(process.env[name] || '').trim()
    if (value) return value
  }

  return ''
}

function getTpnsConfig(region: TpnsRegion): TpnsConfig | null {
  if (region === 'CN') {
    const accessId = readEnv(['TPNS_CHINA_ACCESS_ID', 'TPNS_CN_ACCESS_ID'])
    const secretKey = readEnv(['TPNS_CHINA_SECRET_KEY', 'TPNS_CN_SECRET_KEY'])
    const host = readEnv(['TPNS_CHINA_API_HOST', 'TPNS_CN_API_HOST']) || 'api.tpns.tencent.com'
    if (!accessId || !secretKey) return null
    return { accessId, secretKey, host }
  }

  const accessId = readEnv(['TPNS_GLOBAL_ACCESS_ID'])
  const secretKey = readEnv(['TPNS_GLOBAL_SECRET_KEY'])
  const host = readEnv(['TPNS_GLOBAL_API_HOST']) || 'api.tpns.sgp.tencent.com'
  if (!accessId || !secretKey) return null
  return { accessId, secretKey, host }
}

function buildAuthorizationHeader(accessId: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${accessId}:${secretKey}`).toString('base64')}`
}

function buildAndroidMessage(payload: TpnsPushPayload, region: TpnsRegion): Record<string, unknown> {
  const android: Record<string, unknown> = {
    custom_content: JSON.stringify(payload.customContent || {}),
    action: {
      action_type: 1,
    },
    n_ch_id: 'default_message',
    n_ch_name: region === 'CN' ? '聊天消息' : 'Messages',
  }

  if (region === 'CN') {
    Object.assign(android, {
      // Explicitly mark this as an IM notification and open all domestic vendor routes.
      oppo_ch_id: 'default_message',
      vivo_ch_id: '1',
      hw_category: 'IM',
      hw_importance: 2,
    })
  }

  return android
}

function buildChannelRules(region: TpnsRegion): Array<{ channel: string; disable: boolean }> | undefined {
  if (region !== 'CN') return undefined

  return ['xg', 'hw', 'xm', 'vivo', 'oppo', 'honor'].map((channel) => ({
    channel,
    disable: false,
  }))
}

function buildPushRequestBody(
  uniqueTokens: string[],
  payload: TpnsPushPayload,
  region: TpnsRegion,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    audience_type: uniqueTokens.length > 1 ? 'token_list' : 'token',
    token_list: uniqueTokens,
    platform: 'android',
    message_type: 'notify',
    tpns_online_push_type: 0,
    message: {
      title: payload.title,
      content: payload.content,
      android: buildAndroidMessage(payload, region),
    },
  }

  const channelRules = buildChannelRules(region)
  if (channelRules?.length) {
    body.channel_rules = channelRules
  }

  return body
}

function getTpnsRetCode(response: unknown): number | null {
  if (!response || typeof response !== 'object') return null
  const retCode = (response as { ret_code?: unknown }).ret_code
  return typeof retCode === 'number' ? retCode : null
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

  const requestBody = buildPushRequestBody(uniqueTokens, payload, region)
  const response = await fetch(`https://${config.host}/v3/push/app`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: buildAuthorizationHeader(config.accessId, config.secretKey),
    },
    body: JSON.stringify(requestBody),
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

  const retCode = getTpnsRetCode(parsed)
  if (retCode !== null && retCode !== 0) {
    throw new Error(`[TPNS] push failed (ret_code=${retCode}): ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`)
  }

  return {
    success: true,
    response: parsed,
  }
}
