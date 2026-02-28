function readEnv(name: string): string {
  return (process.env[name] || '').trim()
}

/**
 * Resolve deployment region in a runtime-safe way.
 * Priority:
 * 1. DEPLOYMENT_REGION
 * 2. current host (for client runtime)
 * 3. NEXT_PUBLIC_SITE_URL host hint
 * 4. fallback INTL
 */
export function getDeploymentRegion(): 'CN' | 'INTL' {
  const region = readEnv('DEPLOYMENT_REGION').toUpperCase()

  if (region === 'CN') {
    return 'CN'
  }
  if (region === 'INTL' || region === 'GLOBAL') {
    return 'INTL'
  }

  // Client-side runtime fallback: infer from host.
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname.toLowerCase()
    if (host.includes('mornscience.top')) {
      return 'CN'
    }
    if (host.includes('mornscience.work')) {
      return 'INTL'
    }
  }

  const siteUrl = readEnv('NEXT_PUBLIC_SITE_URL').toLowerCase()
  if (siteUrl) {
    if (siteUrl.includes('mornscience.top')) {
      return 'CN'
    }
    if (siteUrl.includes('mornscience.work')) {
      return 'INTL'
    }
  }

  return 'INTL'
}

export function isDomesticDeployment(): boolean {
  return getDeploymentRegion() === 'CN'
}

const DEPLOYMENT_REGION = getDeploymentRegion()

export const IS_CN_DEPLOYMENT = DEPLOYMENT_REGION === 'CN'
export const IS_INTL_DEPLOYMENT = DEPLOYMENT_REGION === 'INTL'

// backward compatibility
export const IS_DOMESTIC_VERSION = IS_CN_DEPLOYMENT
export const DEFAULT_REGION: 'cn' | 'global' = IS_CN_DEPLOYMENT ? 'cn' : 'global'
export const DEFAULT_LANGUAGE = IS_CN_DEPLOYMENT ? 'zh' : 'en'

// 应用配置
export const APP_CONFIG = {
  name: 'Enterprise Chat',
  description: IS_CN_DEPLOYMENT ? '企业级通讯平台' : 'Enterprise Communication Platform',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
}

// 数据库配置
export const DATABASE_CONFIG = {
  domestic: {
    provider: 'cloudbase',
    region: 'cn' as const,
    enabled: IS_CN_DEPLOYMENT,
  },
  international: {
    provider: 'supabase',
    region: 'global' as const,
    enabled: IS_INTL_DEPLOYMENT,
  },
}

// 获取当前数据库配置
export const getCurrentDatabaseConfig = () => {
  return IS_CN_DEPLOYMENT ? DATABASE_CONFIG.domestic : DATABASE_CONFIG.international
}
