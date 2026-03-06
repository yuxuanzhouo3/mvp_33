'use server';

import { IS_DOMESTIC_VERSION } from '@/config';
import { getDatabaseAdapter } from '@/lib/admin/database';
import { requireAdminSession } from '@/lib/admin/session';
import { CloudBaseConnector } from '@/lib/cloudbase/connector';
import { getSupabaseAdmin } from '@/lib/integrations/supabase-admin';
import type {
  Advertisement,
  CreateAdData,
  AdStats,
  AdFilters,
  PaginatedResult,
  UpdateAdData,
} from '@/lib/admin/types';

export type { Advertisement } from '@/lib/admin/types';

type UpdateAdInput = FormData | Partial<CreateAdData> & { file?: File | null };
const AD_POSITIONS = new Set([
  'top',
  'bottom',
  'left',
  'right',
  'bottom-left',
  'bottom-right',
  'sidebar',
]);

function isFormData(value: unknown): value is FormData {
  return Boolean(value) && typeof (value as FormData).get === 'function';
}

function normalizeFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '-');
  if (!base) return 'ad-file';
  return base.length > 120 ? base.slice(-120) : base;
}

async function uploadAdFile(file: File): Promise<{ fileUrl: string; fileSize: number }> {
  const fileSize = file.size || 0;
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  const fileName = normalizeFileName(file.name || `${timestamp}.bin`);
  const storagePath = `ads/${timestamp}-${random}-${fileName}`;

  if (IS_DOMESTIC_VERSION) {
    const connector = new CloudBaseConnector();
    await connector.initialize();
    const app = connector.getApp();
    const fileContent = Buffer.from(await file.arrayBuffer());

    const uploadResult = await app.uploadFile({
      cloudPath: storagePath,
      fileContent,
    });

    if (!uploadResult?.fileID) {
      throw new Error('CloudBase 上传广告文件失败');
    }

    return {
      fileUrl: uploadResult.fileID,
      fileSize,
    };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const uploadBuffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from('admin-files')
    .upload(storagePath, uploadBuffer, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) {
    throw new Error(`Supabase 上传广告文件失败: ${uploadError.message}`);
  }

  const { data: urlData } = supabaseAdmin.storage.from('admin-files').getPublicUrl(storagePath);

  return {
    fileUrl: urlData.publicUrl,
    fileSize,
  };
}

function readString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readNumber(formData: FormData, key: string): number | undefined {
  const value = readString(formData, key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readFile(formData: FormData, key = 'file'): File | null {
  const value = formData.get(key);
  if (value instanceof File && value.size > 0) {
    return value;
  }
  return null;
}

export async function listAds(filters: AdFilters = {}) {
  try {
    await requireAdminSession();
    const adapter = getDatabaseAdapter();
    const ads = await adapter.listAds(filters);
    const total = await adapter.countAds(filters);

    const pageSize = filters.limit || 20;
    const page = filters.offset ? Math.floor(filters.offset / pageSize) + 1 : 1;

    const paginatedResult: PaginatedResult<Advertisement> = {
      items: ads,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    return { success: true, data: paginatedResult };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '获取失败' };
  }
}

export async function getAdStats() {
  try {
    await requireAdminSession();
    const adapter = getDatabaseAdapter();
    const stats = await adapter.getAdStats();
    return { success: true, data: stats as AdStats };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '获取失败' };
  }
}

export async function createAd(formData: FormData) {
  try {
    await requireAdminSession();

    const title = readString(formData, 'title');
    const type = readString(formData, 'type') as CreateAdData['type'] | undefined;
    const position = readString(formData, 'position') as CreateAdData['position'] | undefined;
    const linkUrl = readString(formData, 'linkUrl');
    const priority = readNumber(formData, 'priority');
    const status = (readString(formData, 'status') as CreateAdData['status']) || 'active';
    const startDate = readString(formData, 'startDate');
    const endDate = readString(formData, 'endDate');

    if (!title) {
      return { success: false, error: '广告标题不能为空' };
    }
    if (!type || (type !== 'image' && type !== 'video')) {
      return { success: false, error: '广告类型无效' };
    }
    if (!position || !AD_POSITIONS.has(position)) {
      return { success: false, error: '广告位置不能为空' };
    }

    const uploadedFile = readFile(formData, 'file');
    let fileUrl = readString(formData, 'fileUrl');
    let fileSize = readNumber(formData, 'fileSize');

    if (uploadedFile) {
      const uploadResult = await uploadAdFile(uploadedFile);
      fileUrl = uploadResult.fileUrl;
      fileSize = uploadResult.fileSize;
    }

    if (!fileUrl) {
      return { success: false, error: '请上传广告文件' };
    }

    const data: CreateAdData = {
      title,
      type,
      position,
      fileUrl,
      linkUrl,
      priority: priority ?? 0,
      status,
      startDate,
      endDate,
      fileSize,
      impression_count: 0,
      click_count: 0,
    };

    const adapter = getDatabaseAdapter();
    const ad = await adapter.createAd(data);
    return { success: true, data: ad };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '创建失败' };
  }
}

export async function updateAd(adId: string, input: UpdateAdInput) {
  try {
    await requireAdminSession();
    const data: UpdateAdData = {};

    let incomingFile: File | null = null;
    if (isFormData(input)) {
      const title = readString(input, 'title');
      if (title !== undefined) data.title = title;
      const type = readString(input, 'type');
      if (type === 'image' || type === 'video') data.type = type;
      const position = readString(input, 'position');
      if (position && AD_POSITIONS.has(position)) {
        data.position = position as UpdateAdData['position'];
      }
      const linkUrl = readString(input, 'linkUrl');
      if (linkUrl !== undefined) data.linkUrl = linkUrl;
      const priority = readNumber(input, 'priority');
      if (priority !== undefined) data.priority = priority;
      const status = readString(input, 'status');
      if (status === 'active' || status === 'inactive') data.status = status;
      const startDate = readString(input, 'startDate');
      if (startDate !== undefined) data.startDate = startDate;
      const endDate = readString(input, 'endDate');
      if (endDate !== undefined) data.endDate = endDate;
      const fileUrl = readString(input, 'fileUrl');
      if (fileUrl !== undefined) data.fileUrl = fileUrl;
      const fileSize = readNumber(input, 'fileSize');
      if (fileSize !== undefined) data.fileSize = fileSize;
      incomingFile = readFile(input, 'file');
    } else {
      if (input.title !== undefined) data.title = input.title;
      if (input.type !== undefined) data.type = input.type;
      if (input.position !== undefined && AD_POSITIONS.has(input.position)) {
        data.position = input.position;
      }
      if (input.linkUrl !== undefined) data.linkUrl = input.linkUrl;
      if (input.priority !== undefined) data.priority = input.priority;
      if (input.status !== undefined) data.status = input.status;
      if (input.startDate !== undefined) data.startDate = input.startDate;
      if (input.endDate !== undefined) data.endDate = input.endDate;
      if (input.fileUrl !== undefined) data.fileUrl = input.fileUrl;
      if (input.fileSize !== undefined) data.fileSize = input.fileSize;
      incomingFile = input.file || null;
    }

    if (incomingFile) {
      const uploadResult = await uploadAdFile(incomingFile);
      data.fileUrl = uploadResult.fileUrl;
      data.fileSize = uploadResult.fileSize;
    }

    const adapter = getDatabaseAdapter();
    const ad = await adapter.updateAd(adId, data);
    return { success: true, data: ad };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '更新失败' };
  }
}

export async function deleteAd(adId: string) {
  try {
    await requireAdminSession();
    const adapter = getDatabaseAdapter();
    await adapter.deleteAd(adId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '删除失败' };
  }
}

export async function toggleAdStatus(adId: string) {
  try {
    await requireAdminSession();
    const adapter = getDatabaseAdapter();
    const ad = await adapter.toggleAdStatus(adId);
    return { success: true, data: ad };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '切换失败' };
  }
}
