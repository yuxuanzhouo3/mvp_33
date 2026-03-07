import { createHmac, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"

export const MARKET_ADMIN_SESSION_COOKIE = "market_admin_session"
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

function getMarketAdminSessionSecret() {
  return (
    process.env.MARKET_ADMIN_SESSION_SECRET ||
    process.env.MARKET_ADMIN_JWT_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.JWT_SECRET ||
    "market-admin-dev-secret-change-me"
  )
}

function getAdminCredentials() {
  const username = String(process.env.MARKET_ADMIN_USERNAME || process.env.ADMIN_USERNAME || "admin").trim()
  const password = String(process.env.MARKET_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "Zyx!213416").trim()
  return { username, password }
}

export function verifyMarketAdminLogin(input: { username?: string; password?: string }) {
  const { username, password } = getAdminCredentials()
  const rawPassword = String(input.password || "").trim()

  if (!password) {
    throw new Error("MARKET_ADMIN_PASSWORD is not configured")
  }

  return String(input.username || "").trim() === username && rawPassword === password
}

function signSessionPayload(payloadBase64: string) {
  return createHmac("sha256", getMarketAdminSessionSecret()).update(payloadBase64).digest("base64url")
}

function encodePayload(input: { sub: string; role: "market_admin"; exp: number }) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url")
}

export function createMarketAdminSessionToken(username: string) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  const payload = encodePayload({ sub: username, role: "market_admin", exp })
  const signature = signSessionPayload(payload)
  return `${payload}.${signature}`
}

export function decodeMarketAdminSessionToken(token?: string | null): { username: string } | null {
  if (!token) return null

  try {
    const [payloadBase64, signature] = String(token).split(".")
    if (!payloadBase64 || !signature) return null

    const expected = signSessionPayload(payloadBase64)
    const left = Buffer.from(signature)
    const right = Buffer.from(expected)
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null

    const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8")) as {
      sub?: string
      role?: string
      exp?: number
    }
    if (payload?.role !== "market_admin") return null
    if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null
    return { username: String(payload?.sub || "admin") }
  } catch {
    return null
  }
}

export function attachMarketAdminSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: MARKET_ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export function clearMarketAdminSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: MARKET_ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
}

export function readMarketAdminSessionFromRequest(request: NextRequest): { username: string } | null {
  const token = request.cookies.get(MARKET_ADMIN_SESSION_COOKIE)?.value
  return decodeMarketAdminSessionToken(token)
}

export function verifyMarketAdminToken(request: NextRequest): { ok: true; admin: { username: string } } | { ok: false; response: NextResponse } {
  const session = readMarketAdminSessionFromRequest(request)
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    }
  }

  return { ok: true, admin: session }
}
