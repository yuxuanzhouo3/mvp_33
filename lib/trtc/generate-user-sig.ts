import crypto from 'crypto'
import zlib from 'zlib'

function toURLSafeBase64(value: string): string {
  return value.replace(/\+/g, '*').replace(/\//g, '-').replace(/=/g, '_')
}

export function generateUserSig(userId: string, expire = 604800): string {
  const sdkAppId = Number.parseInt(process.env.TENCENT_TRTC_SDK_APP_ID || '0', 10)
  const secretKey = process.env.TENCENT_TRTC_SECRET_KEY || ''

  if (!sdkAppId || !secretKey) {
    throw new Error('Missing TRTC SDKAppID or secret key in environment variables')
  }

  const currTime = Math.floor(Date.now() / 1000)
  const signContent = [
    `TLS.identifier:${userId}`,
    `TLS.sdkappid:${sdkAppId}`,
    `TLS.time:${currTime}`,
    `TLS.expire:${expire}`,
    '',
  ].join('\n')

  const sig = crypto.createHmac('sha256', secretKey).update(signContent).digest('base64')

  const payload = {
    'TLS.ver': '2.0',
    'TLS.identifier': userId,
    'TLS.sdkappid': sdkAppId,
    'TLS.expire': expire,
    'TLS.time': currTime,
    'TLS.sig': sig,
  }

  const compressed = zlib.deflateSync(Buffer.from(JSON.stringify(payload)))
  return toURLSafeBase64(compressed.toString('base64'))
}
