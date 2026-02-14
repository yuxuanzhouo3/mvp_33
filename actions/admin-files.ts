'use server';

import { getDatabaseAdapter } from '@/lib/admin/database';
import type { StorageFile } from '@/lib/admin/types';

export async function listStorageFiles() {
  try {
    console.log('[Actions] 获取存储文件列表');
    const adapter = getDatabaseAdapter();
    const files = await adapter.listStorageFiles();
    return { success: true, data: files };
  } catch (error) {
    console.error('[Actions] 获取文件列表失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '获取失败' };
  }
}

export async function deleteStorageFile(fileName: string, fileId?: string, adId?: string) {
  try {
    console.log('[Actions] 删除存储文件:', fileName);
    const adapter = getDatabaseAdapter();
    await adapter.deleteStorageFile(fileName, fileId, adId);
    return { success: true };
  } catch (error) {
    console.error('[Actions] 删除文件失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '删除失败' };
  }
}

export async function renameStorageFile(oldName: string, newName: string) {
  try {
    console.log('[Actions] 重命名文件:', oldName, '->', newName);
    const adapter = getDatabaseAdapter();
    await adapter.renameStorageFile(oldName, newName);
    return { success: true };
  } catch (error) {
    console.error('[Actions] 重命名文件失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '重命名失败' };
  }
}

export async function downloadStorageFile(fileName: string, fileId?: string) {
  try {
    console.log('[Actions] 下载文件:', fileName);
    const adapter = getDatabaseAdapter();
    const result = await adapter.downloadStorageFile(fileName, fileId);
    return { success: true, data: result };
  } catch (error) {
    console.error('[Actions] 下载文件失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '下载失败' };
  }
}
