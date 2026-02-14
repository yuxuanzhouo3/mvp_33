'use server';

import { getDatabaseAdapter } from '@/lib/admin/database';
import type { AppRelease, CreateReleaseData, Platform, Variant } from '@/lib/admin/types';

/**
 * 获取所有发布版本
 */
export async function listReleases() {
  try {
    console.log('[Actions] 获取发布版本列表');
    const adapter = getDatabaseAdapter();
    const releases = await adapter.listReleases();
    return { success: true, data: releases };
  } catch (error) {
    console.error('[Actions] 获取发布版本失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '获取失败' };
  }
}

/**
 * 创建新的发布版本
 */
export async function createRelease(formData: FormData) {
  try {
    console.log('[Actions] 创建发布版本');

    const data: CreateReleaseData = {
      version: formData.get('version') as string,
      platform: formData.get('platform') as Platform,
      variant: (formData.get('variant') as Variant) || undefined,
      file_url: formData.get('file_url') as string,
      file_name: formData.get('file_name') as string,
      file_size: parseInt(formData.get('file_size') as string),
      release_notes: formData.get('release_notes') as string || undefined,
      is_active: formData.get('is_active') === 'true',
      is_mandatory: formData.get('is_mandatory') === 'true',
    };

    const adapter = getDatabaseAdapter();
    const release = await adapter.createRelease(data);
    return { success: true, data: release };
  } catch (error) {
    console.error('[Actions] 创建发布版本失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '创建失败' };
  }
}

/**
 * 更新发布版本
 */
export async function updateRelease(id: string, formData: FormData) {
  try {
    console.log('[Actions] 更新发布版本:', id);

    const data: Partial<CreateReleaseData> = {
      release_notes: formData.get('release_notes') as string || undefined,
      is_active: formData.get('is_active') === 'true',
      is_mandatory: formData.get('is_mandatory') === 'true',
    };

    const adapter = getDatabaseAdapter();
    const release = await adapter.updateRelease(id, data);
    return { success: true, data: release };
  } catch (error) {
    console.error('[Actions] 更新发布版本失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '更新失败' };
  }
}

/**
 * 删除发布版本
 */
export async function deleteRelease(id: string) {
  try {
    console.log('[Actions] 删除发布版本:', id);
    const adapter = getDatabaseAdapter();
    await adapter.deleteRelease(id);
    return { success: true };
  } catch (error) {
    console.error('[Actions] 删除发布版本失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '删除失败' };
  }
}

/**
 * 切换发布版本状态
 */
export async function toggleReleaseStatus(id: string, isActive: boolean) {
  try {
    console.log('[Actions] 切换发布版本状态:', id, isActive);
    const adapter = getDatabaseAdapter();
    const release = await adapter.toggleReleaseStatus(id, isActive);
    return { success: true, data: release };
  } catch (error) {
    console.error('[Actions] 切换状态失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '切换失败' };
  }
}
