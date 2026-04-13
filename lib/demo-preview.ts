import type { DemoManifestItem } from "@/lib/demo-bundle"

export type DemoPreviewMode = "inline" | "external" | "none"
export type DemoPreviewProvider =
  | "browser"
  | "microsoft-office-online"
  | "google-viewer"
  | "none"

export interface DemoPreviewConfig {
  mode: DemoPreviewMode
  provider: DemoPreviewProvider
  src: string | null
  publicAssetUrl: string | null
  reason: "public-url-required" | null
}

type DemoPreviewSetting = "auto" | "microsoft" | "google" | "none"

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

function resolveAbsoluteAssetUrl(pathname: string, preferredOrigin?: string | null) {
  const preferred = normalizeOrigin(preferredOrigin)
  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL)

  // When the current request is local development, do not silently jump to a
  // configured production origin. The local /demo files may exist only on the
  // developer machine, and remote viewers would then receive a broken URL.
  const origin = preferred && isPrivateHostname(new URL(preferred).hostname) ? preferred : configured || preferred

  if (!origin) return null

  try {
    return new URL(pathname, `${origin}/`).toString()
  } catch {
    return null
  }
}

function canUsePublicViewer(assetUrl: string | null) {
  if (!assetUrl) return false

  try {
    const parsed = new URL(assetUrl)
    if (parsed.protocol !== "https:") return false
    if (isPrivateHostname(parsed.hostname)) return false
    return true
  } catch {
    return false
  }
}

function getPreviewSetting(): DemoPreviewSetting {
  const raw = String(process.env.NEXT_PUBLIC_DEMO_PREVIEW_PROVIDER || "auto").trim().toLowerCase()
  if (raw === "microsoft" || raw === "google" || raw === "none") return raw
  return "auto"
}

function buildMicrosoftViewerUrl(assetUrl: string) {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(assetUrl)}`
}

function buildGoogleViewerUrl(assetUrl: string) {
  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(assetUrl)}`
}

export function resolveDemoPreview(
  item: Pick<DemoManifestItem, "kind" | "url">,
  options?: {
    preferredOrigin?: string | null
  },
): DemoPreviewConfig {
  const setting = getPreviewSetting()
  const publicAssetUrl = resolveAbsoluteAssetUrl(item.url, options?.preferredOrigin)
  const publicViewerReady = canUsePublicViewer(publicAssetUrl)

  if (item.kind === "video" || item.kind === "html") {
    return {
      mode: "inline",
      provider: "browser",
      src: item.url,
      publicAssetUrl,
      reason: null,
    }
  }

  if (item.kind === "pdf") {
    if ((setting === "auto" || setting === "google") && publicViewerReady && publicAssetUrl) {
      return {
        mode: "external",
        provider: "google-viewer",
        src: buildGoogleViewerUrl(publicAssetUrl),
        publicAssetUrl,
        reason: null,
      }
    }

    return {
      mode: "inline",
      provider: "browser",
      src: item.url,
      publicAssetUrl,
      reason: null,
    }
  }

  if (item.kind === "doc" || item.kind === "ppt") {
    if (setting === "none") {
      return {
        mode: "none",
        provider: "none",
        src: null,
        publicAssetUrl,
        reason: "public-url-required",
      }
    }

    if (!publicViewerReady || !publicAssetUrl) {
      return {
        mode: "none",
        provider: "none",
        src: null,
        publicAssetUrl,
        reason: "public-url-required",
      }
    }

    if (setting === "google") {
      return {
        mode: "external",
        provider: "google-viewer",
        src: buildGoogleViewerUrl(publicAssetUrl),
        publicAssetUrl,
        reason: null,
      }
    }

    return {
      mode: "external",
      provider: "microsoft-office-online",
      src: buildMicrosoftViewerUrl(publicAssetUrl),
      publicAssetUrl,
      reason: null,
    }
  }

  return {
    mode: "none",
    provider: "none",
    src: null,
    publicAssetUrl,
    reason: "public-url-required",
  }
}
