import cloudbase from '@cloudbase/node-sdk'

let cloudbaseApp: any = null
let cloudbaseDb: any = null

/**
 * Initialize CloudBase client
 * This should be called once at startup
 */
export function initCloudBase() {
  if (cloudbaseApp) {
    return cloudbaseApp
  }

  const envId = process.env.CLOUDBASE_ENV_ID
  const secretId = process.env.CLOUDBASE_SECRET_ID
  const secretKey = process.env.CLOUDBASE_SECRET_KEY

  if (!envId || !secretId || !secretKey) {
    console.warn('CloudBase environment variables not configured')
    return null
  }

  try {
    cloudbaseApp = cloudbase.init({
      env: envId,
      secretId: secretId,
      secretKey: secretKey,
    })

    cloudbaseDb = cloudbaseApp.database()

    console.log('[CloudBase] Initialized successfully with env:', envId)
    return cloudbaseApp
  } catch (error: any) {
    console.error('[CloudBase] Initialization failed:', {
      error: error.message,
      code: error.code,
      envId: envId ? 'SET' : 'NOT SET',
      secretId: secretId ? 'SET' : 'NOT SET',
      secretKey: secretKey ? 'SET' : 'NOT SET',
    })
    return null
  }
}

/**
 * Get CloudBase app instance
 */
export function getCloudBaseApp() {
  if (!cloudbaseApp) {
    initCloudBase()
  }
  return cloudbaseApp
}

/**
 * Get CloudBase database instance
 */
export function getCloudBaseDb() {
  if (!cloudbaseDb) {
    initCloudBase()
  }
  return cloudbaseDb
}

/**
 * Check if CloudBase is configured
 */
export function isCloudBaseConfigured(): boolean {
  return !!(
    process.env.CLOUDBASE_ENV_ID &&
    process.env.CLOUDBASE_SECRET_ID &&
    process.env.CLOUDBASE_SECRET_KEY
  )
}

// Initialize on module load
initCloudBase()





