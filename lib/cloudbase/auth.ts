import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getUserById } from './database'
import { getCloudBaseDB } from './db'
import { User } from '../types'

const SESSION_COOKIE_NAME = 'cb_session'
const DEFAULT_SESSION_TTL = 7 * 24 * 60 * 60 // 7 days
const REVOKED_SESSIONS_COLLECTION = 'revoked_sessions'

const base64UrlEncode = (input: Buffer | string) =>
  Buffer.from(input).toString('base64url')

const base64UrlDecode = (input: string) =>
  Buffer.from(input, 'base64url').toString()

function getSessionSecret() {
  const secret = process.env.CLOUDBASE_SESSION_SECRET
  if (!secret) {
    throw new Error(
      'CLOUDBASE_SESSION_SECRET is not set. Please configure it in .env.local'
    )
  }
  return secret
}

function getSessionTtlSeconds() {
  const ttl = Number(process.env.CLOUDBASE_SESSION_TTL || DEFAULT_SESSION_TTL)
  return Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_SESSION_TTL
}

export interface CloudBaseSessionPayload {
  sub: string
  region: 'cn'
  email?: string
  provider?: string
  provider_id?: string
  iat: number
  exp: number
}

export interface CloudBaseAuthContext {
  token: string
  payload: CloudBaseSessionPayload
  user: User
}

function signPayload(payload: CloudBaseSessionPayload) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const unsignedToken = `${encodedHeader}.${encodedPayload}`

  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(unsignedToken)
    .digest('base64url')

  return `${unsignedToken}.${signature}`
}

function verifyToken(token: string): CloudBaseSessionPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [encodedHeader, encodedPayload, signature] = parts
  const unsignedToken = `${encodedHeader}.${encodedPayload}`
  const expectedSignature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(unsignedToken)
    .digest('base64url')

  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as CloudBaseSessionPayload
    if (payload.exp * 1000 < Date.now()) {
      return null
    }
    return payload
  } catch (error) {
    console.error('[CloudBase Session] Failed to decode payload:', error)
    return null
  }
}

function decodeTokenPayloadUnsafe(token: string): CloudBaseSessionPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(base64UrlDecode(parts[1])) as CloudBaseSessionPayload
    return payload
  } catch {
    return null
  }
}

export function hashCloudBaseSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function revokeCloudBaseSessionToken(
  token: string,
  userId: string,
  reason: string = 'device_kick'
): Promise<void> {
  if (!token) return
  const db = getCloudBaseDB()
  if (!db) return

  const tokenHash = hashCloudBaseSessionToken(token)
  const payload = decodeTokenPayloadUnsafe(token)
  const expiresAt = payload?.exp
    ? new Date(payload.exp * 1000).toISOString()
    : new Date(Date.now() + DEFAULT_SESSION_TTL * 1000).toISOString()
  const now = new Date().toISOString()

  try {
    const existing = await db.collection(REVOKED_SESSIONS_COLLECTION)
      .where({ token_hash: tokenHash })
      .limit(1)
      .get()

    if (existing.data && existing.data.length > 0) {
      await db.collection(REVOKED_SESSIONS_COLLECTION)
        .doc(existing.data[0]._id)
        .update({
          user_id: userId,
          reason,
          revoked_at: now,
          expires_at: expiresAt,
          updated_at: now,
        })
      return
    }

    await db.collection(REVOKED_SESSIONS_COLLECTION).add({
      token_hash: tokenHash,
      user_id: userId,
      reason,
      revoked_at: now,
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    })
  } catch (error: any) {
    if (error?.code === 'DATABASE_COLLECTION_NOT_EXIST') {
      console.warn('[CloudBase Session] revoked_sessions collection not found, skip revoke persist')
      return
    }
    throw error
  }
}

async function isCloudBaseSessionRevoked(token: string): Promise<boolean> {
  if (!token) return false
  const db = getCloudBaseDB()
  if (!db) return false

  const tokenHash = hashCloudBaseSessionToken(token)
  try {
    const result = await db.collection(REVOKED_SESSIONS_COLLECTION)
      .where({ token_hash: tokenHash })
      .limit(1)
      .get()

    if (!result.data || result.data.length === 0) return false
    const record = result.data[0]
    const expiresAtTs = Date.parse(String(record.expires_at || ''))
    if (Number.isFinite(expiresAtTs) && expiresAtTs <= Date.now()) {
      return false
    }
    return true
  } catch (error: any) {
    if (error?.code === 'DATABASE_COLLECTION_NOT_EXIST') {
      return false
    }
    console.error('[CloudBase Session] Failed to check revoked session:', error)
    return false
  }
}

export function createCloudBaseSession(user: User, overrides?: Partial<CloudBaseSessionPayload>) {
  const now = Math.floor(Date.now() / 1000)
  const payload: CloudBaseSessionPayload = {
    sub: user.id,
    region: 'cn',
    email: user.email,
    provider: (user as any).provider || overrides?.provider,
    provider_id: (user as any).provider_id || overrides?.provider_id,
    iat: now,
    exp: now + getSessionTtlSeconds(),
    ...overrides,
  }

  return signPayload(payload)
}

export async function getCloudBaseAuthFromRequest(
  request: NextRequest
): Promise<CloudBaseAuthContext | null> {
  try {
    const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const headerToken = request.headers.get('x-cloudbase-session')
    const authHeader = request.headers.get('authorization') || ''
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : ''
    const token = cookieToken || headerToken || bearerToken
    if (!token) {
      return null
    }

    const payload = verifyToken(token)
    if (!payload) {
      return null
    }

    const revoked = await isCloudBaseSessionRevoked(token)
    if (revoked) {
      return null
    }

    const user = await getUserById(payload.sub)
    if (!user) {
      return null
    }

    return {
      token,
      payload,
      user,
    }
  } catch (error) {
    console.error('[CloudBase Session] Failed to verify session:', error)
    return null
  }
}

export function setCloudBaseSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: getSessionTtlSeconds(),
  })
}

export function clearCloudBaseSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    maxAge: 0,
    path: '/',
  })
}

export function getCloudBaseSessionToken(request: NextRequest): string | null {
  const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const headerToken = request.headers.get('x-cloudbase-session')
  const authHeader = request.headers.get('authorization') || ''
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  return cookieToken || headerToken || bearerToken || null
}

export async function verifyCloudBaseSession(request: NextRequest): Promise<User | null> {
  const auth = await getCloudBaseAuthFromRequest(request)
  return auth?.user || null
}

/**
 * Get current user from CloudBase session (for API routes)
 */
export async function getCloudBaseUser(request: NextRequest): Promise<User | null> {
  return await verifyCloudBaseSession(request)
}


