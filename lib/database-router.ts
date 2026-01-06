import { createClient } from '@/lib/supabase/server'
import { createCNClient } from '@/lib/supabase/server-cn'
import { getCloudBaseDb, isCloudBaseConfigured } from '@/lib/cloudbase/client'
import { detectRegionFromRequest } from '@/lib/server/ip-detector'
import type { DatabaseType, Region, DatabaseClient } from '@/lib/database/types'

// Re-export types for backward compatibility
export type { DatabaseType, Region, DatabaseClient }

/**
 * Check if we should force global database (Supabase only, no Cloudbase)
 * This is useful for US Vercel deployment where we only want Supabase
 */
function shouldForceGlobalDatabase(): boolean {
  return process.env.FORCE_GLOBAL_DATABASE === 'true' || 
         process.env.NEXT_PUBLIC_FORCE_GLOBAL === 'true'
}

// Cache for user region info (in-memory, per request lifecycle)
// Key: userId, Value: { region: string, country: string, timestamp: number }
const userRegionCache = new Map<string, { region: string | null, country: string | null, timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get client IP from NextRequest headers
 */
function getClientIP(request: any): string | null {
  // NextRequest has headers as a Headers object
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
  
  // Try to get from NextRequest ip property
  if (request.ip) {
    return request.ip
  }
  
  return null
}

/**
 * Detect region from IP address
 * Simple check: if IP is in China, return 'cn', otherwise 'global'
 * For production, you should use a proper IP geolocation service
 */
async function detectRegionFromIP(ip: string | null): Promise<Region> {
  if (!ip) {
    return 'global'
  }

  // For now, we'll use a simple heuristic
  // In production, use a proper IP geolocation API
  // You can also check the user's profile region or use the RegionContext
  
  // Default to global, but can be enhanced with IP geolocation
  return 'global'
}

/**
 * Determine database region based on:
 * 1. User's registered region (from profile)
 * 2. Request region parameter
 * 3. User's country (from profile)
 * 4. IP detection (default to global for now, can be enhanced)
 */
async function determineRegion(
  request: any,
  userRegion: string | null,
  requestRegion: string | null,
  userCountry: string | null
): Promise<Region> {
  // Priority 1: Use user's registered region
  if (userRegion === 'cn' || userRegion === 'global') {
    return userRegion
  }

  // Priority 2: Use request region parameter
  if (requestRegion === 'cn' || requestRegion === 'global') {
    return requestRegion
  }

  // Priority 3: Determine by user's country
  if (userCountry === 'CN' || userCountry === 'cn') {
    return 'cn'
  }

  // Priority 4: Detect from IP (for now, default to global)
  // TODO: Implement proper IP geolocation service
  // For now, we'll rely on user profile region and country
  const clientIP = getClientIP(request)
  
  // If IP detection is needed, implement it here
  // For now, default to global
  return 'global'
}

/**
 * Get database client based on region
 * - China (cn) → CloudBase
 * - Global → Supabase
 * 
 * If FORCE_GLOBAL_DATABASE=true, always returns Supabase (Global) regardless of region
 */
export async function getDatabaseClient(
  request: any,
  userRegion?: string | null,
  requestRegion?: string | null,
  userCountry?: string | null
): Promise<DatabaseClient> {
  // FORCE GLOBAL: If environment variable is set, always use Supabase (Global)
  // This is for US Vercel deployment where we only want Supabase, no Cloudbase
  if (shouldForceGlobalDatabase()) {
    console.log('[getDatabaseClient] FORCE_GLOBAL_DATABASE enabled, using Supabase (Global) only')
    const supabase = await createClient()
    return {
      type: 'supabase',
      region: 'global',
      supabase
    }
  }

  const region = await determineRegion(request, userRegion || null, requestRegion || null, userCountry || null)
  
  if (region === 'cn') {
    // China region: Use CloudBase
    if (isCloudBaseConfigured()) {
      const cloudbaseDb = getCloudBaseDb()
      if (cloudbaseDb) {
        return {
          type: 'cloudbase',
          region: 'cn',
          cloudbase: cloudbaseDb
        }
      }
    }
    
    // Fallback: If CloudBase not configured, try CN Supabase
    try {
      const supabaseCN = await createCNClient()
      return {
        type: 'supabase',
        region: 'cn',
        supabase: supabaseCN
      }
    } catch (error) {
      // If CN Supabase also fails, fallback to global Supabase
      console.warn('CN database not configured, falling back to global Supabase')
      const supabase = await createClient()
      return {
        type: 'supabase',
        region: 'global',
        supabase
      }
    }
  } else {
    // Global region: Use Supabase
    const supabase = await createClient()
    return {
      type: 'supabase',
      region: 'global',
      supabase
    }
  }
}

/**
 * Get database client for authenticated user
 * Automatically detects region from user profile (registered region, not current IP)
 * Optimized: Only queries the database matching the current IP region
 * 
 * If FORCE_GLOBAL_DATABASE=true, always returns Supabase (Global) and skips Cloudbase queries
 */
export async function getDatabaseClientForUser(request: any): Promise<DatabaseClient> {
  // FORCE GLOBAL: If environment variable is set, always use Supabase (Global)
  // This is for US Vercel deployment where we only want Supabase, no Cloudbase
  if (shouldForceGlobalDatabase()) {
    console.log('[getDatabaseClientForUser] FORCE_GLOBAL_DATABASE enabled, using Supabase (Global) only')
    const supabase = await createClient()
    return {
      type: 'supabase',
      region: 'global',
      supabase
    }
  }

  // First, get user from global Supabase (for authentication)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    // Not authenticated, use default routing
    return getDatabaseClient(request)
  }

  // Detect current IP region to determine which database to query
  const currentIPRegion = await detectRegionFromRequest(request)
  const clientIP = getClientIP(request)
  // Check for localhost in various formats
  const isLocalhost = !clientIP || 
    clientIP === '127.0.0.1' || 
    clientIP === '::1' || 
    clientIP === 'localhost' || 
    clientIP.includes('127.0.0.1') || 
    clientIP.includes('::ffff:127.0.0.1')
  
  console.log('[getDatabaseClientForUser] Current IP:', clientIP, 'region:', currentIPRegion, 'isLocalhost:', isLocalhost, 'userId:', user.id)

  // Get user profile to determine region (registered region, not current IP)
  // OPTIMIZED: Check cache first to avoid repeated database queries
  let userRegion: string | null = null
  let userCountry: string | null = null
  
  const cached = userRegionCache.get(user.id)
  const now = Date.now()
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    userRegion = cached.region
    userCountry = cached.country
    console.log('[getDatabaseClientForUser] ✅ Using cached user region:', { userRegion, userCountry })
  } else {
    // Cache miss or expired, fetch from database
    // IMPORTANT: For localhost, always query CloudBase first (since user is Chinese and registered in CloudBase)
    // For production: only query the database matching the IP region
    // NOTE: If FORCE_GLOBAL_DATABASE is set, we skip this entire block (handled at function start)
    if (isLocalhost || currentIPRegion === 'cn') {
    // Localhost or China IP → query CloudBase first
    // BUT: Skip Cloudbase if FORCE_GLOBAL_DATABASE is set (shouldn't reach here, but safety check)
    if (shouldForceGlobalDatabase()) {
      // Force global mode, only query Supabase
      console.log('[getDatabaseClientForUser] FORCE_GLOBAL_DATABASE enabled, skipping Cloudbase query')
    } else {
      try {
        const { getUserById } = await import('@/lib/database/cloudbase/users')
        const cloudbaseUser = await getUserById(user.id)
        if (cloudbaseUser) {
          userRegion = cloudbaseUser.region || null
          userCountry = cloudbaseUser.country || null
          // Update cache
          userRegionCache.set(user.id, { region: userRegion, country: userCountry, timestamp: now })
          console.log('[getDatabaseClientForUser] ✅ Found user in CloudBase:', { userRegion, userCountry })
        } else {
          // If not found in CloudBase and we're on localhost, try Supabase as fallback
          if (isLocalhost) {
            console.log('[getDatabaseClientForUser] User not found in CloudBase, trying Supabase (localhost fallback)')
            try {
              const { data: profile } = await supabase
                .from('users')
                .select('region, country')
                .eq('id', user.id)
                .maybeSingle()
              
              if (profile) {
                userRegion = profile.region || null
                userCountry = profile.country || null
                // Update cache
                userRegionCache.set(user.id, { region: userRegion, country: userCountry, timestamp: now })
                console.log('[getDatabaseClientForUser] Found user in Supabase (fallback):', { userRegion, userCountry })
              }
            } catch (supabaseError) {
              console.error('[getDatabaseClientForUser] Error querying Supabase (fallback):', supabaseError)
            }
          } else {
            console.warn('[getDatabaseClientForUser] User not found in CloudBase (China IP)')
          }
        }
      } catch (cloudbaseError) {
        console.error('[getDatabaseClientForUser] Error querying CloudBase:', cloudbaseError)
        // If CloudBase query fails and we're on localhost, try Supabase
        if (isLocalhost) {
          try {
            const { data: profile } = await supabase
              .from('users')
              .select('region, country')
              .eq('id', user.id)
              .maybeSingle()
            
            if (profile) {
              userRegion = profile.region || null
              userCountry = profile.country || null
              // Update cache
              userRegionCache.set(user.id, { region: userRegion, country: userCountry, timestamp: now })
              console.log('[getDatabaseClientForUser] Found user in Supabase (error fallback):', { userRegion, userCountry })
            }
          } catch (error) {
            console.error('[getDatabaseClientForUser] Error querying Supabase (error fallback):', error)
          }
        }
      }
    }
  } else {
    // Global IP (not localhost) → only query Supabase
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('region, country')
        .eq('id', user.id)
        .maybeSingle()
      
      if (profile) {
        userRegion = profile.region || null
        userCountry = profile.country || null
        // Update cache
        userRegionCache.set(user.id, { region: userRegion, country: userCountry, timestamp: now })
        console.log('[getDatabaseClientForUser] Found user in Supabase:', { userRegion, userCountry })
      } else {
        console.warn('[getDatabaseClientForUser] User not found in Supabase (Global IP)')
      }
    } catch (error) {
      console.error('[getDatabaseClientForUser] Error querying Supabase:', error)
    }
    }
    
    if (!userRegion) {
      console.warn('[getDatabaseClientForUser] User profile not found in any database')
      // For localhost, default to 'cn' since user is Chinese
      // For production, use detected IP region
      userRegion = isLocalhost ? 'cn' : currentIPRegion
      // Cache the default value too
      userRegionCache.set(user.id, { region: userRegion, country: userCountry, timestamp: now })
      console.log('[getDatabaseClientForUser] Defaulting to region:', userRegion, '(isLocalhost:', isLocalhost, ')')
    }
  }

  // Always use registered region (priority 1), ignore current IP
  // This ensures users always use the database they registered with
  return getDatabaseClient(request, userRegion, null, userCountry)
}

