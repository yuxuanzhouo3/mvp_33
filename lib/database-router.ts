import { createClient } from '@/lib/supabase/server'
import { createCNClient } from '@/lib/supabase/server-cn'
import { getCloudBaseDb, isCloudBaseConfigured } from '@/lib/cloudbase/client'
import { IS_DOMESTIC_VERSION } from '@/config'
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


/**
 * Get database client based on environment variable
 * - Domestic version (zh) → CloudBase
 * - International version (en) → Supabase
 *
 * If FORCE_GLOBAL_DATABASE=true, always returns Supabase (Global)
 */
export async function getDatabaseClient(): Promise<DatabaseClient> {
  // FORCE GLOBAL: If environment variable is set, always use Supabase (Global)
  if (shouldForceGlobalDatabase()) {
    console.log('[getDatabaseClient] FORCE_GLOBAL_DATABASE enabled, using Supabase (Global) only')
    const supabase = await createClient()
    return {
      type: 'supabase',
      region: 'global',
      supabase
    }
  }

  if (IS_DOMESTIC_VERSION) {
    // Domestic version: Use CloudBase
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
      console.warn('CN database not configured, falling back to global Supabase')
      const supabase = await createClient()
      return {
        type: 'supabase',
        region: 'global',
        supabase
      }
    }
  } else {
    // International version: Use Supabase
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
 * Uses environment variable to determine database (same as getDatabaseClient)
 *
 * If FORCE_GLOBAL_DATABASE=true, always returns Supabase (Global)
 */
export async function getDatabaseClientForUser(): Promise<DatabaseClient> {
  return getDatabaseClient()
}

