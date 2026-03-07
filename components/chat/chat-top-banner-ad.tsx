'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { IS_DOMESTIC_VERSION } from '@/config';
import { useSettings } from '@/lib/settings-context';
import { cn } from '@/lib/utils';

type TopBannerAd = {
  id: string;
  title: string;
  type: 'image' | 'video';
  fileUrl: string;
  linkUrl?: string;
  priority?: number;
  startDate?: string;
  endDate?: string;
  impression_count?: number;
  click_count?: number;
};

const ROTATION_INTERVAL_MS = 5000;
const SESSION_DISMISS_KEY = 'chat_top_banner_ad_dismissed';
const SESSION_IMPRESSION_PREFIX = 'chat_top_banner_ad_impression_';
const FALLBACK_AD_ID = 'demo-top-banner-ad';

function createFallbackAd(language: string): TopBannerAd {
  const isZh = language === 'zh';
  const title = isZh ? 'MornScience 广告位演示' : 'MornScience Banner Demo';
  const href = IS_DOMESTIC_VERSION
    ? 'https://orbital.mornscience.top/'
    : 'https://www.mornscience.work/';
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="320">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="45%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0b3b5b"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="320" fill="url(#bg)"/>
  <circle cx="1380" cy="70" r="200" fill="rgba(56,189,248,0.18)"/>
  <circle cx="180" cy="300" r="220" fill="rgba(14,165,233,0.16)"/>
  <rect x="72" y="88" width="220" height="18" rx="9" fill="rgba(248,250,252,0.82)"/>
  <rect x="72" y="132" width="560" height="14" rx="7" fill="rgba(203,213,225,0.74)"/>
  <rect x="72" y="162" width="420" height="14" rx="7" fill="rgba(203,213,225,0.62)"/>
  <rect x="72" y="192" width="310" height="14" rx="7" fill="rgba(203,213,225,0.52)"/>
</svg>`;
  const encodedSvg = encodeURIComponent(svg.trim());

  return {
    id: FALLBACK_AD_ID,
    title,
    type: 'image',
    fileUrl: `data:image/svg+xml;charset=utf-8,${encodedSvg}`,
    linkUrl: href,
    priority: -1,
    impression_count: 0,
    click_count: 0,
  };
}

export function ChatTopBannerAd() {
  const { language } = useSettings();
  const [ads, setAds] = useState<TopBannerAd[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const seenInSessionRef = useRef<Set<string>>(new Set());
  const fallbackAd = useMemo(() => createFallbackAd(language), [language]);
  const displayAds = useMemo(() => (ads.length > 0 ? ads : [fallbackAd]), [ads, fallbackAd]);
  const currentAd = displayAds[currentIndex] || null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(window.sessionStorage.getItem(SESSION_DISMISS_KEY) === '1');
  }, []);

  useEffect(() => {
    let aborted = false;

    async function loadAds() {
      try {
        const response = await fetch('/api/ads/active?position=top&limit=20', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) return;
        const result = await response.json();
        if (!result?.success || !Array.isArray(result?.data)) return;

        if (!aborted) {
          setAds(
            result.data.filter((ad: TopBannerAd) => ad && ad.fileUrl && ad.type && ad.title)
          );
        }
      } catch (error) {
        console.warn('[ChatTopBannerAd] 加载广告失败:', error);
      }
    }

    void loadAds();
    return () => {
      aborted = true;
    };
  }, []);

  useEffect(() => {
    setCurrentIndex(0);
  }, [displayAds.length]);

  useEffect(() => {
    if (dismissed || displayAds.length <= 1) return;

    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % displayAds.length);
    }, ROTATION_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [displayAds.length, dismissed]);

  const trackAd = useCallback(async (adId: string, type: 'impression' | 'click') => {
    if (!adId || adId === FALLBACK_AD_ID) return;
    try {
      await fetch(`/api/ads/${encodeURIComponent(adId)}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
    } catch (error) {
      console.warn('[ChatTopBannerAd] 广告统计失败:', error);
    }
  }, []);

  useEffect(() => {
    if (!currentAd || dismissed || currentAd.id === FALLBACK_AD_ID) return;
    if (typeof window === 'undefined') return;

    const storageKey = `${SESSION_IMPRESSION_PREFIX}${currentAd.id}`;
    const alreadyTracked =
      seenInSessionRef.current.has(currentAd.id) ||
      window.sessionStorage.getItem(storageKey) === '1';

    if (alreadyTracked) return;

    seenInSessionRef.current.add(currentAd.id);
    window.sessionStorage.setItem(storageKey, '1');
    void trackAd(currentAd.id, 'impression');
  }, [currentAd, dismissed, trackAd]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
    }
  }, []);

  const handleAdClick = useCallback(async () => {
    if (!currentAd?.linkUrl) return;
    if (currentAd.id !== FALLBACK_AD_ID) {
      await trackAd(currentAd.id, 'click');
    }
    window.open(currentAd.linkUrl, '_blank', 'noopener,noreferrer');
  }, [currentAd, trackAd]);

  if (dismissed || !currentAd) return null;

  const isVideo = currentAd.type === 'video';
  const isZh = language === 'zh';

  return (
    <div className="border-b bg-muted/40 px-3 py-2 sm:px-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="group relative flex min-h-[88px] flex-1 overflow-hidden rounded-lg border bg-black text-left"
          onClick={handleAdClick}
        >
          {isVideo ? (
            <video
              src={currentAd.fileUrl}
              autoPlay
              muted
              loop
              playsInline
              className="h-[88px] w-full object-cover"
            />
          ) : (
            <img
              src={currentAd.fileUrl}
              alt={currentAd.title}
              className="h-[88px] w-full object-cover"
              loading="lazy"
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 left-3 right-10 flex flex-col justify-center text-white">
            <p className="line-clamp-1 text-sm font-semibold">{currentAd.title}</p>
            <p className="line-clamp-1 text-xs text-white/85">
              {isZh ? '点击查看详情' : 'Click to view details'}
            </p>
          </div>
          {!!currentAd.linkUrl && (
            <ExternalLink className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-white/80" />
          )}
        </button>

        <button
          type="button"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={handleDismiss}
          aria-label={isZh ? '关闭广告' : 'Close ad'}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {displayAds.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {displayAds.map((ad, index) => (
            <span
              key={ad.id}
              className={cn(
                'h-1.5 w-1.5 rounded-full bg-muted-foreground/30 transition-all',
                index === currentIndex && 'w-4 bg-primary'
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
