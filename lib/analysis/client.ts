"use client"

import type { CreateFeedbackData, CreateUserBehaviorEventData, FeedbackSource } from "@/lib/admin/types"

const ANALYSIS_SESSION_KEY = "app_behavior_session_id"
const AUTH_USER_STORAGE_KEY = "chat_app_current_user"
const AUTH_TOKEN_STORAGE_KEY = "chat_app_token"

type AnalysisUserIdentity = {
  userId?: string
  email?: string
  fetchedAt: number
}

let cachedIdentity: AnalysisUserIdentity | null = null

function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function getAnalysisSessionId() {
  if (typeof window === "undefined") return "server"

  const current = window.sessionStorage.getItem(ANALYSIS_SESSION_KEY)
  if (current) return current

  const next = createSessionId()
  window.sessionStorage.setItem(ANALYSIS_SESSION_KEY, next)
  return next
}

function readStoredUser() {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { id?: string; email?: string }
    return parsed?.id ? parsed : null
  } catch {
    return null
  }
}

function hasStoredAuthHint() {
  if (typeof window === "undefined") return false
  return Boolean(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || window.localStorage.getItem(AUTH_USER_STORAGE_KEY))
}

export function resolveClientSource(): FeedbackSource {
  if (typeof window === "undefined") return "web"

  const searchParams = new URLSearchParams(window.location.search)
  const explicitSource =
    searchParams.get("source") ||
    searchParams.get("channel") ||
    searchParams.get("from") ||
    searchParams.get("ref")
  if (explicitSource === "email" || explicitSource === "system") return explicitSource
  if (explicitSource) return "app"

  const ua = window.navigator.userAgent.toLowerCase()
  if ((window as any).Android) return "app"
  if ((window as any).webkit?.messageHandlers?.deviceInfo) return "app"
  if (ua.includes("miniprogram")) return "app"
  if (ua.includes("micromessenger")) return "app"
  return "web"
}

export function setAnalysisIdentity(user?: { id?: string | null; email?: string | null } | null) {
  cachedIdentity = {
    userId: user?.id || undefined,
    email: user?.email || undefined,
    fetchedAt: Date.now(),
  }
}

export function clearAnalysisIdentity() {
  cachedIdentity = {
    userId: undefined,
    email: undefined,
    fetchedAt: Date.now(),
  }
}

async function resolveAnalysisIdentity() {
  const now = Date.now()
  if (cachedIdentity && now - cachedIdentity.fetchedAt < 5 * 60 * 1000) {
    return cachedIdentity
  }

  const storedUser = readStoredUser()
  if (storedUser?.id) {
    cachedIdentity = {
      userId: storedUser.id,
      email: storedUser.email || undefined,
      fetchedAt: now,
    }
    return cachedIdentity
  }

  if (!hasStoredAuthHint()) {
    cachedIdentity = { fetchedAt: now }
    return cachedIdentity
  }

  try {
    const response = await fetch("/api/users/profile", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    })

    if (!response.ok) {
      cachedIdentity = { fetchedAt: now }
      return cachedIdentity
    }

    const result = await response.json().catch(() => null)
    const user = result?.user as { id?: string; email?: string } | undefined

    cachedIdentity = {
      userId: user?.id || undefined,
      email: user?.email || undefined,
      fetchedAt: now,
    }
    return cachedIdentity
  } catch {
    cachedIdentity = { fetchedAt: now }
    return cachedIdentity
  }
}

function sendJson(url: string, payload: unknown, options?: { keepalive?: boolean; preferBeacon?: boolean }) {
  if (typeof window === "undefined") return Promise.resolve(false)

  if (options?.preferBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" })
      return Promise.resolve(navigator.sendBeacon(url, blob))
    } catch {
      return Promise.resolve(false)
    }
  }

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: options?.keepalive,
  })
    .then((response) => response.ok)
    .catch(() => false)
}

export async function trackBehaviorEvent(
  payload: Partial<CreateUserBehaviorEventData> & Pick<CreateUserBehaviorEventData, "event_type" | "feature_key">,
  options?: { keepalive?: boolean; preferBeacon?: boolean },
) {
  const featureKey = String(payload.feature_key || "").trim()
  const eventType = String(payload.event_type || "").trim()
  if (!featureKey || !eventType) return false

  const identity = await resolveAnalysisIdentity()
  const body: CreateUserBehaviorEventData = {
    user_id: payload.user_id || identity.userId,
    session_id: payload.session_id || getAnalysisSessionId(),
    event_type: payload.event_type,
    feature_key: featureKey,
    page_path: payload.page_path,
    source: payload.source || resolveClientSource(),
    duration_ms: payload.duration_ms,
    scroll_depth: payload.scroll_depth,
    properties: payload.properties || {},
    occurred_at: payload.occurred_at || new Date().toISOString(),
  }

  return sendJson("/api/analysis/events", body, options)
}

export async function submitAnalysisFeedback(
  payload: Pick<CreateFeedbackData, "content"> & Partial<CreateFeedbackData>,
  options?: { keepalive?: boolean; preferBeacon?: boolean },
) {
  const content = String(payload.content || "").trim()
  if (!content) return false

  const identity = await resolveAnalysisIdentity()
  const body: CreateFeedbackData = {
    user_id: payload.user_id || identity.userId,
    email: payload.email || identity.email,
    content,
    source: payload.source || resolveClientSource(),
    images: payload.images || [],
    screenshot_urls: payload.screenshot_urls || [],
    version: payload.version,
    feature_key: payload.feature_key,
    pros: payload.pros || [],
    cons: payload.cons || [],
    metadata: payload.metadata || {},
    status: payload.status,
  }

  return sendJson("/api/analysis/feedback", body, options)
}
