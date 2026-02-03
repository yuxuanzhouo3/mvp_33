/**
 * Helpers to map user emails to region-scoped aliases for Supabase Auth.
 * CloudBase users in the China region share the same email address as their global
 * accounts, so we suffix the auth email with a deterministic marker to keep the
 * Supabase identity unique while allowing the user to keep their real email for UI.
 */

const REGION_SUFFIX = '__cn'

/**
 * Build a deterministic Supabase Auth email for a region-specific account.
 * For non-cn regions we just use the original email.
 */
export function toRegionAuthEmail(email: string, region: 'cn' | 'global'): string {
  if (region !== 'cn') {
    return email
  }

  const atIndex = email.indexOf('@')
  if (atIndex === -1) {
    return email
  }

  const local = email.substring(0, atIndex)
  const domain = email.substring(atIndex + 1)

  // Remove existing suffix to avoid duplicates if this runs multiple times
  const sanitizedLocal = local.replace(new RegExp(`${REGION_SUFFIX}$`, 'i'), '')

  return `${sanitizedLocal}${REGION_SUFFIX}@${domain}`
}

/**
 * Determines if the stored auth email already contains the region suffix.
 */
export function isRegionAuthEmail(email: string | null | undefined, region: 'cn' | 'global'): boolean {
  if (!email) return false
  if (region !== 'cn') return true
  return email.includes(`${REGION_SUFFIX}@`)
}

































































