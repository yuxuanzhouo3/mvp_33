import { createHash, createHmac, randomUUID } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"

type StoredPublishAccount = {
  id: string
  platform: string
  account_key: string
  display_name: string | null
  open_id: string | null
  access_token: string | null
  refresh_token: string | null
  expires_at: string | null
  refresh_expires_at: string | null
  scope: string | null
  avatar_url: string | null
  meta: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function isMissingDistributionAccountsTable(error: unknown) {
  const message = String((error as { message?: unknown })?.message || error || "")
  return /relation .* does not exist/i.test(message) || /Could not find the table/i.test(message) || /schema cache/i.test(message)
}

function getSupabase() {
  return createAdminClient()
}

function getStateSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.CLOUDBASE_SESSION_SECRET || "market-distribution-state"
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url")
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8")
}

export function buildSignedOAuthState(payload: Record<string, unknown>) {
  const raw = JSON.stringify({
    ...payload,
    nonce: randomUUID(),
    issuedAt: Date.now(),
  })
  const encoded = base64UrlEncode(raw)
  const signature = createHmac("sha256", getStateSecret()).update(encoded).digest("base64url")
  return `${encoded}.${signature}`
}

export function readSignedOAuthState<T extends Record<string, unknown>>(value: string, maxAgeMs = 10 * 60 * 1000): T {
  const [encoded, signature] = String(value || "").split(".")
  if (!encoded || !signature) {
    throw new Error("Invalid OAuth state")
  }

  const expected = createHmac("sha256", getStateSecret()).update(encoded).digest("base64url")
  if (expected !== signature) {
    throw new Error("OAuth state signature mismatch")
  }

  const parsed = JSON.parse(base64UrlDecode(encoded)) as T & { issuedAt?: number }
  const issuedAt = Number(parsed.issuedAt || 0)
  if (!issuedAt || Date.now() - issuedAt > maxAgeMs) {
    throw new Error("OAuth state expired")
  }

  return parsed
}

export async function getStoredPublishAccount(platform: string, accountKey = "default"): Promise<StoredPublishAccount | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("market_distribution_accounts")
    .select("*")
    .eq("platform", platform)
    .eq("account_key", accountKey)
    .maybeSingle()

  if (error) {
    if (isMissingDistributionAccountsTable(error)) return null
    throw new Error(error.message)
  }
  return (data as StoredPublishAccount | null) || null
}

export async function upsertStoredPublishAccount(input: {
  platform: string
  accountKey?: string
  displayName?: string | null
  openId?: string | null
  accessToken?: string | null
  refreshToken?: string | null
  expiresAt?: string | null
  refreshExpiresAt?: string | null
  scope?: string | null
  avatarUrl?: string | null
  meta?: Record<string, unknown>
}) {
  const supabase = getSupabase()
  const row = {
    id: `${input.platform}-${input.accountKey || "default"}`,
    platform: input.platform,
    account_key: input.accountKey || "default",
    display_name: input.displayName || null,
    open_id: input.openId || null,
    access_token: input.accessToken || null,
    refresh_token: input.refreshToken || null,
    expires_at: input.expiresAt || null,
    refresh_expires_at: input.refreshExpiresAt || null,
    scope: input.scope || null,
    avatar_url: input.avatarUrl || null,
    meta: input.meta || {},
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from("market_distribution_accounts")
    .upsert(row, { onConflict: "platform,account_key" })
    .select("*")
    .single()

  if (error) {
    if (isMissingDistributionAccountsTable(error)) {
      throw new Error('Supabase table "market_distribution_accounts" is missing. Run the 20260408000000_add_market_distribution_accounts.sql migration first.')
    }
    throw new Error(error.message)
  }
  return data as StoredPublishAccount
}

export async function getDirectPublishChannelConnectionState(channelId: string) {
  if (channelId === "douyin-brand") {
    const account = await getStoredPublishAccount("douyin", "brand")
    return {
      isConnected: Boolean(account?.refresh_token || account?.access_token),
      accountLabel: account?.display_name || account?.open_id || null,
      connectUrl: "/api/market-admin/admin/acquisition/distribution/douyin/connect",
      note: account?.display_name
        ? `Authorized as ${account.display_name}.`
        : account?.open_id
          ? `Authorized account ${account.open_id}.`
          : "Connect an authorized Douyin brand account before direct publishing.",
    }
  }

  if (channelId === "wechat-oa") {
    const ready = Boolean(
      process.env.WECHAT_OA_ACCESS_TOKEN ||
        (process.env.WECHAT_OA_APP_ID && process.env.WECHAT_OA_APP_SECRET && process.env.WECHAT_OA_THUMB_MEDIA_ID),
    )
    return {
      isConnected: ready,
      accountLabel: process.env.WECHAT_OA_AUTHOR || process.env.WECHAT_OA_APP_ID || null,
      connectUrl: null,
      note: ready
        ? "WeChat OA direct publish is configured."
        : "Configure WeChat OA credentials and thumb media before direct publishing.",
    }
  }

  return {
    isConnected: true,
    accountLabel: null,
    connectUrl: null,
    note: "",
  }
}

export async function refreshDouyinAccessToken(refreshToken: string) {
  const clientKey = process.env.DOUYIN_CLIENT_KEY || process.env.MARKET_DOUYIN_CLIENT_KEY || ""
  const clientSecret = process.env.DOUYIN_CLIENT_SECRET || process.env.MARKET_DOUYIN_CLIENT_SECRET || ""
  if (!clientKey || !clientSecret) {
    throw new Error("DOUYIN_CLIENT_KEY / DOUYIN_CLIENT_SECRET not configured")
  }

  const response = await fetch("https://open.douyin.com/oauth/refresh_token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })

  const payload = (await response.json()) as {
    data?: {
      access_token?: string
      refresh_token?: string
      open_id?: string
      expires_in?: number
      refresh_expires_in?: number
      scope?: string
    }
    message?: string
  }

  if (!response.ok || !payload.data?.access_token) {
    throw new Error(payload.message || "Failed to refresh Douyin access token")
  }

  return payload.data
}

export async function getActiveDouyinAccount() {
  const account = await getStoredPublishAccount("douyin", "brand")
  if (!account) return null

  const expiresAt = account.expires_at ? Date.parse(account.expires_at) : 0
  const shouldRefresh = Boolean(account.refresh_token) && (!expiresAt || expiresAt - Date.now() < 10 * 60 * 1000)
  if (!shouldRefresh) return account

  const refreshed = await refreshDouyinAccessToken(String(account.refresh_token || ""))
  const updated = await upsertStoredPublishAccount({
    platform: "douyin",
    accountKey: "brand",
    displayName: account.display_name,
    openId: refreshed.open_id || account.open_id,
    accessToken: refreshed.access_token || account.access_token,
    refreshToken: refreshed.refresh_token || account.refresh_token,
    expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : account.expires_at,
    refreshExpiresAt: refreshed.refresh_expires_in
      ? new Date(Date.now() + refreshed.refresh_expires_in * 1000).toISOString()
      : account.refresh_expires_at,
    scope: refreshed.scope || account.scope,
    avatarUrl: account.avatar_url,
    meta: account.meta || {},
  })

  return updated
}

export async function exchangeDouyinCodeForAccount(code: string) {
  const clientKey = process.env.DOUYIN_CLIENT_KEY || process.env.MARKET_DOUYIN_CLIENT_KEY || ""
  const clientSecret = process.env.DOUYIN_CLIENT_SECRET || process.env.MARKET_DOUYIN_CLIENT_SECRET || ""
  if (!clientKey || !clientSecret) {
    throw new Error("DOUYIN_CLIENT_KEY / DOUYIN_CLIENT_SECRET not configured")
  }

  const response = await fetch("https://open.douyin.com/oauth/access_token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  })

  const payload = (await response.json()) as {
    data?: {
      access_token?: string
      refresh_token?: string
      open_id?: string
      expires_in?: number
      refresh_expires_in?: number
      scope?: string
    }
    message?: string
  }

  if (!response.ok || !payload.data?.access_token) {
    throw new Error(payload.message || "Failed to exchange Douyin authorization code")
  }

  const openId = payload.data.open_id || ""
  const displayName = openId ? `Douyin ${createHash("sha256").update(openId).digest("hex").slice(0, 8)}` : "Douyin brand account"

  return upsertStoredPublishAccount({
    platform: "douyin",
    accountKey: "brand",
    displayName,
    openId,
    accessToken: payload.data.access_token || null,
    refreshToken: payload.data.refresh_token || null,
    expiresAt: payload.data.expires_in ? new Date(Date.now() + payload.data.expires_in * 1000).toISOString() : null,
    refreshExpiresAt: payload.data.refresh_expires_in ? new Date(Date.now() + payload.data.refresh_expires_in * 1000).toISOString() : null,
    scope: payload.data.scope || null,
    meta: {},
  })
}
