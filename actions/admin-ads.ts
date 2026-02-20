'use server';

import { getDatabaseAdapter } from '@/lib/admin/database';
import type { Advertisement, CreateAdData, AdStats, AdFilters, PaginatedResult } from '@/lib/admin/types';

export async function listAds(filters: AdFilters = {}) {
  try {
    console.log('[Actions] 获取广告列表:', filters);
    const adapter = getDatabaseAdapter();
    const ads = await adapter.listAds(filters);
    const total = await adapter.countAds(filters);

    const pageSize = filters.limit || 20;
    const page = filters.offset ? Math.floor(filters.offset / pageSize) + 1 : 1;

    const paginatedResult: PaginatedResult<Advertisement> = {
      items: ads,
      total: total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    return { success: true, data: paginatedResult };
  } catch (error) {
    console.error('[Actions] 获取广告列表失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '获取失败' };
  }
}

export async function getAdStats() {
  try {
    console.log('[Actions] 获取广告统计');
    const adapter = getDatabaseAdapter();
    const stats = await adapter.getAdStats();
    return { success: true, data: stats };
  } catch (error) {
    console.error('[Actions] 获取广告统计失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '获取失败' };
  }
}

export async function createAd(formData: FormData) {
  try {
    console.log('[Actions] 创建广告');

    const data: CreateAdData = {
      title: formData.get('title') as string,
      type: formData.get('type') as 'image' | 'video',
      position: formData.get('position') as string,
      fileUrl: formData.get('fileUrl') as string,
      linkUrl: formData.get('linkUrl') as string || undefined,
      priority: parseInt(formData.get('priority') as string) || 0,
      status: (formData.get('status') as 'active' | 'inactive') || 'active',
      fileSize: parseInt(formData.get('fileSize') as string) || undefined,
    };

    const adapter = getDatabaseAdapter();
    const ad = await adapter.createAd(data);
    return { success: true, data: ad };
  } catch (error) {
    console.error('[Actions] 创建广告失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '创建失败' };
  }
}

export async function updateAd(adId: string, formData: FormData) {
  try {
    console.log('[Actions] 更新广告:', adId);

    const data: Partial<CreateAdData> = {};

    const title = formData.get('title');
    if (title) data.title = title as string;

    const type = formData.get('type');
    if (type) data.type = type as 'image' | 'video';

    const position = formData.get('position');
    if (position) data.position = position as string;

    const fileUrl = formData.get('fileUrl');
    if (fileUrl) data.fileUrl = fileUrl as string;

    const linkUrl = formData.get('linkUrl');
    if (linkUrl) data.linkUrl = linkUrl as string;

    const priority = formData.get('priority');
    if (priority) data.priority = parseInt(priority as string);

    const status = formData.get('status');
    if (status) data.status = status as 'active' | 'inactive';

    const adapter = getDatabaseAdapter();
    const ad = await adapter.updateAd(adId, data);
    return { success: true, data: ad };
  } catch (error) {
    console.error('[Actions] 更新广告失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '更新失败' };
  }
}

export async function deleteAd(adId: string) {
  try {
    console.log('[Actions] 删除广告:', adId);
    const adapter = getDatabaseAdapter();
    await adapter.deleteAd(adId);
    return { success: true };
  } catch (error) {
    console.error('[Actions] 删除广告失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '删除失败' };
  }
}

export async function toggleAdStatus(adId: string) {
  try {
    console.log('[Actions] 切换广告状态:', adId);
    const adapter = getDatabaseAdapter();
    const ad = await adapter.toggleAdStatus(adId);
    return { success: true, data: ad };
  } catch (error) {
    console.error('[Actions] 切换广告状态失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '切换失败' };
  }
}
