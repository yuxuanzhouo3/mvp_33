"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileSearch,
  FolderOpen,
  Globe2,
  Loader2,
  Mail,
  Megaphone,
  Radar,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createAcquisitionDistributionFallbackBootstrap } from "@/lib/market/acquisition-distribution-shared"
import { canNativeShare, nativeShareLink } from "@/lib/market/share-client"
import type {
  AcquisitionCrawlerPersistSummary,
  AcquisitionDistributionBootstrap,
  AcquisitionPartnershipActivationSummary,
  AcquisitionReplyPersistSummary,
  CrawlerLead,
  CrawlerLeadContact,
  DirectPublishResult,
  OwnedDistributionChannel,
  OutreachBatchResult,
  SharePlatformConfig,
} from "@/lib/market/acquisition-distribution-types"

type MarketLocale = "zh" | "en"
type TargetType = "blogger" | "b2b" | "vc"
type ReplyDisposition = "positive" | "needs_info" | "negotiating" | "negative" | "manual_review"

type ReplyInsight = {
  disposition: ReplyDisposition
  summary: string
  nextStep: string
}

function tx(locale: MarketLocale, zh: string, en: string) {
  return locale === "zh" ? zh : en
}

function normalizeOrigin(rawValue: string | null | undefined) {
  const raw = String(rawValue || "").trim()
  if (!raw) return ""

  try {
    return new URL(raw).origin
  } catch {
    return ""
  }
}

function isPrivateHostname(hostname: string) {
  const value = hostname.toLowerCase()
  if (!value) return true
  if (value === "localhost" || value === "0.0.0.0" || value === "::1" || value === "[::1]") return true
  if (value.startsWith("127.")) return true
  if (value.startsWith("10.")) return true
  if (value.startsWith("192.168.")) return true

  const match = value.match(/^172\.(\d{1,3})\./)
  if (match) {
    const second = Number(match[1])
    if (second >= 16 && second <= 31) return true
  }

  return false
}

function resolveBundleOrigin() {
  if (typeof window !== "undefined") {
    return normalizeOrigin(window.location.origin)
  }
  return normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL)
}

function isPublicDeliveryOrigin(origin: string) {
  if (!origin) return false
  try {
    const parsed = new URL(origin)
    return parsed.protocol === "https:" && !isPrivateHostname(parsed.hostname)
  } catch {
    return false
  }
}

function getAuthHeaders() {
  if (typeof document === "undefined") {
    return { "Content-Type": "application/json" }
  }

  const cookies = document.cookie.split(";").map((entry) => entry.trim())
  const sessionCookie = cookies.find((entry) => entry.startsWith("market_admin_session="))
  const token = sessionCookie?.split("=")[1] || ""

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function buildShareUrl(platformId: string, payload: { url: string; title: string; text: string }) {
  const encodedUrl = encodeURIComponent(payload.url)
  const encodedTitle = encodeURIComponent(payload.title)
  const encodedText = encodeURIComponent(payload.text)

  switch (platformId) {
    case "x":
      return `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
    case "telegram":
      return `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(`${payload.text} ${payload.url}`)}`
    case "weibo":
      return `https://service.weibo.com/share/share.php?url=${encodedUrl}&title=${encodedText}`
    case "email":
      return `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(`${payload.text}\n\n${payload.url}`)}`
    default:
      return payload.url
  }
}

function buildOwnedChannelUrl(channel: OwnedDistributionChannel, payload: { url: string; title: string; text: string }) {
  if (channel.id === "weibo-brand") return buildShareUrl("weibo", payload)
  if (channel.id === "linkedin-page") return buildShareUrl("linkedin", payload)
  if (channel.id === "x-brand") return buildShareUrl("x", payload)
  if (channel.id === "facebook-page") return buildShareUrl("facebook", payload)
  if (channel.id === "telegram-channel") return buildShareUrl("telegram", payload)
  return payload.url
}

function getModeLabel(locale: MarketLocale, mode: SharePlatformConfig["mode"] | OwnedDistributionChannel["mode"]) {
  if (mode === "direct") return tx(locale, "direct", "direct")
  if (mode === "copy") return tx(locale, "semi-auto", "semi-auto")
  return "intent"
}

function getPreviewHref(assetId: string) {
  return `/demo/item/${encodeURIComponent(assetId)}`
}

function getLeadLabel(locale: MarketLocale, segment: TargetType) {
  if (segment === "blogger") return tx(locale, "博主 / KOL", "Creator / KOL")
  if (segment === "vc") return "VC"
  return tx(locale, "ToB 企业", "B2B")
}

function getLeadIcon(segment: TargetType) {
  if (segment === "blogger") return Users
  if (segment === "vc") return BriefcaseBusiness
  return Building2
}

function getContactPriority(channel: CrawlerLeadContact["channel"]) {
  if (channel === "email") return 0
  if (channel === "institution") return 1
  if (channel === "agency") return 2
  if (channel === "linkedin") return 3
  if (channel === "dm") return 4
  if (channel === "telegram") return 5
  if (channel === "whatsapp") return 6
  if (channel === "website") return 7
  if (channel === "wechat") return 8
  return 9
}

function buildFallbackContact(lead: CrawlerLead): CrawlerLeadContact {
  return {
    id: lead.primaryContactId || `${lead.id}-${lead.contactChannel}-${lead.contactValue}`,
    name: lead.contactName,
    role: lead.contactRole,
    channel: lead.contactChannel,
    value: lead.contactValue,
    isPrimary: true,
    isPublicContact: lead.publicContactOnly,
  }
}

function getLeadContacts(lead: CrawlerLead) {
  const contacts = Array.isArray(lead.contacts) && lead.contacts.length ? lead.contacts : [buildFallbackContact(lead)]
  const deduped = new Map<string, CrawlerLeadContact>()

  contacts.forEach((contact) => {
    const key = `${contact.channel}:${contact.value.trim().toLowerCase()}`
    const current = deduped.get(key)
    if (!current) {
      deduped.set(key, contact)
      return
    }

    deduped.set(key, {
      ...current,
      label: current.label || contact.label,
      note: current.note || contact.note,
      isPrimary: current.isPrimary || contact.isPrimary,
    })
  })

  return [...deduped.values()].sort((left, right) => {
    const channelDelta = getContactPriority(left.channel) - getContactPriority(right.channel)
    if (channelDelta !== 0) return channelDelta
    return left.name.localeCompare(right.name)
  })
}

function getPrimaryContact(lead: CrawlerLead) {
  const contacts = getLeadContacts(lead)
  return contacts.find((contact) => contact.id === lead.primaryContactId) || contacts.find((contact) => contact.isPrimary) || contacts[0] || null
}

function applyLeadActiveContact(lead: CrawlerLead, targetContactId?: string | null) {
  const contacts = getLeadContacts(lead)
  const primary = (targetContactId ? contacts.find((contact) => contact.id === targetContactId) : null) || getPrimaryContact(lead) || contacts[0]
  if (!primary) return lead

  return {
    ...lead,
    contactName: primary.name,
    contactRole: primary.role,
    contactChannel: primary.channel,
    contactValue: primary.value,
    primaryContactId: primary.id,
    contacts: contacts.map((contact) => ({ ...contact, isPrimary: contact.id === primary.id })),
  }
}

function shortenLabel(value: string, max = 24) {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}

function getChannelLabel(locale: MarketLocale, channel: CrawlerLead["contactChannel"]) {
  switch (channel) {
    case "email":
      return tx(locale, "公开邮箱", "Public email")
    case "dm":
      return tx(locale, "平台私信", "Platform DM")
    case "telegram":
      return "Telegram"
    case "whatsapp":
      return "WhatsApp"
    case "institution":
      return tx(locale, "机构联系人", "Institution contact")
    case "agency":
      return tx(locale, "代理 / 经纪", "Agency contact")
    case "linkedin":
      return "LinkedIn"
    case "wechat":
      return tx(locale, "微信 / 企业微信", "WeChat")
    case "x":
      return "X"
    case "website":
      return tx(locale, "官网联系页", "Website contact")
    default:
      return channel
  }
}

function getChannelActionLabel(locale: MarketLocale, channel: CrawlerLead["contactChannel"]) {
  switch (channel) {
    case "email":
      return tx(locale, "发送合作邮件", "Send outreach email")
    case "dm":
      return tx(locale, "复制平台私信", "Copy platform DM")
    case "telegram":
      return tx(locale, "复制 Telegram 消息", "Copy Telegram message")
    case "whatsapp":
      return tx(locale, "复制 WhatsApp 消息", "Copy WhatsApp message")
    case "institution":
      return tx(locale, "复制机构联系人文案", "Copy institution contact message")
    case "agency":
      return tx(locale, "复制代理联系文案", "Copy agency outreach")
    case "linkedin":
      return tx(locale, "复制 LinkedIn 私信", "Copy LinkedIn DM")
    case "wechat":
      return tx(locale, "复制微信合作消息", "Copy WeChat outreach")
    case "x":
      return tx(locale, "复制 X 私信", "Copy X DM")
    case "website":
      return tx(locale, "复制官网表单文案", "Copy contact form message")
    default:
      return tx(locale, "复制合作文案", "Copy outreach message")
  }
}

function getPartnerBundleButtonLabel(locale: MarketLocale, lead?: CrawlerLead | null) {
  if (!lead) return tx(locale, "发送给当前合作方", "Send to current partner")
  const organization = shortenLabel(lead.organization, locale === "zh" ? 12 : 18)
  const channel = getChannelLabel(locale, lead.contactChannel)
  return tx(locale, `发送给 ${organization}（${channel}）`, `Send to ${organization} (${channel})`)
}

function localizeContactRole(locale: MarketLocale, role: string, segment?: CrawlerLead["segment"]) {
  const fallback =
    segment === "blogger"
      ? tx(locale, "内容合作负责人", "Creator partnership lead")
      : segment === "vc"
        ? tx(locale, "机构合作负责人", "Investment partnership lead")
        : tx(locale, "商务合作负责人", "Business development lead")

  if (!role.trim()) return fallback
  if (locale !== "zh") return role
  if (/[\u4e00-\u9fff]/.test(role)) return role

  const normalized = role.trim().toLowerCase()
  const mappedRoles: Array<[RegExp, string]> = [
    [/business development manager|bd manager|business development contact|partnership lead|partnership contact/, "商务合作负责人"],
    [/creator partner|brand partnership contact|creator partnership lead|content partner/, "内容合作负责人"],
    [/platform partner|platform desk|partner \/ platform contact|investment partner/, "机构合作负责人"],
    [/institution contact/, "机构联系人"],
    [/agency contact|agency desk/, "代理联系人"],
    [/regional partnerships/, "区域合作负责人"],
  ]
  const matched = mappedRoles.find(([pattern]) => pattern.test(normalized))
  return matched?.[1] || fallback
}

function localizeSuggestedAngle(locale: MarketLocale, lead?: CrawlerLead | null) {
  if (!lead) {
    return tx(locale, "建议结合合作对象定位、业务场景与资料用途进一步细化切入点。", "Add a tailored opening angle.")
  }

  if (locale !== "zh") return lead.suggestedAngle
  if (/[\u4e00-\u9fff]/.test(lead.suggestedAngle)) return lead.suggestedAngle

  if (lead.segment === "blogger") {
    return "建议从内容方向匹配度、可直接使用的创作素材、粉丝权益和合作转化方式切入。"
  }
  if (lead.segment === "vc") {
    return "建议从市场机会、产品验证进展、平台协同价值及后续沟通安排切入。"
  }
  return "建议从明确业务场景、试点落地方式、效率提升价值及后续推进安排切入。"
}

function getLeadTemplateValues(locale: MarketLocale, lead?: CrawlerLead | null) {
  if (!lead) {
    return {
      contactName: tx(locale, "合作负责人", "Partnership contact"),
      organization: tx(locale, "目标合作方", "Target partner"),
      platform: tx(locale, "对应平台", "Target platform"),
      region: tx(locale, "目标区域", "Target region"),
      contactValue: "",
      sourceLabel: "",
      contactRole: tx(locale, "合作负责人", "Partnership lead"),
      suggestedAngle: tx(locale, "建议结合合作对象定位、业务场景与资料用途进一步细化切入点。", "Add a tailored opening angle."),
      segmentLabel: tx(locale, "合作伙伴", "Partner"),
      collaborationHook: tx(locale, "围绕合作场景、实际使用方式与可落地价值展开沟通。", "Frame the outreach around their workflow, audience, and partnership upside."),
      valuePoints: tx(
        locale,
        "1. 可直接用于介绍的资料包\n2. 合作场景与核心价值说明\n3. 便于内部流转的正式文案",
        "1. demo bundle\n2. launch angles and use cases\n3. ready-to-share launch copy",
      ),
    }
  }

  if (lead.segment === "blogger") {
    return {
      contactName: lead.contactName,
      organization: lead.organization,
      platform: lead.platform,
      region: lead.region,
      contactValue: lead.contactValue,
      sourceLabel: lead.sourceLabel,
      contactRole: localizeContactRole(locale, lead.contactRole, lead.segment),
      suggestedAngle: localizeSuggestedAngle(locale, lead),
      segmentLabel: tx(locale, "博主 / 内容合作方", "Creator / content partner"),
      collaborationHook: tx(
        locale,
        "建议围绕内容方向匹配、真实体验场景、受众收益与合作价值展开沟通。",
        "Lead with content angles, product testing, audience perks, and affiliate upside.",
      ),
      valuePoints: tx(
        locale,
        "1. 可直接用于内容创作的资料包与素材说明\n2. 粉丝权益、邀请码及合作转化方式\n3. 适用于后续复用的图文、短视频和私域传播文案",
        "1. demo assets ready for reviews or walkthroughs\n2. audience discounts, invite codes, and commission setup\n3. reusable post-launch content for follow-up promotion",
      ),
    }
  }

  if (lead.segment === "vc") {
    return {
      contactName: lead.contactName,
      organization: lead.organization,
      platform: lead.platform,
      region: lead.region,
      contactValue: lead.contactValue,
      sourceLabel: lead.sourceLabel,
      contactRole: localizeContactRole(locale, lead.contactRole, lead.segment),
      suggestedAngle: localizeSuggestedAngle(locale, lead),
      segmentLabel: tx(locale, "VC / 投资合作方", "VC / investment partner"),
      collaborationHook: tx(
        locale,
        "建议围绕市场机会、产品验证进展、协同空间与后续对接价值展开沟通。",
        "Focus on market opportunity, product validation signals, portfolio fit, and follow-on value.",
      ),
      valuePoints: tx(
        locale,
        "1. 产品说明、市场落地材料与演示资料\n2. 目标客户、合作路径及业务推进逻辑\n3. 适用于后续沟通与内部同步的简版资料",
        "1. product demo and market-facing materials\n2. customer and partnership conversion paths\n3. a concise pack that can support a follow-up conversation",
      ),
    }
  }

  return {
    contactName: lead.contactName,
    organization: lead.organization,
    platform: lead.platform,
    region: lead.region,
    contactValue: lead.contactValue,
    sourceLabel: lead.sourceLabel,
    contactRole: localizeContactRole(locale, lead.contactRole, lead.segment),
    suggestedAngle: localizeSuggestedAngle(locale, lead),
    segmentLabel: tx(locale, "ToB 合作方", "B2B partner"),
    collaborationHook: tx(
      locale,
      "建议从明确业务场景、效率提升价值与可落地方案切入沟通。",
      "Lead with a concrete business use case, workflow efficiency gains, and a practical demo.",
    ),
    valuePoints: tx(
      locale,
      "1. 面向业务方的资料包与演示内容\n2. 可复述的效率提升场景与合作价值说明\n3. 便于内部流转和后续跟进的简版介绍材料",
      "1. a business-ready demo bundle\n2. efficiency and rollout talking points\n3. concise internal-forward materials",
    ),
  }
}

function buildChannelAwareDraft(locale: MarketLocale, assetTitle: string, lead?: CrawlerLead | null) {
  if (!lead) {
    return {
      subject: tx(locale, `合作邀约 | {{organization}} x ${assetTitle}`, `Partnership invitation | {{organization}} x ${assetTitle}`),
      body: tx(
        locale,
        `你好 {{contactName}}，\n\n我们希望就《${assetTitle}》与 {{organization}} 建立合作沟通。基于当前合作场景，我们已整理好可直接用于介绍、转发和后续跟进的资料内容。\n\n建议沟通方向：{{collaborationHook}}\n\n当前可先提供以下材料：\n{{valuePoints}}\n\n如方便，我们可以先发送完整资料包，再根据需要安排进一步沟通。`,
        `Hi {{contactName}},\n\nWe would love to explore a partnership around ${assetTitle} with {{organization}}. We already have the demo bundle, positioning notes, and a ready-to-share asset pack.\n\nSuggested angle: {{collaborationHook}}\n\nWe can start with:\n{{valuePoints}}\n\nIf helpful, I can send the full materials first and then line up a short follow-up.`,
      ),
    }
  }

  if (lead.contactChannel === "email") {
    return {
      subject: tx(locale, `合作邀约 | {{organization}} x ${assetTitle}`, `Partnership invitation | {{organization}} x ${assetTitle}`),
      body: tx(
        locale,
        `你好 {{contactName}}，\n\n我们关注到 {{organization}} 在 {{platform}} 的相关布局，与《${assetTitle}》所对应的合作场景较为契合。结合贵方当前的 {{segmentLabel}} 角色与 {{contactRole}} 视角，我们已整理出一版可直接用于合作沟通的正式资料。\n\n建议沟通方向：{{collaborationHook}}\n\n目前可优先提供以下内容：\n{{valuePoints}}\n\n如贵方方便，我们可以先发送完整资料包，再根据反馈安排进一步沟通。\n\n建议切入点：{{suggestedAngle}}`,
        `Hi {{contactName}},\n\nWe noticed that {{organization}} on {{platform}} is a strong fit for ${assetTitle}. Since you are coming from a {{segmentLabel}} / {{contactRole}} perspective, this outreach is tailored to your partner type.\n\nSuggested collaboration hook: {{collaborationHook}}\n\nWe already prepared:\n{{valuePoints}}\n\nIf useful, I can send the full materials first and then line up a short follow-up.\n\nSuggested angle: {{suggestedAngle}}`,
      ),
    }
  }

  if (lead.contactChannel === "website") {
    return {
      subject: tx(locale, `官网合作咨询 | {{organization}} x ${assetTitle}`, `Website partnership inquiry | {{organization}} x ${assetTitle}`),
      body: tx(
        locale,
        `你好，我们希望就《${assetTitle}》与 {{organization}} 沟通合作事宜。针对贵方可能关注的业务方向，我们已准备好一版正式资料，可用于初步了解合作内容与后续沟通。\n\n建议沟通方向：{{collaborationHook}}\n\n当前可优先发送以下内容：\n{{valuePoints}}\n\n如方便，期待先将完整资料包发送给贵方，再进一步确认合作方式与推进安排。\n\n建议切入点：{{suggestedAngle}}`,
        `Hello, we would like to discuss a partnership with {{organization}} around ${assetTitle}. We tailor the proposal to the specific partner profile and role.\n\nSuggested collaboration hook: {{collaborationHook}}\n\nWe can start by sending:\n{{valuePoints}}\n\nIf helpful, we can share the full pack first and then confirm the collaboration format.\n\nSuggested angle: {{suggestedAngle}}`,
      ),
    }
  }

  return {
    subject: tx(locale, `合作私信 | {{organization}} x ${assetTitle}`, `Partnership DM | {{organization}} x ${assetTitle}`),
    body: tx(
      locale,
      `你好 {{contactName}}，我们关注到 {{organization}} 在 {{platform}} 的相关方向，与《${assetTitle}》的合作场景较为匹配。我们已整理好一版可直接发送的正式资料，便于快速了解合作内容。\n\n建议沟通方向：{{collaborationHook}}\n\n当前可先发送以下内容：\n{{valuePoints}}\n\n如果你方便，我先把完整资料包发给你。\n\n建议切入点：{{suggestedAngle}}`,
      `Hi {{contactName}}, your direction at {{organization}} on {{platform}} looks like a strong fit for us. We tailor the outreach to your specific partner type.\n\nSuggested hook: {{collaborationHook}}\n\nWe can start with:\n{{valuePoints}}\n\nIf helpful, I can send the materials first.\n\nAngle: {{suggestedAngle}}`,
    ),
  }
}

function buildOutreachDraft(locale: MarketLocale, assetTitle: string, lead?: CrawlerLead | null) {
  return buildChannelAwareDraft(locale, assetTitle, lead)
}

function getAssetKindLabel(locale: MarketLocale, kind?: string | null) {
  if (kind === "pdf") return tx(locale, "PDF 资料", "PDF pack")
  if (kind === "ppt") return tx(locale, "演示文稿", "presentation deck")
  if (kind === "video") return tx(locale, "视频素材", "video asset")
  if (kind === "html") return tx(locale, "落地页素材", "landing-page asset")
  return tx(locale, "宣传资料", "launch asset")
}

function normalizeBootstrapData(data: Partial<AcquisitionDistributionBootstrap> | null | undefined): AcquisitionDistributionBootstrap {
  const fallback = createAcquisitionDistributionFallbackBootstrap()
  const ownedChannels = Array.isArray(data?.ownedChannels) && data.ownedChannels.length ? data.ownedChannels : fallback.ownedChannels
  const sharePlatforms = Array.isArray(data?.sharePlatforms) && data.sharePlatforms.length ? data.sharePlatforms : fallback.sharePlatforms

  return {
    ...fallback,
    ...data,
    assets: Array.isArray(data?.assets) ? data.assets : fallback.assets,
    ownedChannels,
    sharePlatforms,
    guardrails: {
      ...fallback.guardrails,
      ...(data?.guardrails || {}),
      ownedChannelCount: ownedChannels.length,
    },
    leadSource: data?.leadSource || fallback.leadSource,
  }
}

function buildArticleDraft(params: {
  locale: MarketLocale
  assetTitle: string
  assetDescription?: string | null
  assetKind?: string | null
  lead?: CrawlerLead | null
  trackingUrl?: string | null
  inviteCode?: string | null
  couponCode?: string | null
}) {
  const { locale, assetTitle, assetDescription, assetKind, lead, trackingUrl, inviteCode, couponCode } = params
  const partner = lead?.organization || tx(locale, "合作伙伴", "our partners")
  const platform = lead?.platform || tx(locale, "多平台", "multi-channel")
  const segmentLabel =
    lead?.segment === "blogger"
      ? tx(locale, "内容合作", "creator collaboration")
      : lead?.segment === "vc"
        ? tx(locale, "机构合作", "investor-facing collaboration")
        : tx(locale, "企业合作", "business collaboration")
  const assetLabel = getAssetKindLabel(locale, assetKind)
  const description = assetDescription?.trim() || tx(locale, "适合产品推广、合作上线、客户跟进与复用传播。", "Suitable for launch campaigns, partner posts, customer follow-up, and repeat distribution.")
  const points = lead?.segment === "blogger"
    ? tx(
        locale,
        `1. 围绕真实使用场景、内容方向和受众收益组织表达。\n2. 兼顾合作介绍、权益说明与后续转化承接。\n3. 便于延展为图文、短视频及私域传播版本。`,
        `1. Sharper content angle: built around use cases, hands-on reviews, and audience value.\n2. Easier conversion: supports invite codes, promo codes, and tracking links.\n3. Easier redistribution: can be repurposed into posts, short-form scripts, and DM copy.`,
      )
    : lead?.segment === "vc"
      ? tx(
          locale,
          `1. 重点说明产品价值、市场机会与合作方向。\n2. 便于向合伙人、平台团队及相关负责人内部转发。\n3. 可作为后续会前材料与内部同步摘要使用。`,
          `1. Quickly communicates product value, market opportunity, and collaboration direction.\n2. Easy to forward to partners, platform teams, or portfolio support functions.\n3. Works well as pre-meeting material and an internal briefing summary.`,
        )
      : tx(
          locale,
          `1. 先明确业务场景，再落到产品能力与效率提升价值。\n2. 适合向业务负责人、采购或管理层内部转发。\n3. 可用于对外介绍、销售跟进及后续复盘沉淀。`,
          `1. Starts with the business scenario, then lands on product value and efficiency gains.\n2. Easy to forward to procurement, department heads, or business owners.\n3. Works across website, CRM follow-up, sales outreach, and recap use cases.`,
        )
  const trackingBlock = [
    trackingUrl ? `${tx(locale, "追踪链接", "Tracking link")}: ${trackingUrl}` : "",
    inviteCode ? `${tx(locale, "邀请码", "Invite code")}: ${inviteCode}` : "",
    couponCode ? `${tx(locale, "优惠码", "Promo code")}: ${couponCode}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  return {
    title: tx(locale, `合作说明｜${partner} × ${assetTitle}`, `Collaboration brief | ${partner} x ${assetTitle}`),
    body: tx(
      locale,
      `本次围绕 ${partner} 的 ${segmentLabel} 场景，我们已完成《${assetTitle}》及相关 ${assetLabel} 的整理与交付。\n\n该材料主要用于合作介绍、内部流转及后续业务跟进，当前版本可支持 ${platform} 等渠道的对外沟通与二次分发。\n\n材料简介：\n${description}\n\n当前内容重点包括：\n${points}\n\n本次整理的目标，是在统一对外表达的基础上，进一步提升资料传递效率与合作沟通质量，便于相关团队更快完成介绍、转发、评估与后续转化承接。${trackingBlock ? `\n\n合作跟踪信息：\n${trackingBlock}` : ""}\n\n该材料可作为后续合作说明、联合传播、客户触达及复盘沉淀的基础版本。如需适配不同渠道，我们也可以继续补充邮件版、社群版、短版介绍及短视频口播版本。`,
      `This release packages a ${assetLabel} built for ${partner}'s ${segmentLabel} workflow, with ${assetTitle} as the featured piece.\n\nOne-line summary:\n${description}\n\nThe goal is not to send a bare file. It is to ship something publishable, forwardable, and conversion-ready so the team can use it across ${platform} and follow-on partner outreach immediately.\n\nThis version is designed to emphasize:\n${points}\n\nSuggested publish copy:\nIf you need a launch package that explains the product clearly and still works as a collaboration asset, ${assetTitle} is ready to use. It is more than a plain spec or one short teaser. It gives you a stronger story, clearer partner positioning, and a cleaner path into follow-up conversion for launch posts, co-marketing, sales outreach, and recap workflows.${trackingBlock ? `\n\nConversion details:\n${trackingBlock}` : ""}\n\nIf helpful, I can also split this into short-form copy, social/community versions, email copy, and short-video talking points.`,
    ),
  }
}

function buildPartnerBundleDraft(params: {
  locale: MarketLocale
  lead?: CrawlerLead | null
  articleTitle: string
  articleBody: string
  assetTitle: string
  assetUrl: string
  bundleUrl: string
  trackingUrl?: string | null
  inviteCode?: string | null
  couponCode?: string | null
}) {
  const { locale, lead, articleTitle, articleBody, assetTitle, assetUrl, bundleUrl, trackingUrl, inviteCode, couponCode } = params
  const contactName = lead?.contactName || tx(locale, "合作负责人", "Partnership contact")
  const organization = lead?.organization || tx(locale, "合作方", "Partner")
  const subject = tx(locale, `合作资料包 | ${organization} x ${assetTitle}`, `Partner asset bundle | ${organization} x ${assetTitle}`)

  const trackingSection = [
    trackingUrl ? `${tx(locale, "合作追踪链接", "Tracking link")}: ${trackingUrl}` : "",
    inviteCode ? `${tx(locale, "邀请码", "Invite code")}: ${inviteCode}` : "",
    couponCode ? `${tx(locale, "优惠码", "Coupon")}: ${couponCode}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  const body = tx(
    locale,
    `你好 ${contactName}，\n\n关于本次合作所需资料，我们已完成整理，现将完整资料包一并发送供贵方查阅。\n\n主推材料：${assetTitle}\n资料包 ZIP：${bundleUrl}\n材料预览：${assetUrl}\n\n随附可直接使用的正式介绍文案如下：\n${articleTitle}\n\n${articleBody}${trackingSection ? `\n\n合作跟踪信息：\n${trackingSection}` : ""}\n\n如需进一步补充封面图、短视频脚本或不同渠道版本，我们也可以继续完善。`,
    `Hi ${contactName},\n\nWe have packaged the collaboration materials and are sending over the full partner bundle for immediate use.\n\nFeatured asset: ${assetTitle}\nBundle ZIP: ${bundleUrl}\nAsset preview: ${assetUrl}\n\nReady-to-use launch copy:\n${articleTitle}\n\n${articleBody}${trackingSection ? `\n\nTracking details:\n${trackingSection}` : ""}\n\nIf helpful, I can also prepare cover art, short-form video scripts, or channel-specific variants.`,
  )

  return { subject, body }
}

function buildDemoMultiContactLeads(params: {
  locale: MarketLocale
  targetType: TargetType
  platform: string
  region: string
  keyword: string
}) {
  const locale = params.locale
  const platform = params.platform || (params.targetType === "blogger" ? "douyin" : params.targetType === "vc" ? "website" : "linkedin")
  const region = params.region || "CN"
  const keyword = params.keyword || (params.locale === "zh" ? "合作推广" : "partnership")

  const baseLead: CrawlerLead =
    params.targetType === "vc"
      ? {
          id: "demo-vc-multi-contact",
          segment: "vc",
          title: "AI Infra Fund partnership lead",
          platform,
          region,
          url: "https://example.com/vc-demo",
          audience: "Investor network",
          fit: 91,
          note: "Demo lead with multiple contact channels for VC collaboration.",
          organization: "Blue Horizon Capital",
          contactName: "Iris Zhang",
          contactRole: "Platform Partner",
          contactChannel: "email",
          contactValue: "platform@bluehorizon.vc",
          primaryContactId: "vc-email",
          contacts: [
            { id: "vc-email", name: "Iris Zhang", role: "Platform Partner", channel: "email", value: "platform@bluehorizon.vc", isPrimary: true, isPublicContact: true },
            { id: "vc-telegram", name: "Iris Zhang", role: "Platform Partner", channel: "telegram", value: "@bluehorizonplatform", isPrimary: false, isPublicContact: true },
            { id: "vc-institution", name: "Platform Desk", role: "Institution Contact", channel: "institution", value: "https://bluehorizon.vc/contact", isPrimary: false, isPublicContact: true },
          ],
          sourceLabel: "Demo multi-contact VC source",
          publicContactOnly: true,
          suggestedAngle: tx(locale, `建议从 ${keyword} 的平台协同价值、创始人资源连接与后续材料支持切入。`, `Lead with ${keyword} portfolio value, founder distribution, and follow-up materials.`),
        }
      : params.targetType === "b2b"
        ? {
            id: "demo-b2b-multi-contact",
            segment: "b2b",
            title: "Enterprise AI workflow buyer",
            platform,
            region,
            url: "https://example.com/enterprise-demo",
            audience: "120-person operations team",
            fit: 89,
            note: "Demo lead with multiple contact channels for enterprise outreach.",
            organization: "GloriaFood Enterprise",
            contactName: "Nina Chen",
            contactRole: "BD Manager",
            contactChannel: "email",
            contactValue: "bd@gloriafood.example",
            primaryContactId: "b2b-email",
            contacts: [
              { id: "b2b-email", name: "Nina Chen", role: "BD Manager", channel: "email", value: "bd@gloriafood.example", isPrimary: true, isPublicContact: true },
              { id: "b2b-wechat", name: "Nina Chen", role: "BD Manager", channel: "wechat", value: "gloriafood_bd", isPrimary: false, isPublicContact: true },
              { id: "b2b-whatsapp", name: "Ops Team", role: "Regional Partnerships", channel: "whatsapp", value: "+6588886666", isPrimary: false, isPublicContact: true },
              { id: "b2b-website", name: "Enterprise Desk", role: "Institution Contact", channel: "website", value: "https://gloriafood.example/contact", isPrimary: false, isPublicContact: true },
            ],
            sourceLabel: "Demo multi-contact B2B source",
            publicContactOnly: true,
            suggestedAngle: tx(locale, `建议从 ${keyword} 的业务场景、试点方案与可直接发送的资料内容切入。`, `Lead with ${keyword}, pilot plan, and ready-to-send materials.`),
          }
        : {
            id: "demo-blogger-multi-contact",
            segment: "blogger",
            title: "Douyin creator partnership sample",
            platform,
            region,
            url: "https://example.com/creator-demo",
            audience: "80k followers",
            fit: 93,
            note: "Demo lead with multiple contact channels for creator outreach.",
            organization: "The WeChat Agency",
            contactName: "Jian",
            contactRole: "Creator Partner",
            contactChannel: "email",
            contactValue: "jian@wechatagency.example",
            primaryContactId: "blogger-email",
            contacts: [
              { id: "blogger-email", name: "Jian", role: "Creator Partner", channel: "email", value: "jian@wechatagency.example", isPrimary: true, isPublicContact: true },
              { id: "blogger-dm", name: "Jian", role: "Creator Partner", channel: "dm", value: "https://douyin.com/user/demo-jian", label: "Douyin DM", isPrimary: false, isPublicContact: true },
              { id: "blogger-wechat", name: "Jian", role: "Creator Partner", channel: "wechat", value: "jian_creator_wechat", isPrimary: false, isPublicContact: true },
              { id: "blogger-telegram", name: "Jian", role: "Creator Partner", channel: "telegram", value: "@jian_creator", isPrimary: false, isPublicContact: true },
              { id: "blogger-agency", name: "Agency Desk", role: "Agency Contact", channel: "agency", value: "agency@wechatagency.example", isPrimary: false, isPublicContact: true },
            ],
            sourceLabel: "Demo multi-contact creator source",
            publicContactOnly: true,
            suggestedAngle: tx(locale, `建议从 ${keyword} 的内容合作方向、创作资料包、粉丝权益与分成机制切入。`, `Lead with ${keyword}, creator bundle, fan discount, and revenue-share assets.`),
          }

  return [baseLead]
}

function fillLeadTemplate(template: string, lead: CrawlerLead | null | undefined, locale: MarketLocale) {
  const values = getLeadTemplateValues(locale, lead)
  return template
    .replaceAll("{{contactName}}", values.contactName)
    .replaceAll("{{organization}}", values.organization)
    .replaceAll("{{platform}}", values.platform)
    .replaceAll("{{region}}", values.region)
    .replaceAll("{{contactValue}}", values.contactValue)
    .replaceAll("{{sourceLabel}}", values.sourceLabel)
    .replaceAll("{{contactRole}}", values.contactRole)
    .replaceAll("{{suggestedAngle}}", values.suggestedAngle)
    .replaceAll("{{segmentLabel}}", values.segmentLabel)
    .replaceAll("{{collaborationHook}}", values.collaborationHook)
    .replaceAll("{{valuePoints}}", values.valuePoints)
}

function revertLeadPreviewToTemplate(value: string, lead: CrawlerLead | null | undefined, locale: MarketLocale) {
  const values = getLeadTemplateValues(locale, lead)
  const replacements = [
    ["{{valuePoints}}", values.valuePoints],
    ["{{collaborationHook}}", values.collaborationHook],
    ["{{suggestedAngle}}", values.suggestedAngle],
    ["{{segmentLabel}}", values.segmentLabel],
    ["{{contactRole}}", values.contactRole],
    ["{{organization}}", values.organization],
    ["{{contactName}}", values.contactName],
    ["{{platform}}", values.platform],
    ["{{region}}", values.region],
    ["{{contactValue}}", values.contactValue],
    ["{{sourceLabel}}", values.sourceLabel],
  ] as const

  return replacements.reduce((result, [placeholder, actual]) => {
    if (!actual) return result
    return result.split(actual).join(placeholder)
  }, value)
}

function analyzeReply(locale: MarketLocale, replyText: string, lead?: CrawlerLead | null): ReplyInsight {
  const normalized = replyText.toLowerCase()
  if (!normalized.trim()) {
    return {
      disposition: "manual_review",
      summary: tx(locale, "等待回复内容", "Waiting for reply content"),
      nextStep: tx(locale, "粘贴邮件、私信或表单回复后，再生成下一步动作。", "Paste an email, DM, or form reply to generate the next action."),
    }
  }

  if (/(interested|可以|感兴趣|let's talk|schedule|meeting|demo|call|合作)/i.test(normalized)) {
    return {
      disposition: "positive",
      summary: tx(locale, "对方有明确合作意向", "The contact shows clear partnership interest"),
      nextStep: tx(locale, "自动进入“发送资料包 + 安排时间”阶段，优先推送 demo 素材包和会议时间。", "Move into 'send materials + schedule follow-up' and prioritize the demo bundle plus a meeting slot."),
    }
  }

  if (/(send more|更多资料|报价|价格|case study|deck|资料包|details|proposal)/i.test(normalized)) {
    return {
      disposition: "needs_info",
      summary: tx(locale, "对方需要更多资料", "The contact is asking for more materials"),
      nextStep: tx(locale, "自动准备资料包、合作亮点和报价说明，再发送二次跟进。", "Prepare the materials pack, partnership highlights, and pricing notes before sending the follow-up."),
    }
  }

  if (/(budget|佣金|commission|discount|折扣|分成|条款|contract|term)/i.test(normalized)) {
    return {
      disposition: "negotiating",
      summary: tx(locale, "已进入条款或价格沟通", "The contact is negotiating terms or pricing"),
      nextStep: tx(locale, "进入条款谈判流程，带上优惠、分成和合作周期，再由人工确认发送。", "Move into term negotiation with discount, commission, and timeline details, then send after human confirmation."),
    }
  }

  if (/(not interested|不考虑|拒绝|remove|unsubscribe|no thanks)/i.test(normalized)) {
    return {
      disposition: "negative",
      summary: tx(locale, "对方明确拒绝或不希望继续联系", "The contact explicitly declined or does not want follow-up"),
      nextStep: tx(locale, "停止自动跟进，将该线索标记为拒绝。", "Stop automatic follow-up and mark the lead as declined."),
    }
  }

  return {
    disposition: "manual_review",
    summary: tx(locale, "回复内容需要人工判断", "The reply needs manual interpretation"),
    nextStep: tx(locale, "先由运营确认语气和意图，再决定是发资料、谈条款还是暂停跟进。", "Have ops review the intent before deciding whether to send materials, negotiate, or pause."),
  }
}

function getContactOpenUrl(lead: CrawlerLead) {
  const value = lead.contactValue.trim()
  if (!value) return lead.url
  if (/^https?:\/\//i.test(value)) return value
  if (lead.contactChannel === "telegram") return value.startsWith("@") ? `https://t.me/${value.slice(1)}` : value
  if (lead.contactChannel === "whatsapp") {
    const normalized = value.replace(/[^\d+]/g, "")
    return normalized ? `https://wa.me/${normalized.replace(/^\+/, "")}` : lead.url
  }
  if (lead.contactChannel === "linkedin" || lead.contactChannel === "x" || lead.contactChannel === "website" || lead.contactChannel === "dm") return lead.url
  return lead.url
}

export function AcquisitionDistributionClient({
  locale,
  embedded = false,
  showIntro = true,
}: {
  locale: MarketLocale
  embedded?: boolean
  showIntro?: boolean
}) {
  const [loading, setLoading] = useState(true)
  const [runningCrawlerMode, setRunningCrawlerMode] = useState<"quick" | "deep" | null>(null)
  const [sendingAll, setSendingAll] = useState(false)
  const [sendingBatchEmails, setSendingBatchEmails] = useState(false)
  const [sendingPartnerBundle, setSendingPartnerBundle] = useState(false)
  const [publishingTargetId, setPublishingTargetId] = useState("")
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [bootstrap, setBootstrap] = useState<AcquisitionDistributionBootstrap>(() => createAcquisitionDistributionFallbackBootstrap())
  const [crawlerLeads, setCrawlerLeads] = useState<CrawlerLead[]>([])
  const [demoSnapshot, setDemoSnapshot] = useState<{
    crawlerLeads: CrawlerLead[]
    selectedLeadIds: string[]
    activeDraftLeadId: string
    lastCrawlerPersist: AcquisitionCrawlerPersistSummary | null
  } | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [selectedOwnedIds, setSelectedOwnedIds] = useState<string[]>([])
  const [batchEmailResult, setBatchEmailResult] = useState<OutreachBatchResult | null>(null)
  const [targetType, setTargetType] = useState<TargetType>("b2b")
  const [keyword, setKeyword] = useState(locale === "zh" ? "AI 协作" : "AI collaboration")
  const [platform, setPlatform] = useState(locale === "zh" ? "xiaohongshu" : "linkedin")
  const [region, setRegion] = useState(locale === "zh" ? "CN" : "INTL")
  const [limit, setLimit] = useState("12")
  const [selectedAssetId, setSelectedAssetId] = useState("")
  const [activeDraftLeadId, setActiveDraftLeadId] = useState("")
  const [shareTitle, setShareTitle] = useState("")
  const [shareText, setShareText] = useState("")
  const [outreachSubjectTemplate, setOutreachSubjectTemplate] = useState("")
  const [outreachBodyTemplate, setOutreachBodyTemplate] = useState("")
  const [outreachTemplateDirty, setOutreachTemplateDirty] = useState(false)
  const [articleTitle, setArticleTitle] = useState("")
  const [articleBody, setArticleBody] = useState("")
  const [replyText, setReplyText] = useState("")
  const [savingReply, setSavingReply] = useState(false)
  const [promotingPartnership, setPromotingPartnership] = useState(false)
  const [lastCrawlerPersist, setLastCrawlerPersist] = useState<AcquisitionCrawlerPersistSummary | null>(null)
  const [lastReplyPersist, setLastReplyPersist] = useState<AcquisitionReplyPersistSummary | null>(null)
  const [lastPartnershipActivation, setLastPartnershipActivation] = useState<AcquisitionPartnershipActivationSummary | null>(null)
  const runningCrawler = runningCrawlerMode !== null

  function applyBootstrapData(data: AcquisitionDistributionBootstrap) {
    const next = normalizeBootstrapData(data)
    setBootstrap(next)
    if (next.assets[0]) setSelectedAssetId((current) => current || next.assets[0].id)
  }

  async function loadBootstrap() {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/market-admin/admin/acquisition/distribution", {
        cache: "no-store",
        credentials: "same-origin",
        headers: getAuthHeaders(),
      })
      const json = await response.json()
      if (!json.success) throw new Error(json.error || tx(locale, "加载失败", "Load failed"))
      applyBootstrapData(normalizeBootstrapData(json.data as AcquisitionDistributionBootstrap))
    } catch (err) {
      setError(err instanceof Error ? err.message : tx(locale, "加载失败", "Load failed"))
      setBootstrap((current) => normalizeBootstrapData(current))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBootstrap()
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    const douyinStatus = url.searchParams.get("douyin")
    if (!douyinStatus) return

    if (douyinStatus === "connected") {
      setToast(tx(locale, "抖音账号已授权，可用于直发。", "Douyin account connected for direct publishing."))
      void loadBootstrap()
    } else {
      const message = url.searchParams.get("message") || tx(locale, "抖音授权未完成。", "Douyin authorization did not complete.")
      setError(message)
    }

    url.searchParams.delete("douyin")
    url.searchParams.delete("message")
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
  }, [locale])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(""), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const assets = useMemo(() => bootstrap?.assets || [], [bootstrap?.assets])
  const selectedAsset = useMemo(() => assets.find((item) => item.id === selectedAssetId) || assets[0] || null, [assets, selectedAssetId])
  const selectedLeads = useMemo(() => crawlerLeads.filter((lead) => selectedLeadIds.includes(lead.id)), [crawlerLeads, selectedLeadIds])
  const selectedEmailLeads = useMemo(() => selectedLeads.filter((lead) => getLeadContacts(lead).some((contact) => contact.channel === "email")), [selectedLeads])
  const selectedManualLeads = useMemo(() => selectedLeads.filter((lead) => !getLeadContacts(lead).some((contact) => contact.channel === "email")), [selectedLeads])
  const selectedOwnedChannels = useMemo(() => bootstrap?.ownedChannels.filter((item) => selectedOwnedIds.includes(item.id)) || [], [bootstrap?.ownedChannels, selectedOwnedIds])
  const activeDraftLead = useMemo(
    () => selectedLeads.find((lead) => lead.id === activeDraftLeadId) || selectedEmailLeads[0] || selectedLeads[0] || null,
    [activeDraftLeadId, selectedEmailLeads, selectedLeads],
  )
  const outreachDraft = useMemo(() => buildOutreachDraft(locale, selectedAsset?.title || "Demo bundle", activeDraftLead), [activeDraftLead, locale, selectedAsset?.title])
  const leadSource = bootstrap?.leadSource || null
  const ops = bootstrap?.ops || null
  const primaryLead = activeDraftLead
  const replyInsight = useMemo(() => analyzeReply(locale, replyText, primaryLead), [locale, replyText, primaryLead])
  const outreachSubjectPreview = useMemo(() => fillLeadTemplate(outreachSubjectTemplate, activeDraftLead, locale), [activeDraftLead, locale, outreachSubjectTemplate])
  const outreachBodyPreview = useMemo(() => fillLeadTemplate(outreachBodyTemplate, activeDraftLead, locale), [activeDraftLead, locale, outreachBodyTemplate])

  useEffect(() => {
    if (!selectedAsset) return
    setShareTitle((current) => current || selectedAsset.title)
    setShareText((current) => current || selectedAsset.description)
  }, [selectedAsset])

  useEffect(() => {
    if (selectedLeads.some((lead) => lead.id === activeDraftLeadId)) return
    setActiveDraftLeadId(selectedEmailLeads[0]?.id || selectedLeads[0]?.id || "")
  }, [activeDraftLeadId, selectedEmailLeads, selectedLeads])

  useEffect(() => {
    if (outreachTemplateDirty) return
    setOutreachSubjectTemplate(outreachDraft.subject)
    setOutreachBodyTemplate(outreachDraft.body)
  }, [outreachDraft.body, outreachDraft.subject, outreachTemplateDirty])

  const sharePayload = useMemo(() => {
    if (typeof window === "undefined") return { title: shareTitle, text: shareText, url: "" }
    return {
      title: shareTitle.trim() || selectedAsset?.title || "Demo bundle",
      text: shareText.trim() || selectedAsset?.description || "",
      url: selectedAsset?.url ? `${window.location.origin}${selectedAsset.url}` : window.location.origin,
    }
  }, [selectedAsset, shareText, shareTitle])

  const bundlePayload = useMemo(() => {
    const origin = resolveBundleOrigin()
    const publicReady = isPublicDeliveryOrigin(origin)

    return {
      origin,
      publicReady,
      bundleUrl: origin ? `${origin}/api/demo/download` : "/api/demo/download",
      assetUrl: selectedAsset?.url ? `${origin || ""}${selectedAsset.url}` : origin || "",
    }
  }, [selectedAsset])
  const partnerTrackingAsset = useMemo(() => {
    if (!primaryLead || !lastPartnershipActivation) return null
    if (lastPartnershipActivation.organization.name !== primaryLead.organization) return null
    return {
      trackingUrl: lastPartnershipActivation.trackingAssets.find((asset) => asset.assetType === "link")?.url || null,
      inviteCode: lastPartnershipActivation.marketingInvitationCode?.code || null,
      couponCode: lastPartnershipActivation.marketingCoupon?.code || null,
    }
  }, [lastPartnershipActivation, primaryLead])
  const articleDraft = useMemo(
    () =>
      buildArticleDraft({
        locale,
        assetTitle: selectedAsset?.title || "Demo bundle",
        assetDescription: selectedAsset?.description || "",
        assetKind: selectedAsset?.kind || null,
        lead: primaryLead,
        trackingUrl: partnerTrackingAsset?.trackingUrl || null,
        inviteCode: partnerTrackingAsset?.inviteCode || null,
        couponCode: partnerTrackingAsset?.couponCode || null,
      }),
    [locale, partnerTrackingAsset?.couponCode, partnerTrackingAsset?.inviteCode, partnerTrackingAsset?.trackingUrl, primaryLead, selectedAsset?.description, selectedAsset?.kind, selectedAsset?.title],
  )

  useEffect(() => {
    setArticleTitle(articleDraft.title)
    setArticleBody(articleDraft.body)
  }, [articleDraft.body, articleDraft.title])

  useEffect(() => {
    setReplyText("")
  }, [primaryLead?.id])
  const articlePayload = useMemo(() => {
    if (typeof window === "undefined") return { title: articleTitle, text: articleBody, url: "" }
    return {
      title: articleTitle.trim() || articleDraft.title,
      text: articleBody.trim() || articleDraft.body,
      url: selectedAsset?.url ? `${window.location.origin}${selectedAsset.url}` : window.location.origin,
    }
  }, [articleBody, articleDraft.body, articleDraft.title, articleTitle, selectedAsset])
  const partnerBundleDraft = useMemo(
    () =>
      buildPartnerBundleDraft({
        locale,
        lead: primaryLead,
        articleTitle: articleTitle.trim() || articleDraft.title,
        articleBody: articleBody.trim() || articleDraft.body,
        assetTitle: selectedAsset?.title || "Demo bundle",
        assetUrl: bundlePayload.assetUrl,
        bundleUrl: bundlePayload.bundleUrl,
        trackingUrl: partnerTrackingAsset?.trackingUrl || null,
        inviteCode: partnerTrackingAsset?.inviteCode || null,
        couponCode: partnerTrackingAsset?.couponCode || null,
      }),
    [articleBody, articleDraft.body, articleDraft.title, articleTitle, bundlePayload.assetUrl, bundlePayload.bundleUrl, locale, partnerTrackingAsset, primaryLead, selectedAsset?.title],
  )
  const currentDeliveryMode = useMemo(() => {
    if (!primaryLead) return tx(locale, "未选择发送对象", "No delivery target selected")
    return primaryLead.contactChannel === "email"
      ? tx(locale, "邮件直发", "Direct email send")
      : tx(locale, "复制文案并打开联系入口", "Copy message and open contact entry")
  }, [locale, primaryLead])
  async function runCrawler(mode: "quick" | "deep" = "quick") {
    setRunningCrawlerMode(mode)
    setError("")
    try {
      const requestedLimit = Number(limit || 12)
      const maxLimit = mode === "deep" ? 36 : 12
      const safeRunLimit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), maxLimit) : maxLimit
      const response = await fetch("/api/market-admin/admin/acquisition/distribution", {
        method: "POST",
        credentials: "same-origin",
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: "run_crawler", targetType, keyword, platform, region, limit: safeRunLimit, mode, locale }),
      })
      const json = await response.json()
      if (!json.success) throw new Error(json.error || tx(locale, "采集失败", "Discovery failed"))
      const leads = ((json.result || []) as CrawlerLead[]).map((lead) => applyLeadActiveContact(lead, lead.primaryContactId))
      const persisted = (json.persisted || null) as AcquisitionCrawlerPersistSummary | null
      const data = (json.data || null) as AcquisitionDistributionBootstrap | null
      setDemoSnapshot(null)
      setDemoMode(false)
      setCrawlerLeads(leads)
      setSelectedLeadIds(leads.slice(0, Math.min(8, leads.length)).map((lead) => lead.id))
      setActiveDraftLeadId(leads[0]?.id || "")
      setOutreachTemplateDirty(false)
      setBatchEmailResult(null)
      setLastCrawlerPersist(persisted)
      if (safeRunLimit !== requestedLimit) {
        setLimit(String(safeRunLimit))
      }
      if (data) applyBootstrapData(data)
      setToast(
        persisted
          ? tx(locale, `${mode === "deep" ? "深度" : "快速"}采集已完成，并落库 ${persisted.persistedLeadIds.length} 条`, `${mode === "deep" ? "Deep" : "Quick"} discovery finished and persisted (${persisted.persistedLeadIds.length})`)
          : tx(locale, `${mode === "deep" ? "深度" : "快速"}采集已完成`, `${mode === "deep" ? "Deep" : "Quick"} discovery finished`),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : tx(locale, "采集失败", "Discovery failed"))
    } finally {
      setRunningCrawlerMode(null)
    }
  }

  function loadMultiContactDemo() {
    if (!demoMode) {
      setDemoSnapshot({
        crawlerLeads,
        selectedLeadIds,
        activeDraftLeadId,
        lastCrawlerPersist,
      })
    }
    const leads = buildDemoMultiContactLeads({
      locale,
      targetType,
      platform,
      region,
      keyword,
    }).map((lead) => applyLeadActiveContact(lead, lead.primaryContactId))

    setCrawlerLeads(leads)
    setSelectedLeadIds(leads.map((lead) => lead.id))
    setActiveDraftLeadId(leads[0]?.id || "")
    setDemoMode(true)
    setOutreachTemplateDirty(false)
    setBatchEmailResult(null)
    setToast(tx(locale, "已载入多联系方式演示线索", "Loaded a multi-contact demo lead"))
  }

  function restoreLeadResults() {
    if (demoSnapshot) {
      setCrawlerLeads(demoSnapshot.crawlerLeads)
      setSelectedLeadIds(demoSnapshot.selectedLeadIds)
      setActiveDraftLeadId(demoSnapshot.activeDraftLeadId)
      setLastCrawlerPersist(demoSnapshot.lastCrawlerPersist)
    }
    setDemoSnapshot(null)
    setDemoMode(false)
    setToast(tx(locale, "已恢复到演示前的采集结果", "Restored the results from before demo mode"))
  }

  async function saveReplyCapture() {
    if (!primaryLead || !replyText.trim()) return
    setSavingReply(true)
    setError("")
    try {
      const response = await fetch("/api/market-admin/admin/acquisition/distribution", {
        method: "POST",
        credentials: "same-origin",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: "save_reply_event",
          lead: primaryLead,
          replyText,
          disposition: replyInsight.disposition,
          summary: replyInsight.summary,
          nextStep: replyInsight.nextStep,
          locale,
        }),
      })
      const json = await response.json()
      if (!json.success) throw new Error(json.error || tx(locale, "回复保存失败", "Failed to save reply"))
      const result = (json.result || null) as AcquisitionReplyPersistSummary | null
      const data = (json.data || null) as AcquisitionDistributionBootstrap | null
      setLastReplyPersist(result)
      if (data) applyBootstrapData(data)
      setToast(tx(locale, "回复已写入合作回流库", "Reply saved to the partnership feedback stream"))
    } catch (err) {
      setError(err instanceof Error ? err.message : tx(locale, "回复保存失败", "Failed to save reply"))
    } finally {
      setSavingReply(false)
    }
  }

  async function moveToPartnershipStage() {
    if (!primaryLead || !replyText.trim()) return
    setPromotingPartnership(true)
    setError("")
    try {
      const response = await fetch("/api/market-admin/admin/acquisition/distribution", {
        method: "POST",
        credentials: "same-origin",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: "promote_partnership",
          lead: primaryLead,
          replyText,
          disposition: replyInsight.disposition,
          summary: replyInsight.summary,
          nextStep: replyInsight.nextStep,
          locale,
          assetTitle: selectedAsset?.title || null,
        }),
      })
      const json = await response.json()
      if (!json.success) throw new Error(json.error || tx(locale, "合作推进失败", "Failed to promote partnership"))
      const result = (json.result || null) as AcquisitionPartnershipActivationSummary | null
      const data = (json.data || null) as AcquisitionDistributionBootstrap | null
      setLastPartnershipActivation(result)
      if (result?.replyEvent) {
        setLastReplyPersist({
          replyEvent: result.replyEvent,
          organization: result.organization,
          contact: result.contact,
          lead: result.lead,
        })
      }
      if (data) applyBootstrapData(data)
      setToast(tx(locale, "合作已推进到真实管道", "Partnership promoted into the real pipeline"))
    } catch (err) {
      setError(err instanceof Error ? err.message : tx(locale, "合作推进失败", "Failed to promote partnership"))
    } finally {
      setPromotingPartnership(false)
    }
  }

  function toggleLead(id: string) {
    setSelectedLeadIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  function setLeadContact(leadId: string, contactId: string) {
    setCrawlerLeads((current) => current.map((lead) => (lead.id === leadId ? applyLeadActiveContact(lead, contactId) : lead)))
  }

  function toggleOwned(id: string) {
    setSelectedOwnedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setToast(tx(locale, "已复制", "Copied"))
    } catch {
      setToast(tx(locale, "复制失败", "Copy failed"))
    }
  }

  async function openPrimaryDraft() {
    const lead = activeDraftLead
    if (!lead) return
    const subject = fillLeadTemplate(outreachSubjectTemplate, lead, locale)
    const body = fillLeadTemplate(outreachBodyTemplate, lead, locale)

    if (lead.contactChannel === "email") {
      window.location.href = `mailto:${encodeURIComponent(lead.contactValue)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      setToast(tx(locale, "已打开邮件草稿", "Opened email draft"))
      return
    }

    await copyText(`${subject}\n\n${body}`)
    setToast(getChannelActionLabel(locale, lead.contactChannel))
    window.open(getContactOpenUrl(lead), "_blank", "noopener,noreferrer,width=980,height=760")
  }

  async function sendBatchEmails() {
    if (!selectedEmailLeads.length) return
    setSendingBatchEmails(true)
    setError("")
    try {
      const response = await fetch("/api/market-admin/admin/acquisition/distribution", {
        method: "POST",
        credentials: "same-origin",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: "send_outreach_email_batch",
          leads: selectedEmailLeads,
          subject: outreachSubjectTemplate,
          body: outreachBodyTemplate,
          locale,
        }),
      })
      const json = await response.json()
      if (!json.success) throw new Error(json.error || tx(locale, "批量发送失败", "Batch send failed"))
      const result = json.result as OutreachBatchResult
      setBatchEmailResult(result)
      setToast(tx(locale, `已处理 ${result.total} 条公开邮箱`, `Processed ${result.total} public emails`))
    } catch (err) {
      setError(err instanceof Error ? err.message : tx(locale, "批量发送失败", "Batch send failed"))
    } finally {
      setSendingBatchEmails(false)
    }
  }

  async function sendPartnerBundleToLead() {
    if (!primaryLead || !selectedAsset) return
    const hasEmailContact = getLeadContacts(primaryLead).some((contact) => contact.channel === "email")
    setError("")

    if (hasEmailContact) {
      setSendingPartnerBundle(true)
      try {
        const response = await fetch("/api/market-admin/admin/acquisition/distribution", {
          method: "POST",
          credentials: "same-origin",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            action: "send_outreach_email_batch",
            leads: [primaryLead],
            subject: partnerBundleDraft.subject,
            body: partnerBundleDraft.body,
            locale,
          }),
        })
        const json = await response.json()
        if (!json.success) throw new Error(json.error || tx(locale, "资料包发送失败", "Failed to send the partner bundle"))
        const result = json.result as OutreachBatchResult
        setBatchEmailResult(result)
        setToast(
          result.sent
            ? tx(locale, "资料包已发送给当前合作方", "Partner bundle sent to the current partner")
            : tx(locale, "未找到可发送邮箱，已切换为手动发送", "No valid email was sent, switched to manual delivery"),
        )
        if (!result.sent) {
          await copyText(`${partnerBundleDraft.subject}\n\n${partnerBundleDraft.body}`)
          window.open(getContactOpenUrl(primaryLead), "_blank", "noopener,noreferrer,width=980,height=760")
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : tx(locale, "资料包发送失败", "Failed to send the partner bundle"))
      } finally {
        setSendingPartnerBundle(false)
      }
      return
    }

    await copyText(`${partnerBundleDraft.subject}\n\n${partnerBundleDraft.body}`)
    setToast(tx(locale, "已复制资料包文案并打开联系入口", "Copied the partner bundle message and opened the contact entry"))
    window.open(getContactOpenUrl(primaryLead), "_blank", "noopener,noreferrer,width=980,height=760")
  }

  async function publishDirectTarget(target: Pick<OwnedDistributionChannel, "id" | "label">) {
    if (!selectedAsset) return null

    setPublishingTargetId(target.id)
    setError("")

    try {
      const response = await fetch("/api/market-admin/admin/acquisition/distribution", {
        method: "POST",
        credentials: "same-origin",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: "publish_distribution_target",
          targetId: target.id,
          title: articlePayload.title,
          text: articlePayload.text,
          url: articlePayload.url,
          locale,
          asset: {
            id: selectedAsset.id,
            title: selectedAsset.title,
            kind: selectedAsset.kind,
            fileName: selectedAsset.fileName,
            url: bundlePayload.assetUrl,
          },
        }),
      })
      const json = await response.json()
      if (!json.success) throw new Error(json.error || tx(locale, "直发失败", "Direct publish failed"))
      return json.result as DirectPublishResult
    } catch (err) {
      const message = err instanceof Error ? err.message : tx(locale, "直发失败", "Direct publish failed")
      setError(message)
      return {
        targetId: target.id,
        targetLabel: target.label,
        status: "failed",
        message,
      } satisfies DirectPublishResult
    } finally {
      setPublishingTargetId("")
    }
  }

  function share(platformConfig: SharePlatformConfig) {
    if (!selectedAsset) return
    if (platformConfig.mode === "copy") {
      void copyText(`${sharePayload.title}\n${sharePayload.text}\n${sharePayload.url}`)
      setToast(tx(locale, "已复制小红书辅助发布文案", "Copied the assisted Xiaohongshu publish copy"))
      return
    }
    if (platformConfig.id === "email") {
      if (!selectedEmailLeads.length) {
        setError(tx(locale, "请先多选至少一个带公开邮箱的目标。", "Select at least one target with a public email first."))
        return
      }
      void sendBatchEmails()
      return
    }
    const shareUrl = buildShareUrl(platformConfig.id, sharePayload)
    window.open(shareUrl, "_blank", "noopener,noreferrer,width=980,height=760")
  }

  async function distributeOwnedChannels() {
    const directChannels = selectedOwnedChannels.filter((item) => item.mode === "direct")
    const intentChannels = selectedOwnedChannels.filter((item) => item.mode === "intent")
    const copyChannels = selectedOwnedChannels.filter((item) => item.mode === "copy")
    const directResults: DirectPublishResult[] = []

    for (const channel of directChannels) {
      const result = await publishDirectTarget(channel)
      if (result) directResults.push(result)
    }

    intentChannels.forEach((channel, index) => {
      window.setTimeout(() => window.open(buildOwnedChannelUrl(channel, articlePayload), "_blank", "noopener,noreferrer,width=980,height=760"), index * 120)
    })
    if (copyChannels.length) await copyText(`${articlePayload.title}\n${articlePayload.text}\n${articlePayload.url}`)

    if (directResults.length) {
      const failed = directResults.filter((item) => item.status === "failed")
      setToast(
        failed.length
          ? `${tx(locale, "直发已执行，失败", "Direct publish attempted, failed")} ${failed.length} / ${directResults.length}`
          : tx(locale, "已触发授权直发", "Authorized direct publish triggered"),
      )
    }
  }

  async function oneClickSend() {
    setSendingAll(true)
    try {
      const externalTargets = (bootstrap?.sharePlatforms || []).filter((item) => item.id !== "email")
      externalTargets.forEach((item, index) => {
        window.setTimeout(() => {
          if (item.mode === "copy") {
            void copyText(`${sharePayload.title}\n${sharePayload.text}\n${sharePayload.url}`)
            return
          }
          window.open(buildShareUrl(item.id, sharePayload), "_blank", "noopener,noreferrer,width=980,height=760")
        }, index * 120)
      })
      setToast(tx(locale, "已触发外部平台分发", "External platform distribution triggered"))
    } finally {
      setSendingAll(false)
    }
  }

  function nativeShare() {
    try {
      nativeShareLink({ url: articlePayload.url, text: `${articlePayload.title} ${articlePayload.text}`.trim() })
    } catch {
      setToast(tx(locale, "系统分享不可用", "Native share unavailable"))
    }
  }

  if (loading) {
    return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-6" id={embedded ? "crawler-distribution-workspace" : undefined}>
      {showIntro && (
        <section className="rounded-3xl border bg-background px-6 py-7 shadow-sm md:px-8 md:py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <Badge variant="outline" className="gap-2 px-3 py-1"><Megaphone className="h-3.5 w-3.5" />{tx(locale, "公开线索工作区", "Public lead workspace")}</Badge>
              {embedded ? <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{tx(locale, "AI 获客 + 合作触达 + 内容分发", "AI acquisition + outreach + distribution")}</h2> : <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{tx(locale, "AI 获客 + 合作触达 + 内容分发", "AI acquisition + outreach + distribution")}</h1>}
              <p className="max-w-4xl text-sm text-muted-foreground md:text-base">{tx(locale, "只处理公开商务联系方式，单次任务最多 1000 条；公开邮箱支持批量发送，其他渠道默认人工审核或手动跟进。", "Only public business contacts are handled, with a hard cap of 1000 per run. Public emails can be batch-sent, while other channels stay review-first or manual.")}</p>
            </div>
            <Button variant="outline" onClick={() => void loadBootstrap()}><RefreshCw className="mr-2 h-4 w-4" />{tx(locale, "刷新工作区", "Refresh workspace")}</Button>
          </div>
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-none shadow-sm"><CardContent className="flex items-center gap-3 px-5 py-4"><ShieldCheck className="h-5 w-5 text-emerald-600" /><div><div className="text-sm font-semibold">{tx(locale, "公开联系方式", "Public contacts")}</div><div className="text-xs text-muted-foreground">{tx(locale, "仅公开商务入口", "Public business entry only")}</div></div></CardContent></Card>
        <Card className="border-none shadow-sm"><CardContent className="flex items-center gap-3 px-5 py-4"><CheckCircle2 className="h-5 w-5 text-sky-600" /><div><div className="text-sm font-semibold">{tx(locale, "审核后发送", "Review before send")}</div><div className="text-xs text-muted-foreground">{tx(locale, "默认人工确认", "Human review by default")}</div></div></CardContent></Card>
        <Card className="border-none shadow-sm"><CardContent className="flex items-center gap-3 px-5 py-4"><Radar className="h-5 w-5 text-violet-600" /><div><div className="text-sm font-semibold">{tx(locale, "1000 条上限", "1000-contact cap")}</div><div className="text-xs text-muted-foreground">{bootstrap?.guardrails.maxContactsPerRun || 1000}</div></div></CardContent></Card>
        <Card className="border-none shadow-sm"><CardContent className="flex items-center gap-3 px-5 py-4"><Globe2 className="h-5 w-5 text-amber-600" /><div><div className="text-sm font-semibold">{tx(locale, "自有分发渠道", "Owned channels")}</div><div className="text-xs text-muted-foreground">{bootstrap?.guardrails.ownedChannelCount || 10}</div></div></CardContent></Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardContent className="grid gap-3 px-5 py-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-muted/20 p-4">
            <div className="text-xs text-muted-foreground">{tx(locale, "当前选中对象", "Current selected target")}</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{primaryLead ? `${primaryLead.organization} · ${primaryLead.contactName}` : tx(locale, "未选择", "Not selected")}</div>
            <div className="mt-1 text-xs text-muted-foreground">{primaryLead ? getLeadLabel(locale, primaryLead.segment) : tx(locale, "先选择线索", "Pick a lead first")}</div>
          </div>
          <div className="rounded-2xl border bg-muted/20 p-4">
            <div className="text-xs text-muted-foreground">{tx(locale, "当前联系方式", "Current contact method")}</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{primaryLead ? `${getChannelLabel(locale, primaryLead.contactChannel)} · ${primaryLead.contactValue}` : tx(locale, "未选择", "Not selected")}</div>
            <div className="mt-1 text-xs text-muted-foreground">{primaryLead ? primaryLead.contactRole : tx(locale, "选择后显示", "Appears after selection")}</div>
          </div>
          <div className="rounded-2xl border bg-muted/20 p-4">
            <div className="text-xs text-muted-foreground">{tx(locale, "发送方式", "Delivery mode")}</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{currentDeliveryMode}</div>
            <div className="mt-1 text-xs text-muted-foreground">{demoMode ? tx(locale, "当前处于多联系方式演示模式", "Currently in multi-contact demo mode") : tx(locale, "当前为采集结果模式", "Currently using live discovery results")}</div>
          </div>
        </CardContent>
      </Card>

      {error && <Card className="border-rose-200 bg-rose-50"><CardContent className="px-6 py-4 text-sm text-rose-700">{error}</CardContent></Card>}

      {ops && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-slate-700" />{tx(locale, "运营落库总览", "Persisted ops overview")}</CardTitle>
              <CardDescription>{tx(locale, "当前工作区已连接真实获客实体、回复记录和合作推进流水。", "This workspace now writes into persistent acquisition entities, reply records, and partnership flows.")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border bg-muted/20 p-4"><div className="text-xs text-muted-foreground">{tx(locale, "当前后端", "Active backend")}</div><div className="mt-1 text-sm font-semibold uppercase">{ops.storage.backend}</div><div className="mt-1 text-xs text-muted-foreground">{ops.storage.region}</div></div>
              <div className="rounded-2xl border bg-muted/20 p-4"><div className="text-xs text-muted-foreground">{tx(locale, "规则版本", "Rule version")}</div><div className="mt-1 text-sm font-semibold">v{ops.ruleSet?.version || 1}</div><div className="mt-1 text-xs text-muted-foreground">{ops.ruleSet?.key || "default"}</div></div>
              <div className="rounded-2xl border bg-muted/20 p-4"><div className="text-xs text-muted-foreground">{tx(locale, "组织 / 联系人", "Orgs / contacts")}</div><div className="mt-1 text-sm font-semibold">{ops.stats.organizations} / {ops.stats.contacts}</div></div>
              <div className="rounded-2xl border bg-muted/20 p-4"><div className="text-xs text-muted-foreground">{tx(locale, "线索 / 合作", "Leads / partnerships")}</div><div className="mt-1 text-sm font-semibold">{ops.stats.leads} / {ops.stats.partnerships}</div><div className="mt-1 text-xs text-muted-foreground">{tx(locale, "活跃合作", "Active pipeline")} {ops.stats.activePartnerships}</div></div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="h-5 w-5 text-emerald-600" />{tx(locale, "合作推进与追踪资产", "Partnership pipeline and tracking assets")}</CardTitle>
              <CardDescription>{tx(locale, "正向回复会进入合作管道，并生成邀请码、优惠码和追踪链接。", "Positive replies move into the partnership pipeline and can generate invite codes, coupon codes, and tracking links.")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!ops.partnerships.length && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-muted-foreground">{tx(locale, "还没有合作记录，先保存回复并推进一条线索。", "No partnership records yet. Save a reply and promote one lead first.")}</div>}
              {ops.partnerships.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-2xl border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{item.status}</Badge>
                    <span className="text-sm font-medium">{item.organizationName || item.id}</span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">{item.partnerType} · {tx(locale, "追踪资产", "Tracking assets")} {item.trackingAssetCount}</div>
                </div>
              ))}
              {ops.trackingAssets.slice(0, 3).map((asset) => (
                <div key={asset.id} className="rounded-2xl border bg-background px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{asset.assetType}</Badge><span className="font-medium">{asset.code}</span></div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{asset.url || tx(locale, "无外链，使用内部码追踪。", "No direct URL; tracked by internal code.")}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Radar className="h-5 w-5 text-sky-600" />{tx(locale, "公开线索采集", "Public lead discovery")}</CardTitle>
            <CardDescription>{tx(locale, "通过文件导入、实时搜索 API 或 webhook 连接公开商务联系方式。", "Connect public business contacts through import, live search APIs, or a webhook connector.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className={`rounded-2xl border px-4 py-3 text-sm ${leadSource?.mode === "live" ? "border-emerald-200 bg-emerald-50/70 text-emerald-900" : leadSource?.mode === "configured" ? "border-sky-200 bg-sky-50/70 text-sky-900" : "border-amber-200 bg-amber-50/70 text-amber-900"}`}>
              <div className="font-medium">{leadSource?.mode === "live" ? tx(locale, "已接入实时线索源", "Live lead source connected") : leadSource?.mode === "configured" ? tx(locale, "当前为导入线索模式", "Imported lead source configured") : tx(locale, "尚未接入真实线索源", "No live lead source connected")}</div>
              <div className="mt-1 text-xs opacity-80">{leadSource?.provider || tx(locale, "本地导入", "Local import")}{leadSource?.path ? ` · ${leadSource.path}` : ""}</div>
              <div className="mt-2 text-sm opacity-90">{leadSource?.note || tx(locale, "请接入合规的公开商务联系方式数据源。", "Connect an approved public business-contact source to enable live discovery.")}</div>
              {!!leadSource?.capabilities?.length && <div className="mt-3 flex flex-wrap gap-2">{leadSource.capabilities.map((capability) => <Badge key={capability} variant="outline" className="bg-white/70">{capability}</Badge>)}</div>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>{tx(locale, "目标对象", "Audience")}</Label><Select value={targetType} onValueChange={(value) => setTargetType(value as TargetType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="blogger">{tx(locale, "博主 / KOL", "Creators / KOLs")}</SelectItem><SelectItem value="b2b">{tx(locale, "ToB 企业", "B2B companies")}</SelectItem><SelectItem value="vc">{tx(locale, "VC / 投资机构", "VC / funds")}</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>{tx(locale, "平台", "Platform")}</Label><Select value={platform} onValueChange={setPlatform}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="xiaohongshu">Xiaohongshu</SelectItem><SelectItem value="douyin">Douyin</SelectItem><SelectItem value="bilibili">Bilibili</SelectItem><SelectItem value="weibo">Weibo</SelectItem><SelectItem value="linkedin">LinkedIn</SelectItem><SelectItem value="x">X</SelectItem><SelectItem value="website">Website</SelectItem></SelectContent></Select></div>
              <div className="space-y-2 md:col-span-2"><Label>{tx(locale, "关键词", "Keyword")}</Label><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={tx(locale, "例如：AI 协作 / 企业沟通 / SaaS demo", "For example: AI collaboration / enterprise chat / SaaS demo")} /></div>
              <div className="space-y-2"><Label>{tx(locale, "区域", "Region")}</Label><Select value={region} onValueChange={setRegion}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CN">{tx(locale, "中国", "China")}</SelectItem><SelectItem value="INTL">{tx(locale, "国际", "International")}</SelectItem><SelectItem value="Global">{tx(locale, "全球", "Global")}</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>{tx(locale, "采集上限", "Run limit")}</Label><Input value={limit} onChange={(event) => setLimit(event.target.value)} /><div className="text-xs text-muted-foreground">{tx(locale, "默认先点“快速采集”，建议 8-12 条；需要更全结果时再点“深度采集”，最多 36 条。", "Start with quick discovery at 8-12 results. Use deep discovery only when you need broader coverage, up to 36 results.")}</div></div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void runCrawler("quick")} disabled={runningCrawler}>
                {runningCrawlerMode === "quick" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}
                {tx(locale, "快速采集", "Quick discovery")}
              </Button>
              <Button variant="outline" onClick={() => void runCrawler("deep")} disabled={runningCrawler}>
                {runningCrawlerMode === "deep" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />}
                {tx(locale, "深度采集", "Deep discovery")}
              </Button>
              <Button variant="outline" onClick={loadMultiContactDemo}><Users className="mr-2 h-4 w-4" />{tx(locale, "加载多联系方式演示", "Load multi-contact demo")}</Button>
              {demoMode && <Button variant="outline" onClick={restoreLeadResults}><RefreshCw className="mr-2 h-4 w-4" />{tx(locale, "退出演示并恢复结果", "Exit demo and restore results")}</Button>}
              <Badge variant="outline">{tx(locale, "默认模式", "Default mode")}: {tx(locale, "快速", "Quick")}</Badge>
              <Badge variant="outline">{tx(locale, "已选线索", "Selected leads")}: {selectedLeads.length}</Badge>
            </div>

            {lastCrawlerPersist && (
              <div className="rounded-2xl border bg-muted/20 p-4 text-sm">
                <div className="font-medium text-foreground">{tx(locale, "最近一次落库结果", "Latest persistence result")}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-muted-foreground">
                  <Badge variant="outline">{tx(locale, "组织新增", "New orgs")}: {lastCrawlerPersist.organizationsCreated}</Badge>
                  <Badge variant="outline">{tx(locale, "联系人新增", "New contacts")}: {lastCrawlerPersist.contactsCreated}</Badge>
                  <Badge variant="outline">{tx(locale, "线索新增", "New leads")}: {lastCrawlerPersist.leadsCreated}</Badge>
                  <Badge variant="outline">{tx(locale, "合格线索", "Qualified")}: {lastCrawlerPersist.qualifiedLeads}</Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">{lastCrawlerPersist.task.name}</div>
              </div>
            )}

            <div className="max-h-[520px] space-y-3 overflow-auto pr-1">
              {!crawlerLeads.length && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-muted-foreground">{tx(locale, "运行一次采集后，这里会出现公开联系方式。", "Run discovery once and public contacts will appear here.")}</div>}
              {crawlerLeads.map((lead) => {
                const active = selectedLeadIds.includes(lead.id)
                const Icon = getLeadIcon(lead.segment)
                const contacts = getLeadContacts(lead)
                return (
                  <div key={lead.id} className={`rounded-2xl border p-4 transition ${active ? "border-primary bg-primary/5" : "bg-muted/20"}`}>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2"><Icon className="h-4 w-4 text-slate-700" /><span className="text-sm font-semibold">{lead.title}</span><Badge variant="secondary">{getLeadLabel(locale, lead.segment)}</Badge><Badge variant="outline">{lead.platform}</Badge><Badge variant="outline">{lead.region}</Badge><Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{lead.fit}% fit</Badge></div>
                      <div className="text-sm text-slate-700">{lead.organization}</div>
                      <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2"><div>{lead.contactName} · {lead.contactRole}</div><div>{tx(locale, "公开来源", "Public source")}: {lead.sourceLabel}</div><div className="break-all md:col-span-2">{getChannelLabel(locale, lead.contactChannel)}: {lead.contactValue}</div><div className="md:col-span-2">{lead.suggestedAngle}</div></div>
                      <div className="rounded-xl border bg-background/70 p-3">
                        <div className="text-xs font-medium text-foreground">{tx(locale, "可用联系方式", "Available contacts")} · {contacts.length}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {contacts.map((contact) => {
                            const selected = lead.primaryContactId === contact.id
                            return (
                              <button
                                key={contact.id}
                                type="button"
                                onClick={() => setLeadContact(lead.id, contact.id)}
                                className={`rounded-full border px-3 py-1 text-left text-xs transition ${selected ? "border-primary bg-primary/10 text-primary" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                              >
                                <span className="font-medium">{getChannelLabel(locale, contact.channel)}</span>
                                <span className="mx-1">·</span>
                                <span className="break-all">{contact.value}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3"><Button variant={active ? "default" : "outline"} size="sm" onClick={() => toggleLead(lead.id)}>{active ? tx(locale, "取消选择", "Remove") : tx(locale, "加入触达", "Select")}</Button><Button asChild variant="outline" size="sm"><Link href={lead.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />{tx(locale, "打开来源", "Open source")}</Link></Button></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2"><CardTitle className="flex items-center gap-2"><FolderOpen className="h-5 w-5 text-violet-600" />{tx(locale, "Demo 素材包", "Demo asset pack")}</CardTitle><CardDescription>{tx(locale, "自动读取 /demo 素材，用于合作触达与内容分发。", "Automatically reads /demo materials for outreach and distribution.")}</CardDescription></div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                size="sm"
                onClick={() => void sendPartnerBundleToLead()}
                disabled={!primaryLead || !selectedAsset || sendingPartnerBundle}
                className="w-full sm:w-auto"
              >
                {sendingPartnerBundle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {getPartnerBundleButtonLabel(locale, primaryLead)}
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full sm:w-auto"><a href="/api/demo/download"><Download className="mr-2 h-4 w-4" />{tx(locale, "一键下载资料包", "Download bundle")}</a></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!assets.length && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-muted-foreground">{tx(locale, "当前没有 /demo 素材，请先到 /admin 生成。", "No /demo assets yet. Generate them from /admin first.")}</div>}
            {!!assets.length && selectedAsset && <div className="rounded-2xl border bg-muted/20 p-4"><div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{tx(locale, "当前素材", "Selected asset")}</div><div className="mt-3 text-lg font-semibold">{selectedAsset.title}</div><div className="mt-2 text-sm text-muted-foreground">{selectedAsset.description}</div><div className="mt-3 text-xs text-muted-foreground">{selectedAsset.fileName} · {(selectedAsset.size / 1024).toFixed(1)} KB</div><div className="mt-4 rounded-xl border bg-background px-3 py-3 text-xs text-muted-foreground"><div className="font-medium text-foreground">{tx(locale, "当前发送对象", "Current delivery target")}</div><div className="mt-1">{primaryLead ? `${primaryLead.organization} · ${primaryLead.contactName}` : tx(locale, "先在左侧选择一个对象。", "Select a target from the left first.")}</div><div className="mt-2">{primaryLead ? `${tx(locale, "当前渠道", "Current channel")}: ${getChannelLabel(locale, primaryLead.contactChannel)} · ${primaryLead.contactValue}` : tx(locale, "选中后会显示当前联系方式。", "The current contact method appears after selection.")}</div><div className="mt-2">{tx(locale, "发送方式", "Delivery mode")}: {currentDeliveryMode}</div><div className="mt-2 break-all">{tx(locale, "资料包 ZIP", "Bundle ZIP")}: {bundlePayload.bundleUrl}</div></div><div className="mt-4 flex flex-wrap gap-3"><Button asChild variant="outline" size="sm"><Link href={getPreviewHref(selectedAsset.id)} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />{tx(locale, "打开预览", "Open preview")}</Link></Button><Button asChild size="sm"><a href={selectedAsset.url} download={selectedAsset.fileName}><Download className="mr-2 h-4 w-4" />{tx(locale, "下载文件", "Download file")}</a></Button><Button variant="outline" size="sm" onClick={() => void copyText(`${partnerBundleDraft.subject}\n\n${partnerBundleDraft.body}`)} disabled={!selectedAsset}><Copy className="mr-2 h-4 w-4" />{tx(locale, "复制发送文案", "Copy delivery copy")}</Button></div></div>}
            <div className="space-y-3">{assets.map((asset) => <button key={asset.id} type="button" onClick={() => setSelectedAssetId(asset.id)} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selectedAsset?.id === asset.id ? "border-primary bg-primary/5 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-900">{asset.title}</div><div className="mt-1 truncate text-xs text-slate-500">{asset.fileName}</div></div><Badge variant="outline">{asset.kind.toUpperCase()}</Badge></div></button>)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-amber-600" />{tx(locale, "合作触达草稿", "Outreach drafts")}</CardTitle>
            <CardDescription>{tx(locale, "公开邮箱支持显式批量发送；其他渠道默认人工审核或手动跟进。", "Public emails support explicit batch sending; other channels stay review-first or manual.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">{tx(locale, "公开商务联系方式", "Public business contacts")}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedLeads.slice(0, 8).map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setActiveDraftLeadId(lead.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${activeDraftLead?.id === lead.id ? "border-primary bg-primary/10 text-primary" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    {lead.organization}
                  </button>
                ))}
              </div>
              {!!selectedLeads.length && <div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">{tx(locale, "公开邮箱", "Public emails")}: {selectedEmailLeads.length}</Badge><Badge variant="outline">{tx(locale, "人工跟进渠道", "Manual channels")}: {selectedManualLeads.length}</Badge></div>}
              {primaryLead && (
                <div className="mt-3 rounded-xl border bg-background px-3 py-3 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">{tx(locale, "当前预览对象", "Current draft target")}</div>
                  <div className="mt-2 text-sm text-foreground">{primaryLead.organization} · {primaryLead.contactName}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">{getChannelLabel(locale, primaryLead.contactChannel)}</Badge>
                    <Badge variant="outline">{getChannelActionLabel(locale, primaryLead.contactChannel)}</Badge>
                    <Badge variant="outline">{getLeadLabel(locale, primaryLead.segment)}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getLeadContacts(primaryLead).map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => setLeadContact(primaryLead.id, contact.id)}
                        className={`rounded-full border px-3 py-1 text-xs transition ${primaryLead.primaryContactId === contact.id ? "border-primary bg-primary/10 text-primary" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                      >
                        {getChannelLabel(locale, contact.channel)} · {contact.value}
                      </button>
                    ))}
                  </div>
                  {getLeadContacts(primaryLead).length <= 1 && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                      {tx(locale, "当前这条线索只抓到 1 个公开联系方式，所以这里不会展开出多种渠道。你可以重新采集，或者点上面的“加载多联系方式演示”立即查看效果。", "This lead currently has only one public contact, so multiple channels are not shown here yet. You can rerun discovery or click 'Load multi-contact demo' above to see the multi-contact experience immediately.")}
                    </div>
                  )}
                  <div className="mt-2">
                    {tx(locale, "当前草稿会按合作方对象、联系方式、平台与切入点自动生成；批量发送公开邮箱时，也会逐个替换为各自内容。", "The draft is generated per partner, channel, platform, and outreach angle. Batch sending to public emails also replaces the content lead by lead.")}
                  </div>
                </div>
              )}
              {!selectedLeads.length && <div className="mt-2">{tx(locale, "还没有选中线索，请先在左侧选择。", "No leads selected yet. Pick contacts on the left first.")}</div>}
            </div>
            <div className="space-y-2">
              <Label>{tx(locale, "标题", "Subject")}</Label>
              <Input
                value={outreachSubjectPreview}
                onChange={(event) => {
                  setOutreachTemplateDirty(true)
                  setOutreachSubjectTemplate(revertLeadPreviewToTemplate(event.target.value, activeDraftLead, locale))
                }}
              />
              <div className="text-xs text-muted-foreground">
                {tx(locale, "这里显示的是当前合作方预览，底层会保留动态变量，批量发送时会自动替换成每个合作方自己的标题。", "This shows the current partner preview while keeping dynamic variables underneath, so batch send can replace the subject for each partner.")}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{tx(locale, "正文", "Body")}</Label>
              <Textarea
                value={outreachBodyPreview}
                onChange={(event) => {
                  setOutreachTemplateDirty(true)
                  setOutreachBodyTemplate(revertLeadPreviewToTemplate(event.target.value, activeDraftLead, locale))
                }}
                className="min-h-[220px]"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => { setOutreachTemplateDirty(false); setOutreachSubjectTemplate(outreachDraft.subject); setOutreachBodyTemplate(outreachDraft.body) }}><Sparkles className="mr-2 h-4 w-4" />{tx(locale, "恢复自动草稿", "Restore draft")}</Button>
              <Button variant="outline" onClick={() => void copyText(`${outreachSubjectPreview}\n\n${outreachBodyPreview}`)}><Copy className="mr-2 h-4 w-4" />{tx(locale, "复制草稿", "Copy draft")}</Button>
              <Button onClick={() => void openPrimaryDraft()} disabled={!selectedLeads.length}><ExternalLink className="mr-2 h-4 w-4" />{tx(locale, "打开当前对象草稿", "Open current draft")}</Button>
              <Button onClick={() => void sendBatchEmails()} disabled={!selectedEmailLeads.length || sendingBatchEmails}>{sendingBatchEmails ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}{tx(locale, "批量发送公开邮箱", "Send public email batch")}</Button>
              <Button variant="secondary" onClick={() => setToast(tx(locale, "已加入审核队列", "Added to review queue"))} disabled={!selectedLeads.length}><ShieldCheck className="mr-2 h-4 w-4" />{tx(locale, "加入审核队列", "Stage for review")}</Button>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Radar className="h-4 w-4 text-sky-600" />
                {tx(locale, "回复回流工作区", "Reply capture workspace")}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {tx(locale, "把邮件回复、私信回执或官网表单回信粘贴到这里，系统会按不同联系方式判断下一步动作，并生成合作推进建议。", "Paste an email reply, DM response, or website-form follow-up here and the workspace will classify the next action by channel, then generate a partnership next-step recommendation.")}
              </div>
              <div className="mt-4 space-y-2">
                <Label>{tx(locale, "回复内容", "Reply content")}</Label>
                <Textarea
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  className="min-h-[140px]"
                  placeholder={tx(locale, "例如：我们感兴趣，请先发 deck 和报价；或：可以约个 demo。", "For example: We are interested, please send the deck and pricing; or: Let's schedule a demo.")}
                />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-background px-4 py-3 text-sm">
                  <div className="text-xs text-muted-foreground">{tx(locale, "回复判断", "Reply classification")}</div>
                  <div className="mt-1 font-medium text-foreground">{replyInsight.summary}</div>
                  <div className="mt-2">
                    <Badge variant="outline">{replyInsight.disposition}</Badge>
                  </div>
                </div>
                <div className="rounded-xl border bg-background px-4 py-3 text-sm">
                  <div className="text-xs text-muted-foreground">{tx(locale, "建议下一步", "Suggested next step")}</div>
                  <div className="mt-1 font-medium text-foreground">{replyInsight.nextStep}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => void copyText(replyInsight.nextStep)}
                  disabled={!replyText.trim()}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {tx(locale, "复制下一步动作", "Copy next-step action")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void saveReplyCapture()}
                  disabled={!replyText.trim() || !primaryLead || savingReply}
                >
                  {savingReply ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  {tx(locale, "保存回复判断", "Save reply record")}
                </Button>
                <Button
                  onClick={() => void moveToPartnershipStage()}
                  disabled={!replyText.trim() || !primaryLead || promotingPartnership}
                >
                  {promotingPartnership ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {tx(locale, "推进到合作阶段", "Move to partnership stage")}
                </Button>
              </div>
              {(lastReplyPersist || lastPartnershipActivation) && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {lastReplyPersist && (
                    <div className="rounded-2xl border bg-background px-4 py-3 text-sm">
                      <div className="text-xs text-muted-foreground">{tx(locale, "最近写入的回复", "Last persisted reply")}</div>
                      <div className="mt-1 font-medium text-foreground">{lastReplyPersist.organization.name}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline">{lastReplyPersist.replyEvent.disposition}</Badge>
                        <Badge variant="outline">{lastReplyPersist.lead.status}</Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">{lastReplyPersist.replyEvent.suggestedNextAction || replyInsight.nextStep}</div>
                    </div>
                  )}
                  {lastPartnershipActivation && (
                    <div className="rounded-2xl border bg-background px-4 py-3 text-sm">
                      <div className="text-xs text-muted-foreground">{tx(locale, "最近推进的合作", "Last promoted partnership")}</div>
                      <div className="mt-1 font-medium text-foreground">{lastPartnershipActivation.organization.name}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="secondary">{lastPartnershipActivation.partnership.status}</Badge>
                        <Badge variant="outline">{tx(locale, "资产", "Assets")} {lastPartnershipActivation.trackingAssets.length}</Badge>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {lastPartnershipActivation.marketingInvitationCode && <div>{tx(locale, "邀请码", "Invite code")}: {lastPartnershipActivation.marketingInvitationCode.code}</div>}
                        {lastPartnershipActivation.marketingCoupon && <div>{tx(locale, "优惠码", "Coupon")}: {lastPartnershipActivation.marketingCoupon.code}</div>}
                        {lastPartnershipActivation.trackingAssets.find((asset) => asset.assetType === "link")?.url && (
                          <div className="truncate">{lastPartnershipActivation.trackingAssets.find((asset) => asset.assetType === "link")?.url}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {batchEmailResult && <div className="rounded-2xl border bg-muted/20 p-4 text-sm"><div className="font-medium text-foreground">{tx(locale, "批量发送结果", "Batch send result")}</div><div className="mt-2 flex flex-wrap gap-2 text-muted-foreground"><Badge variant="outline">{tx(locale, "总计", "Total")}: {batchEmailResult.total}</Badge><Badge variant="outline">{tx(locale, "已发送", "Sent")}: {batchEmailResult.sent}</Badge><Badge variant="outline">{tx(locale, "跳过", "Skipped")}: {batchEmailResult.skipped}</Badge><Badge variant="outline">{tx(locale, "失败", "Failed")}: {batchEmailResult.failed}</Badge></div><div className="mt-3 space-y-2">{batchEmailResult.results.slice(0, 6).map((item) => <div key={`${item.leadId}-${item.contactValue}`} className="rounded-xl border bg-background px-3 py-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{item.organization}</span>{" · "}{item.contactValue}{" · "}{item.status}{" · "}{item.message}</div>)}</div></div>}
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-emerald-600" />{tx(locale, "合作后内容分发", "Post-partnership article distribution")}</CardTitle>
            <CardDescription>{tx(locale, "抖音与 WeChat OA 走授权直发；小红书保留半自动发布；其余平台继续使用 intent 或复制辅助。", "Douyin and WeChat OA use authorized direct publishing. Xiaohongshu stays semi-automatic, while the rest continue through intent or copy-assisted flows.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-sm font-medium text-foreground">{tx(locale, "合作资料包直发", "Direct partner bundle delivery")}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {tx(locale, "这里会把已经生成好的宣传资料包直接发给当前合作方。邮箱会直接发送；其他联系人渠道仍保持复制文案并打开联系入口。", "This sends the generated partner bundle directly to the current partner. Email contacts are sent directly, while other partner-contact channels still copy the message and open the contact entry.")}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-background px-4 py-3 text-sm">
                  <div className="text-xs text-muted-foreground">{tx(locale, "当前合作方", "Current partner")}</div>
                  <div className="mt-1 font-medium text-foreground">{primaryLead ? `${primaryLead.organization} · ${primaryLead.contactName}` : tx(locale, "尚未选择合作方", "No partner selected yet")}</div>
                  <div className="mt-2 text-xs text-muted-foreground">{primaryLead ? `${getChannelLabel(locale, primaryLead.contactChannel)} · ${primaryLead.contactValue}` : tx(locale, "先在左侧选中一条线索。", "Select a lead from the left first.")}</div>
                </div>
                <div className="rounded-xl border bg-background px-4 py-3 text-sm">
                  <div className="text-xs text-muted-foreground">{tx(locale, "交付内容概览", "Delivery summary")}</div>
                  <div className="mt-1 font-medium text-foreground">{tx(locale, "完整资料包 ZIP + 当前主推材料", "Full bundle ZIP + current featured asset")}</div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div>{tx(locale, "当前主推材料", "Featured asset")}: {selectedAsset?.title || tx(locale, "未选择素材", "No asset selected")}</div>
                    <div className="break-all">{tx(locale, "资料包 ZIP", "Bundle ZIP")}: {bundlePayload.bundleUrl}</div>
                    <div className="break-all">{tx(locale, "素材链接", "Asset link")}: {bundlePayload.assetUrl}</div>
                    {!bundlePayload.publicReady && (
                      <div className="text-amber-600">
                        {tx(locale, "当前为本地或非公开站点链接，外部对象无法直接访问；正式交付请在可公网访问的正式域名环境下发送。", "These links point to a local or non-public origin and cannot be opened externally. Use a public production domain for formal delivery.")}
                      </div>
                    )}
                    {partnerTrackingAsset?.trackingUrl && <div className="break-all">{tx(locale, "追踪链接", "Tracking link")}: {partnerTrackingAsset.trackingUrl}</div>}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={() => void sendPartnerBundleToLead()} disabled={!primaryLead || !selectedAsset || sendingPartnerBundle}>
                  {sendingPartnerBundle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {getPartnerBundleButtonLabel(locale, primaryLead)}
                </Button>
                <Button variant="outline" onClick={() => void copyText(`${partnerBundleDraft.subject}\n\n${partnerBundleDraft.body}`)} disabled={!selectedAsset}>
                  <Copy className="mr-2 h-4 w-4" />
                  {tx(locale, "复制资料包文案", "Copy bundle message")}
                </Button>
                <Button variant="outline" onClick={() => { window.location.href = "/api/demo/download" }} disabled={!selectedAsset}>
                  <Download className="mr-2 h-4 w-4" />
                  {tx(locale, "下载资料包 ZIP", "Download bundle ZIP")}
                </Button>
              </div>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-sm font-medium text-foreground">{tx(locale, "自动生成的发布内容", "Auto-generated publish copy")}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {tx(locale, "这里会自动生成更完整的合作发布文案，默认包含开场定位、核心亮点、适用场景、推荐发布话术，以及邀请码/优惠码/追踪链接。", "This now generates a fuller launch draft by default, including positioning, key highlights, usage scenarios, publish-ready copy, and any invite code / promo code / tracking link available.")}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline">{tx(locale, "不是说明文档", "Not just a spec")}</Badge>
                <Badge variant="outline">{tx(locale, "不是一句简介", "Not just a short blurb")}</Badge>
                <Badge variant="outline">{tx(locale, "可直接改后发布", "Editable for direct posting")}</Badge>
              </div>
            </div>
            <div className="space-y-2"><Label>{tx(locale, "文章标题", "Article title")}</Label><Input value={articleTitle} onChange={(event) => setArticleTitle(event.target.value)} /></div>
            <div className="space-y-2"><Label>{tx(locale, "文章正文", "Article body")}</Label><Textarea value={articleBody} onChange={(event) => setArticleBody(event.target.value)} className="min-h-[320px]" /></div>
            <div className="space-y-3">
              <div className="text-sm font-medium">{tx(locale, "自有企业渠道", "Owned brand channels")}</div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {(bootstrap?.ownedChannels || []).map((channel) => {
                  const active = selectedOwnedIds.includes(channel.id)
                  return (
                    <div
                      key={channel.id}
                      className={`min-h-[132px] rounded-xl border px-3 py-2.5 text-left transition ${active ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[15px] font-semibold leading-5">{channel.label}</div>
                          <div className="mt-0.5 text-[12px] leading-4 text-muted-foreground">{channel.handle}</div>
                          {channel.hint && <div className="mt-1 line-clamp-2 text-[12px] leading-4 text-muted-foreground">{channel.hint}</div>}
                          {channel.mode === "direct" && (
                            <div className="mt-1.5 text-[12px] leading-4">
                              {channel.isConnected
                                ? tx(locale, "已连接授权账号", "Authorized account connected")
                                : tx(locale, "未连接授权账号", "No authorized account connected")}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <Badge variant={active ? "default" : "outline"}>{channel.region}</Badge>
                          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{getModeLabel(locale, channel.mode)}</span>
                        </div>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <Button type="button" size="sm" variant={active ? "default" : "outline"} onClick={() => toggleOwned(channel.id)}>
                          {active ? tx(locale, "已选中", "Selected") : tx(locale, "选择渠道", "Select channel")}
                        </Button>
                        {!!channel.connectUrl && !channel.isConnected && (
                          <Button asChild type="button" size="sm" variant="outline">
                            <a href={channel.connectUrl}>{tx(locale, "连接账号", "Connect account")}</a>
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {!bootstrap?.ownedChannels?.length && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-muted-foreground">
                    {tx(locale, "渠道配置暂未加载，页面会先保留兜底渠道列表。", "Channel configuration has not loaded yet. The page keeps a fallback channel list instead.")}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
              <div className="text-sm font-medium">{tx(locale, "外部分发平台", "External distribution platforms")}</div>
              <div className="text-xs text-muted-foreground">
                {tx(locale, "你要发到外部平台就用这里。Email 会按你多选的公开邮箱目标批量发送，并对每个目标自动套用对应文案变量；小红书当前仍是半自动复制辅助。", "Use this section when you want to distribute to external platforms. Email sends to your selected public-email targets in batch and applies the right template variables per target; Xiaohongshu remains copy-assisted.")}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(bootstrap?.sharePlatforms || []).map((item) => (
                  <Button
                    key={item.id}
                    variant="outline"
                    className="justify-between"
                    onClick={() => share(item)}
                    disabled={!selectedAsset || (item.id === "email" && (!selectedEmailLeads.length || sendingBatchEmails))}
                  >
                    <span>{item.label}</span>
                    <span className="text-xs text-muted-foreground">{getModeLabel(locale, item.mode)}</span>
                  </Button>
                ))}
                {!bootstrap?.sharePlatforms?.length && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-muted-foreground">
                    {tx(locale, "平台入口暂未加载，保底配置恢复后会在这里显示。", "Platform entries have not loaded yet. The fallback configuration will appear here instead.")}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => { setArticleTitle(articleDraft.title); setArticleBody(articleDraft.body) }}>
                <Sparkles className="mr-2 h-4 w-4" />
                {tx(locale, "恢复自动草稿", "Restore draft")}
              </Button>
              <Button variant="outline" onClick={() => void copyText(`${articleTitle}\n\n${articleBody}\n\n${articlePayload.url}`)}>
                <Copy className="mr-2 h-4 w-4" />
                {tx(locale, "复制文章", "Copy article")}
              </Button>
              <Button onClick={() => void distributeOwnedChannels()} disabled={!selectedOwnedChannels.length || !selectedAsset || Boolean(publishingTargetId)}>
                {publishingTargetId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe2 className="mr-2 h-4 w-4" />}
                {tx(locale, "发送到已选自有渠道", "Send to selected owned channels")}
              </Button>
              <Button onClick={() => void oneClickSend()} disabled={!selectedAsset || sendingAll || Boolean(publishingTargetId)}>
                {sendingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {tx(locale, "一键发到外部平台", "Send to external platforms")}
              </Button>
              <Button onClick={nativeShare} disabled={!canNativeShare()}>
                <Share2 className="mr-2 h-4 w-4" />
                {tx(locale, "系统分享", "System share")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {toast && <div className="fixed bottom-6 right-6 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  )
}
