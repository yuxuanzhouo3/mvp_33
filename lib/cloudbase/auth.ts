import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getUserById } from './database'
import { User } from '../types'

const SESSION_COOKIE_NAME = 'cb_session'
const DEFAULT_SESSION_TTL = 7 * 24 * 60 * 60 // 7 days

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
    const token = cookieToken || headerToken
    if (!token) {
      return null
    }

    const payload = verifyToken(token)
    if (!payload) {
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

