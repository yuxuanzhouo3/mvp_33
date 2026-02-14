'use server';

import { getDatabaseAdapter } from '@/lib/admin/database';
import type { SocialLink, CreateSocialLinkData, UpdateSocialLinkData } from '@/lib/admin/types';

export async function listSocialLinks() {
  try {
    console.log('[Actions] 获取社交链接列表');
    const adapter = getDatabaseAdapter();
    const links = await adapter.listSocialLinks();
    return { success: true, data: links };
  } catch (error) {
    console.error('[Actions] 获取社交链接失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '获取失败' };
  }
}

export async function createSocialLink(data: CreateSocialLinkData) {
  try {
    console.log('[Actions] 创建社交链接:', data);
    const adapter = getDatabaseAdapter();
    const link = await adapter.createSocialLink(data);
    return { success: true, data: link };
  } catch (error) {
    console.error('[Actions] 创建社交链接失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '创建失败' };
  }
}

export async function updateSocialLink(id: string, data: UpdateSocialLinkData) {
  try {
    console.log('[Actions] 更新社交链接:', id, data);
    const adapter = getDatabaseAdapter();
    const link = await adapter.updateSocialLink(id, data);
    return { success: true, data: link };
  } catch (error) {
    console.error('[Actions] 更新社交链接失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '更新失败' };
  }
}

export async function deleteSocialLink(id: string) {
  try {
    console.log('[Actions] 删除社交链接:', id);
    const adapter = getDatabaseAdapter();
    await adapter.deleteSocialLink(id);
    return { success: true };
  } catch (error) {
    console.error('[Actions] 删除社交链接失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '删除失败' };
  }
}

export async function updateSocialLinksOrder(updates: Array<{ id: string; order: number }>) {
  try {
    console.log('[Actions] 批量更新排序:', updates);
    const adapter = getDatabaseAdapter();
    await adapter.updateSocialLinksOrder(updates);
    return { success: true };
  } catch (error) {
    console.error('[Actions] 批量更新排序失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '批量更新失败' };
  }
}
