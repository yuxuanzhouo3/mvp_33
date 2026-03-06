import { NextRequest, NextResponse } from 'next/server';
import { getDeploymentRegion } from '@/config';
import { CloudBaseConnector } from '@/lib/cloudbase/connector';
import { getSupabaseAdmin } from '@/lib/integrations/supabase-admin';

type TrackType = 'impression' | 'click';

function isTrackType(value: unknown): value is TrackType {
  return value === 'impression' || value === 'click';
}

function normalizeCounts(raw: any) {
  return {
    impression_count: raw?.impression_count ?? 0,
    click_count: raw?.click_count ?? 0,
  };
}

async function trackSupabaseAd(adId: string, trackType: TrackType) {
  const supabase: any = getSupabaseAdmin();
  const { data: current, error: getError } = await supabase
    .from('advertisements')
    .select('id, impression_count, click_count')
    .eq('id', adId)
    .single();

  if (getError) {
    if (getError.code === 'PGRST116') return null;
    throw new Error(`Supabase 查询广告失败: ${getError.message}`);
  }

  const counts = normalizeCounts(current);
  const nextImpression =
    trackType === 'impression' ? counts.impression_count + 1 : counts.impression_count;
  const nextClick = trackType === 'click' ? counts.click_count + 1 : counts.click_count;

  const { data: updated, error: updateError } = await supabase
    .from('advertisements')
    .update({
      impression_count: nextImpression,
      click_count: nextClick,
      updated_at: new Date().toISOString(),
    })
    .eq('id', adId)
    .select('id, impression_count, click_count')
    .single();

  if (updateError) {
    throw new Error(`Supabase 更新广告统计失败: ${updateError.message}`);
  }

  return {
    id: updated.id,
    impression_count: updated.impression_count ?? nextImpression,
    click_count: updated.click_count ?? nextClick,
  };
}

async function trackCloudBaseAd(adId: string, trackType: TrackType) {
  const connector = new CloudBaseConnector();
  await connector.initialize();
  const db = connector.getClient();

  let currentDoc: any = null;

  try {
    const byDocId = await db.collection('advertisements').doc(adId).get();
    currentDoc = byDocId?.data?.[0] || null;
  } catch (error: any) {
    if (error?.code !== 'DOC_NOT_FOUND') {
      throw error;
    }
  }

  if (!currentDoc) {
    const fallback = await db.collection('advertisements').where({ id: adId }).limit(1).get();
    currentDoc = fallback?.data?.[0] || null;
  }

  if (!currentDoc) return null;

  const counts = normalizeCounts(currentDoc);
  const nextImpression =
    trackType === 'impression' ? counts.impression_count + 1 : counts.impression_count;
  const nextClick = trackType === 'click' ? counts.click_count + 1 : counts.click_count;
  const updateDoc = {
    impression_count: nextImpression,
    click_count: nextClick,
    updated_at: new Date().toISOString(),
  };

  const docId = currentDoc._id || currentDoc.id;
  if (currentDoc._id) {
    await db.collection('advertisements').doc(currentDoc._id).update(updateDoc);
  } else {
    await db.collection('advertisements').where({ id: adId }).update(updateDoc);
  }

  return {
    id: docId,
    impression_count: nextImpression,
    click_count: nextClick,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const adId = resolvedParams.id;
    if (!adId) {
      return NextResponse.json({ success: false, error: '广告 ID 缺失' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    if (!isTrackType(body?.type)) {
      return NextResponse.json(
        { success: false, error: 'type 必须是 impression 或 click' },
        { status: 400 }
      );
    }

    const isDomestic = getDeploymentRegion() === 'CN';
    const result = isDomestic
      ? await trackCloudBaseAd(adId, body.type)
      : await trackSupabaseAd(adId, body.type);

    if (!result) {
      return NextResponse.json({ success: false, error: '广告不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[POST /api/ads/[id]/track] 更新广告统计失败:', error);
    return NextResponse.json(
      { success: false, error: error?.message || '更新统计失败' },
      { status: 500 }
    );
  }
}
