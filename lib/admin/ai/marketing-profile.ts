import type { AiMarketingProfile } from '@/lib/admin/types'

const DEFAULT_MARKETING_PROFILE: AiMarketingProfile = {
  product_name: 'MornChat 企业协作工作台',
  product_summary: '聊天、文件、决策统一在一个空间，跨频道、跨设备协作更顺畅。',
  core_features: [
    '统一会话空间',
    '知识秒级检索',
    'AI 自动总结',
    '企业级安全',
    '多端连续体验',
    '结构化协作',
  ],
  marketing_angles: [
    '频道、私信与线程整合到一个入口。',
    '跨消息、文件和附件快速定位答案。',
    '把长讨论整理成要点和行动计划。',
    '权限控制、审计记录与合规策略一体化。',
    '网页、移动端与桌面端保持一致。',
    '固定决策、责任人和进度，一目了然。',
  ],
}

function normalizeString(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  return trimmed ? trimmed : null
}

function normalizeStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((item) => (typeof item === 'string' ? item.trim() : String(item === null || item === undefined ? '' : item).trim()))
      .filter((item) => item !== '')
  }
  if (typeof input === 'string') {
    return input
      .split(/[\n;、,，]+/)
      .map((item) => item.trim())
      .filter((item) => item !== '')
  }
  return []
}

export function getDefaultMarketingProfile(): AiMarketingProfile {
  return {
    product_name: DEFAULT_MARKETING_PROFILE.product_name,
    product_summary: DEFAULT_MARKETING_PROFILE.product_summary,
    core_features: [...DEFAULT_MARKETING_PROFILE.core_features],
    marketing_angles: [...DEFAULT_MARKETING_PROFILE.marketing_angles],
  }
}

export function sanitizeMarketingProfile(
  input: unknown,
  options?: { allowEmpty?: boolean },
): AiMarketingProfile {
  const fallback = getDefaultMarketingProfile()
  if (!input || typeof input !== 'object') {
    return fallback
  }
  const record = input as Record<string, unknown>
  const product_name = normalizeString(record.product_name) || fallback.product_name
  const product_summary = normalizeString(record.product_summary) || fallback.product_summary

  let core_features = normalizeStringArray(record.core_features)
  let marketing_angles = normalizeStringArray(record.marketing_angles)

  if (!options?.allowEmpty) {
    if (core_features.length === 0) core_features = [...fallback.core_features]
    if (marketing_angles.length === 0) marketing_angles = [...fallback.marketing_angles]
  }

  return {
    product_name,
    product_summary,
    core_features,
    marketing_angles,
  }
}






