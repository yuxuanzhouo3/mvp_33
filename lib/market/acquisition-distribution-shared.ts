import type {
  AcquisitionDistributionBootstrap,
  AcquisitionLeadSourceStatus,
  DemoDistributionAsset,
  OwnedDistributionChannel,
  SharePlatformConfig,
} from "./acquisition-distribution-types"

export const DEFAULT_SHARE_PLATFORMS: SharePlatformConfig[] = [
  { id: "x", label: "X", mode: "intent", hint: "Open X share composer" },
  { id: "linkedin", label: "LinkedIn", mode: "intent", hint: "Open LinkedIn share composer" },
  { id: "facebook", label: "Facebook", mode: "intent", hint: "Open Facebook share dialog" },
  { id: "telegram", label: "Telegram", mode: "intent", hint: "Open Telegram share dialog" },
  { id: "whatsapp", label: "WhatsApp", mode: "intent", hint: "Open WhatsApp share dialog" },
  { id: "weibo", label: "Weibo", mode: "intent", hint: "Open Weibo share dialog" },
  { id: "xiaohongshu", label: "Xiaohongshu", mode: "copy", hint: "Copy assisted publish copy for Xiaohongshu" },
  { id: "email", label: "Email", mode: "intent", hint: "Open email composer" },
]

export const DEFAULT_OWNED_CHANNELS: OwnedDistributionChannel[] = [
  { id: "wechat-oa", label: "WeChat OA", handle: "@mornchat_cn", region: "CN", type: "owned", mode: "direct", hint: "Publish directly to the authorized official account" },
  { id: "xiaohongshu-brand", label: "Xiaohongshu", handle: "@mornchat", region: "CN", type: "owned", mode: "copy" },
  { id: "douyin-brand", label: "Douyin", handle: "@mornchat_official", region: "CN", type: "owned", mode: "direct", hint: "Publish through the authorized Douyin connector" },
  { id: "weibo-brand", label: "Weibo", handle: "@MornChat", region: "CN", type: "owned", mode: "intent" },
  { id: "linkedin-page", label: "LinkedIn Page", handle: "linkedin.com/company/mornchat", region: "INTL", type: "owned", mode: "intent" },
  { id: "x-brand", label: "X Brand", handle: "@mornchat", region: "INTL", type: "owned", mode: "intent" },
  { id: "facebook-page", label: "Facebook Page", handle: "facebook.com/mornchat", region: "INTL", type: "owned", mode: "intent" },
  { id: "telegram-channel", label: "Telegram Channel", handle: "t.me/mornchat", region: "INTL", type: "owned", mode: "intent" },
  { id: "medium-brand", label: "Medium", handle: "medium.com/@mornchat", region: "INTL", type: "owned", mode: "copy" },
]

function cloneSharePlatforms(items: SharePlatformConfig[]) {
  return items.map((item) => ({ ...item }))
}

function cloneOwnedChannels(items: OwnedDistributionChannel[]) {
  return items.map((item) => ({ ...item }))
}

export function createAcquisitionDistributionFallbackBootstrap(input?: {
  assets?: DemoDistributionAsset[]
  sharePlatforms?: SharePlatformConfig[]
  ownedChannels?: OwnedDistributionChannel[]
  leadSource?: AcquisitionLeadSourceStatus
  ops?: AcquisitionDistributionBootstrap["ops"]
  maxContactsPerRun?: number
}) {
  const assets = Array.isArray(input?.assets) ? input.assets : []
  const sharePlatforms = cloneSharePlatforms(input?.sharePlatforms?.length ? input.sharePlatforms : DEFAULT_SHARE_PLATFORMS)
  const ownedChannels = cloneOwnedChannels(input?.ownedChannels?.length ? input.ownedChannels : DEFAULT_OWNED_CHANNELS)

  return {
    assets,
    sharePlatforms,
    ownedChannels,
    guardrails: {
      maxContactsPerRun: input?.maxContactsPerRun ?? 1000,
      publicContactOnly: true,
      reviewRequired: true,
      ownedChannelCount: ownedChannels.length,
    },
    leadSource: input?.leadSource || {
      mode: "missing",
      provider: "bootstrap",
      path: null,
      note: "Distribution bootstrap fallback is active.",
      capabilities: [],
    },
    ...(input?.ops ? { ops: input.ops } : {}),
  } satisfies AcquisitionDistributionBootstrap
}
