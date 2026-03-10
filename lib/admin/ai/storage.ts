import { Buffer } from 'node:buffer'
import { getDatabaseAdapter } from '@/lib/admin/database'
import type { AiAsset, AiAssetType, AiRegion, AiStorageProvider } from '@/lib/admin/types'
import { getSupabaseAdmin } from '@/lib/integrations/supabase-admin'
import { CloudBaseConnector } from '@/lib/cloudbase/connector'
import { resolveAiRegion } from './provider-router'

interface PersistAssetInput {
  region?: AiRegion
  jobId: string
  assetType: AiAssetType
  fileName: string
  mimeType: string
  bytes: Buffer
  metadata?: Record<string, any>
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-')
}

async function uploadToSupabaseStorage(filePath: string, mimeType: string, bytes: Buffer) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.storage
    .from('admin-files')
    .upload(filePath, bytes, {
      upsert: true,
      contentType: mimeType,
    })

  if (error) {
    throw new Error(`Failed to upload AI asset to Supabase: ${error.message}`)
  }

  const publicUrl = supabase.storage.from('admin-files').getPublicUrl(filePath).data.publicUrl
  return {
    storageProvider: 'supabase' as AiStorageProvider,
    storagePath: filePath,
    publicUrl,
  }
}

async function uploadToCloudBaseStorage(filePath: string, bytes: Buffer) {
  const connector = new CloudBaseConnector()
  await connector.initialize()
  const app = connector.getApp()

  const uploadResult = await app.uploadFile({
    cloudPath: filePath,
    fileContent: bytes,
  })

  const fileID = uploadResult.fileID || filePath
  let tempUrl = fileID

  try {
    const temp = await app.getTempFileURL({ fileList: [fileID] })
    tempUrl = temp?.fileList?.[0]?.tempFileURL || fileID
  } catch {
    tempUrl = fileID
  }

  return {
    storageProvider: 'cloudbase' as AiStorageProvider,
    storagePath: fileID,
    publicUrl: tempUrl,
    cloudPath: filePath,
  }
}

export async function persistAiBinaryAsset(input: PersistAssetInput): Promise<AiAsset> {
  const region = resolveAiRegion(input.region)
  const adapter = getDatabaseAdapter()
  const safeFileName = sanitizeFileName(input.fileName)
  const storagePath = `ai-studio/${input.jobId}/${safeFileName}`

  const upload = region === 'CN'
    ? await uploadToCloudBaseStorage(storagePath, input.bytes)
    : await uploadToSupabaseStorage(storagePath, input.mimeType, input.bytes)

  return adapter.createAiAsset({
    job_id: input.jobId,
    asset_type: input.assetType,
    storage_provider: upload.storageProvider,
    storage_path: upload.storagePath,
    public_url: upload.publicUrl,
    mime_type: input.mimeType,
    size: input.bytes.byteLength,
    metadata: {
      ...(input.metadata || {}),
      original_file_name: safeFileName,
      ...(region === 'CN' && 'cloudPath' in upload ? { cloud_path: upload.cloudPath } : {}),
    },
  })
}

export async function persistAiTextAsset(input: Omit<PersistAssetInput, 'bytes'> & { text: string }): Promise<AiAsset> {
  return persistAiBinaryAsset({
    ...input,
    bytes: Buffer.from(input.text, 'utf8'),
  })
}

export async function persistRemoteAiAsset(input: Omit<PersistAssetInput, 'bytes'> & { remoteUrl: string; headers?: Record<string, string> }): Promise<AiAsset> {
  const response = await fetch(input.remoteUrl, {
    headers: input.headers,
  })

  if (!response.ok) {
    throw new Error(`Failed to download remote AI asset: ${response.status} ${response.statusText}`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  const mimeType = response.headers.get('content-type') || input.mimeType

  return persistAiBinaryAsset({
    ...input,
    mimeType,
    bytes,
  })
}

export async function hydrateAiAssetUrls(assets: AiAsset[]): Promise<AiAsset[]> {
  const cloudAssets = assets.filter((asset) => asset.storage_provider === 'cloudbase' && asset.storage_path.startsWith('cloud://'))
  if (cloudAssets.length === 0) {
    return assets
  }

  const connector = new CloudBaseConnector()
  await connector.initialize()
  const app = connector.getApp()
  const temp = await app.getTempFileURL({ fileList: cloudAssets.map((asset) => asset.storage_path) })
  const lookup = new Map<string, string>()

  for (const item of temp?.fileList || []) {
    const key = item.fileID || item.fileId || item.download_url || item.tempFileURL
    if (key && item.tempFileURL) {
      lookup.set(key, item.tempFileURL)
    }
  }

  return assets.map((asset) => {
    const resolved = lookup.get(asset.storage_path)
    if (!resolved) {
      return asset
    }
    return {
      ...asset,
      public_url: resolved,
    }
  })
}
