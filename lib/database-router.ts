import { createClient } from '@/lib/supabase/server'
import { getCloudBaseDb, isCloudBaseConfigured } from '@/lib/cloudbase/client'
import { getDeploymentRegion } from '@/config'
import type { DatabaseType, Region, DatabaseClient } from '@/lib/database/types'

// Re-export types for backward compatibility
export type { DatabaseType, Region, DatabaseClient }

/**
 * Get database client based on environment variable
 * - DEPLOYMENT_REGION=CN   → CloudBase
 * - DEPLOYMENT_REGION=INTL → Supabase
 */
export async function getDatabaseClient(): Promise<DatabaseClient> {
  const deploymentRegion = getDeploymentRegion()
  const isDomesticVersion = deploymentRegion === 'CN'

  if (isDomesticVersion) {
    // Domestic version: Use CloudBase
    if (!isCloudBaseConfigured()) {
      throw new Error(
        'CN deployment requires CloudBase configuration. Missing CLOUDBASE_ENV_ID/CLOUDBASE_SECRET_ID/CLOUDBASE_SECRET_KEY.'
      )
    }

    const cloudbaseDb = getCloudBaseDb()
    if (cloudbaseDb) {
      return {
        type: 'cloudbase',
        region: 'cn',
        cloudbase: cloudbaseDb
      }
    }

    throw new Error('CloudBase initialization failed in CN deployment. Please verify runtime environment and credentials.')
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
 */
export async function getDatabaseClientForUser(_request?: unknown): Promise<DatabaseClient> {
  return getDatabaseClient()
}
