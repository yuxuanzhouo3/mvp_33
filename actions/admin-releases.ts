'use server';

import { getDatabaseAdapter } from '@/lib/admin/database';
import type { CreateReleaseData, Platform, Variant } from '@/lib/admin/types';

function readString(formData: FormData, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function readNumber(formData: FormData, ...keys: string[]): number | undefined {
  const raw = readString(formData, ...keys);
  if (raw === undefined) return undefined;
  const num = Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

function readBoolean(formData: FormData, ...keys: string[]): boolean | undefined {
  const raw = readString(formData, ...keys);
  if (raw === undefined) return undefined;
  const normalized = raw.toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'on') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'off') return false;
  return undefined;
}

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

    const version = readString(formData, 'version');
    const platform = readString(formData, 'platform') as Platform | undefined;
    const variantRaw = readString(formData, 'variant');
    const fileUrl = readString(formData, 'file_url', 'fileUrl', 'cloudbaseFileId');
    const fileName = readString(formData, 'file_name', 'fileName');
    const fileSize = readNumber(formData, 'file_size', 'fileSize');
    const releaseNotes = readString(formData, 'release_notes', 'releaseNotes');
    const isActive = readBoolean(formData, 'is_active', 'isActive');
    const isMandatory = readBoolean(formData, 'is_mandatory', 'isMandatory');

    if (!version || !platform || !fileUrl || !fileName || fileSize === undefined) {
      throw new Error('缺少必要的发布版本信息');
    }

    const data: CreateReleaseData = {
      version,
      platform,
      variant: variantRaw ? (variantRaw as Variant) : undefined,
      file_url: fileUrl,
      file_name: fileName,
      file_size: fileSize,
      release_notes: releaseNotes || undefined,
      is_active: isActive === undefined ? true : isActive,
      is_mandatory: isMandatory === undefined ? false : isMandatory,
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

    const data: Partial<CreateReleaseData> = {};
    const releaseNotes = readString(formData, 'release_notes', 'releaseNotes');
    const isActive = readBoolean(formData, 'is_active', 'isActive');
    const isMandatory = readBoolean(formData, 'is_mandatory', 'isMandatory');

    if (releaseNotes !== undefined) data.release_notes = releaseNotes;
    if (isActive !== undefined) data.is_active = isActive;
    if (isMandatory !== undefined) data.is_mandatory = isMandatory;

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
