import { NextRequest, NextResponse } from 'next/server';
import { getDeploymentRegion } from '@/config';
import { CloudBaseConnector } from '@/lib/cloudbase/connector';
import { getSupabaseAdmin } from '@/lib/integrations/supabase-admin';

type AdPosition =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom-right'
  | 'sidebar';

type PublicAd = {
  id: string;
  title: string;
  type: 'image' | 'video';
  fileUrl: string;
  linkUrl?: string;
  priority: number;
  startDate?: string;
  endDate?: string;
  impression_count: number;
  click_count: number;
  created_at?: string;
  updated_at?: string;
  status?: string;
};

const VALID_POSITIONS = new Set<AdPosition>([
  'top',
  'bottom',
  'left',
  'right',
  'bottom-left',
  'bottom-right',
  'sidebar',
]);

function parseLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(Math.floor(parsed), 50);
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inDateRange(ad: PublicAd, now: Date): boolean {
  const startDate = parseDate(ad.startDate);
  const endDate = parseDate(ad.endDate);
  if (startDate && now < startDate) return false;
  if (endDate && now > endDate) return false;
  return true;
}

function normalizeAd(raw: any): PublicAd | null {
  const fileUrl = raw.fileUrl || raw.file_url || raw.image_url;
  if (!fileUrl) return null;

  const createdAt = raw.created_at || raw.createdAt;
  const updatedAt = raw.updated_at || raw.updatedAt || createdAt;

  return {
    id: raw._id || raw.id,
    title: raw.title || '',
    type: raw.type === 'video' ? 'video' : 'image',
    fileUrl,
    linkUrl: raw.linkUrl || raw.link_url || raw.redirect_url,
    priority: raw.priority ?? 0,
    startDate: raw.startDate || raw.start_date,
    endDate: raw.endDate || raw.end_date,
    impression_count: raw.impression_count ?? 0,
    click_count: raw.click_count ?? 0,
    created_at: createdAt,
    updated_at: updatedAt,
    status: raw.status,
  };
}

async function listSupabaseAds(position: AdPosition, fetchLimit: number): Promise<PublicAd[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('advertisements')
    .select('*')
    .eq('status', 'active')
    .eq('position', position)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(fetchLimit);

  if (error) {
    throw new Error(`Supabase 获取广告失败: ${error.message}`);
  }

  return (data || [])
    .map(normalizeAd)
    .filter((ad): ad is PublicAd => !!ad);
}

async function listCloudBaseAds(position: AdPosition, fetchLimit: number): Promise<PublicAd[]> {
  const connector = new CloudBaseConnector();
  await connector.initialize();
  const db = connector.getClient();
  const app = connector.getApp();

  const result = await db
    .collection('advertisements')
    .where({ status: 'active', position })
    .orderBy('priority', 'desc')
    .orderBy('created_at', 'desc')
    .limit(fetchLimit)
    .get();

  const ads: PublicAd[] = (result?.data || [])
    .map((raw: any) => normalizeAd(raw))
    .filter((ad: PublicAd | null): ad is PublicAd => !!ad);

  const cloudFileIds = ads
    .map((ad: PublicAd) => ad.fileUrl)
    .filter((url: string) => typeof url === 'string' && url.startsWith('cloud://'));

  if (cloudFileIds.length === 0) return ads;

  try {
    const tempResult = await app.getTempFileURL({ fileList: cloudFileIds });
    const mapping = new Map<string, string>();
    const tempList = Array.isArray(tempResult?.fileList) ? tempResult.fileList : [];

    for (const file of tempList) {
      if (file?.code === 'SUCCESS' && file?.fileID && file?.tempFileURL) {
        mapping.set(file.fileID, file.tempFileURL);
      }
    }

    return ads.map((ad: PublicAd) => ({
      ...ad,
      fileUrl: mapping.get(ad.fileUrl) || ad.fileUrl,
    }));
  } catch (error) {
    console.warn('[GET /api/ads/active] CloudBase 临时链接转换失败:', error);
    return ads;
  }
}

export async function GET(request: NextRequest) {
  try {
    const positionRaw = request.nextUrl.searchParams.get('position') || 'top';
    const position = VALID_POSITIONS.has(positionRaw as AdPosition)
      ? (positionRaw as AdPosition)
      : 'top';
    const limit = parseLimit(request.nextUrl.searchParams.get('limit'));
    const fetchLimit = Math.min(Math.max(limit * 5, 20), 200);

    const isDomestic = getDeploymentRegion() === 'CN';
    const ads = isDomestic
      ? await listCloudBaseAds(position, fetchLimit)
      : await listSupabaseAds(position, fetchLimit);

    const now = new Date();
    const data = ads
      .filter((ad) => ad.status === 'active')
      .filter((ad) => inDateRange(ad, now))
      .sort((a, b) => {
        const priorityDiff = (b.priority || 0) - (a.priority || 0);
        if (priorityDiff !== 0) return priorityDiff;
        const bTime = Date.parse(b.created_at || '') || 0;
        const aTime = Date.parse(a.created_at || '') || 0;
        return bTime - aTime;
      })
      .slice(0, limit)
      .map((ad) => ({
        id: ad.id,
        title: ad.title,
        type: ad.type,
        fileUrl: ad.fileUrl,
        linkUrl: ad.linkUrl,
        priority: ad.priority || 0,
        startDate: ad.startDate,
        endDate: ad.endDate,
        impression_count: ad.impression_count || 0,
        click_count: ad.click_count || 0,
        created_at: ad.created_at,
        updated_at: ad.updated_at,
      }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[GET /api/ads/active] 获取活跃广告失败:', error);
    return NextResponse.json(
      { success: false, error: error?.message || '获取广告失败' },
      { status: 500 }
    );
  }
}
