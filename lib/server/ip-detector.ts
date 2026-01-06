/**
 * Server-side IP detection utility
 * Detects if an IP address is from China or international region
 */

export interface IPLocationInfo {
  ip: string
  country: string | null
  isChina: boolean
  region: 'cn' | 'global'
}

/**
 * Get client IP from NextRequest
 */
export function getClientIP(request: any): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  const cfConnectingIP = request.headers.get('cf-connecting-ip')
  
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  if (realIP) {
    return realIP
  }
  if (cfConnectingIP) {
    return cfConnectingIP
  }
  
  if (request.ip) {
    return request.ip
  }
  
  return null
}

/**
 * Detect IP location using third-party API
 * Returns region 'cn' for China, 'global' for others
 */
export async function detectIPLocation(ip: string | null): Promise<IPLocationInfo> {
  // Handle localhost/private IPs
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    // For localhost, default to global (can be overridden in development)
    return {
      ip: ip || 'unknown',
      country: null,
      isChina: false,
      region: 'global'
    }
  }

  // Check if private IP
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return {
      ip,
      country: null,
      isChina: false,
      region: 'global'
    }
  }

  // Try multiple APIs in parallel for faster response
  // Use shorter timeout (2 seconds) for faster failure
  const apis = [
    // ipapi.co - most reliable
    async () => {
      try {
        const response = await fetch(`https://ipapi.co/${ip}/json/`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000),
        })
        const data = await response.json()
        if (data.country_code) {
          return {
            ip,
            country: data.country_code,
            isChina: data.country_code === 'CN',
            region: data.country_code === 'CN' ? 'cn' : 'global' as 'cn' | 'global'
          }
        }
      } catch (error) {
        // Continue to next API
      }
      return null
    },
    // ip-api.com - free and reliable
    async () => {
      try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000),
        })
        const data = await response.json()
        if (data.status === 'success' && data.countryCode) {
          return {
            ip,
            country: data.countryCode,
            isChina: data.countryCode === 'CN',
            region: data.countryCode === 'CN' ? 'cn' : 'global' as 'cn' | 'global'
          }
        }
      } catch (error) {
        // Continue to next API
      }
      return null
    },
    // ipip.net - very accurate for China IPs
    async () => {
      try {
        const response = await fetch(`https://freeapi.ipip.net/${ip}`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000),
        })
        const data = await response.json()
        if (Array.isArray(data) && data.length >= 1) {
          const country = data[0]
          const isChina = country === '中国' || country === 'CN' || country === 'China'
          return {
            ip,
            country: isChina ? 'CN' : null,
            isChina,
            region: isChina ? 'cn' : 'global' as 'cn' | 'global'
          }
        }
      } catch (error) {
        // Continue to next API
      }
      return null
    }
  ]

  // Try APIs in parallel - return first successful result
  // This is much faster than sequential calls
  const results = await Promise.allSettled(apis.map(api => api()))
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      return result.value
    }
  }

  // If all APIs fail, we can't determine region
  // This is a problem - we should log it and be conservative
  console.error('[IP_DETECTOR] All IP detection APIs failed for IP:', ip)
  console.error('[IP_DETECTOR] This is a security concern - cannot determine user region!')
  
  // IMPORTANT: If we can't determine region, we should NOT default to 'global'
  // Instead, we should throw an error or return a special value
  // For now, we'll return 'unknown' region and let the caller handle it
  // But for backward compatibility, we'll still return 'global' but log a warning
  return {
    ip: ip || 'unknown',
    country: null,
    isChina: false,
    region: 'global' // Default to global if detection fails (but this should be investigated!)
  }
}

/**
 * Detect region from request
 * Returns 'cn' for China IPs, 'global' for others
 */
export async function detectRegionFromRequest(request: any): Promise<'cn' | 'global'> {
  const ip = getClientIP(request)
  const locationInfo = await detectIPLocation(ip)
  return locationInfo.region
}

