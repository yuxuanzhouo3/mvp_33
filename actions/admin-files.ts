'use server';

import { getDatabaseAdapter } from '@/lib/admin/database';
import type { StorageFile } from '@/lib/admin/types';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { CloudBaseConnector } from '@/lib/cloudbase/connector';
import { RegionConfig } from '@/lib/config/region';
import { requireAdminSession } from '@/lib/admin/session';

// ============================================================
// 类型定义
// ============================================================

export type { StorageFile };

export interface ReleaseFile extends StorageFile {
  platform?: string;
  version?: string;
  releaseId?: string;
}

export interface SocialLinkFile extends StorageFile {
  linkId?: string;
}

// ============================================================
// 广告文件管理
// ============================================================

export async function listStorageFiles() {
  try {
    console.log('[Actions] 获取存储文件列表');
    const adapter = getDatabaseAdapter();
    const files = await adapter.listStorageFiles();
    return { success: true, files };
  } catch (error) {
    console.error('[Actions] 获取文件列表失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '获取失败' };
  }
}

export async function deleteStorageFile(fileName: string, source: 'supabase' | 'cloudbase', fileId?: string, adId?: string) {
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

export async function renameStorageFile(oldName: string, newName: string, source: 'supabase' | 'cloudbase') {
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

export async function downloadStorageFile(fileName: string, source: 'supabase' | 'cloudbase', fileId?: string) {
  try {
    console.log('[Actions] 下载文件:', fileName);
    const adapter = getDatabaseAdapter();
    const result = await adapter.downloadStorageFile(fileName, fileId);
    return { success: true, data: result.data, contentType: result.contentType, fileName: result.fileName };
  } catch (error) {
    console.error('[Actions] 下载文件失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '下载失败' };
  }
}

// ============================================================
// CloudBase 文件管理
// ============================================================

export async function getCloudBaseFileUrl(fileId: string) {
  try {
    await requireAdminSession();

    if (!fileId || !fileId.startsWith('cloud://')) {
      return { success: false, error: '无效的fileID格式' };
    }

    const connector = new CloudBaseConnector();
    await connector.initialize();
    const app = connector.getApp();

    const result = await app.getTempFileURL({
      fileList: [fileId],
    });

    if (result.fileList && result.fileList.length > 0) {
      const fileInfo = result.fileList[0];
      if (fileInfo.code === 'SUCCESS' && fileInfo.tempFileURL) {
        return {
          success: true,
          data: { url: fileInfo.tempFileURL },
        };
      } else {
        return {
          success: false,
          error: `获取临时URL失败: ${fileInfo.code || '未知错误'}`,
        };
      }
    }

    return { success: false, error: '未返回文件信息' };
  } catch (err) {
    console.error('Get CloudBase file URL error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : '获取文件URL失败',
    };
  }
}

export async function renameCloudBaseFile(
  oldName: string,
  newName: string,
  fileId: string,
  adId: string
) {
  try {
    await requireAdminSession();

    if (!fileId || !fileId.startsWith('cloud://')) {
      return { success: false, error: '无效的 CloudBase fileId' };
    }

    const connector = new CloudBaseConnector();
    await connector.initialize();
    const db = connector.getClient();
    const app = connector.getApp();

    console.log('CloudBase rename: downloading file', fileId);
    const downloadResult = await app.downloadFile({
      fileID: fileId,
    });

    if (!downloadResult.fileContent) {
      console.error('CloudBase download failed: no fileContent');
      return { success: false, error: '下载原文件失败' };
    }

    const newCloudPath = `ads/${newName}`;
    console.log('CloudBase rename: uploading to', newCloudPath);
    const uploadResult = await app.uploadFile({
      cloudPath: newCloudPath,
      fileContent: downloadResult.fileContent,
    });

    if (!uploadResult.fileID) {
      console.error('CloudBase upload failed: no fileID returned');
      return { success: false, error: '上传新文件失败' };
    }

    console.log('CloudBase rename: new fileID', uploadResult.fileID);

    try {
      await db.collection('advertisements').doc(adId).update({
        media_url: uploadResult.fileID,
      });
      console.log('CloudBase rename: database updated');
    } catch (dbErr) {
      console.error('CloudBase rename: database update failed', dbErr);
      try {
        await app.deleteFile({ fileList: [uploadResult.fileID] });
      } catch {}
      return { success: false, error: '更新数据库记录失败' };
    }

    try {
      await app.deleteFile({ fileList: [fileId] });
      console.log('CloudBase rename: old file deleted');
    } catch (deleteErr) {
      console.warn('CloudBase rename: delete old file warning', deleteErr);
    }

    return { success: true };
  } catch (err) {
    console.error('CloudBase rename error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : '重命名文件失败',
    };
  }
}

// ============================================================
// 发布文件管理
// ============================================================

export async function listReleaseFiles() {
  try {
    await requireAdminSession();

    const files: ReleaseFile[] = [];

    if (RegionConfig.region === 'INTL') {
      // 国际版：只获取 Supabase Storage 文件
      if (supabaseAdmin) {
        try {
          const { data: storageFiles, error } = await supabaseAdmin.storage
            .from('releases')
            .list('', { limit: 100 });

          if (!error && storageFiles) {
            const { data: releases } = await supabaseAdmin
              .from('releases')
              .select('id, version, platform, file_url, file_size, created_at');

            const urlToRelease = new Map<string, any>();
            if (releases) {
              for (const release of releases) {
                if (release.file_url) {
                  const urlParts = release.file_url.split('/releases/');
                  if (urlParts.length > 1) {
                    const fileName = decodeURIComponent(urlParts[1].split('?')[0]);
                    urlToRelease.set(fileName, release);
                  }
                }
              }
            }

            for (const file of storageFiles) {
              if (file.name === '.emptyFolderPlaceholder') continue;

              const { data: urlData } = supabaseAdmin.storage
                .from('releases')
                .getPublicUrl(file.name);

              const release = urlToRelease.get(file.name);

              files.push({
                name: file.name,
                url: urlData.publicUrl,
                size: release?.file_size || file.metadata?.size,
                lastModified: release?.created_at || file.updated_at,
                source: 'supabase',
                releaseId: release?.id,
                version: release?.version,
                platform: release?.platform,
              });
            }
          }
        } catch (err) {
          console.warn('List Supabase release files warning:', err);
        }
      }
    } else {
      // 国内版：只获取 CloudBase Storage 文件
      try {
        const connector = new CloudBaseConnector();
        await connector.initialize();
        const db = connector.getClient();
        const app = connector.getApp();

        const { data } = await db.collection('releases').get();

        if (data && Array.isArray(data)) {
          const fileIdList: string[] = [];
          const releaseMap: Map<string, { release: any; fileName: string }> = new Map();

          for (const release of data) {
            if (release.file_url) {
              let fileId: string | null = null;
              let fileName: string;

              if (release.file_url.startsWith('cloud://')) {
                fileId = release.file_url;
                const pathParts = release.file_url.split('/');
                fileName = pathParts[pathParts.length - 1] || release._id;
              } else {
                const urlParts = release.file_url.split('/');
                fileName = urlParts[urlParts.length - 1]?.split('?')[0] || release._id;

                files.push({
                  name: fileName,
                  url: release.file_url,
                  size: release.file_size,
                  lastModified: release.created_at,
                  source: 'cloudbase',
                  fileId: undefined,
                  releaseId: release._id || release.id,
                  version: release.version,
                  platform: release.platform,
                });
                continue;
              }

              if (fileId) {
                fileIdList.push(fileId);
                releaseMap.set(fileId, { release, fileName });
              }
            }
          }

          if (fileIdList.length > 0) {
            try {
              const urlResult = await app.getTempFileURL({
                fileList: fileIdList,
              });

              if (urlResult.fileList && Array.isArray(urlResult.fileList)) {
                for (const fileInfo of urlResult.fileList) {
                  const mapEntry = releaseMap.get(fileInfo.fileID);
                  if (mapEntry) {
                    const { release, fileName } = mapEntry;
                    const isSuccess = fileInfo.code === 'SUCCESS' && fileInfo.tempFileURL;
                    const displayUrl = isSuccess ? fileInfo.tempFileURL : release.file_url;

                    files.push({
                      name: fileName,
                      url: displayUrl,
                      size: release.file_size,
                      lastModified: release.created_at,
                      source: 'cloudbase',
                      fileId: fileInfo.fileID,
                      releaseId: release._id || release.id,
                      version: release.version,
                      platform: release.platform,
                    });

                    releaseMap.delete(fileInfo.fileID);
                  }
                }
              }

              for (const [fileId, { release, fileName }] of releaseMap) {
                files.push({
                  name: fileName,
                  url: release.file_url,
                  size: release.file_size,
                  lastModified: release.created_at,
                  source: 'cloudbase',
                  fileId: fileId,
                  releaseId: release._id || release.id,
                  version: release.version,
                  platform: release.platform,
                });
              }
            } catch (urlErr) {
              console.error('CloudBase getTempFileURL error:', urlErr);
              for (const [fileId, { release, fileName }] of releaseMap) {
                files.push({
                  name: fileName,
                  url: release.file_url,
                  size: release.file_size,
                  lastModified: release.created_at,
                  source: 'cloudbase',
                  fileId: fileId,
                  releaseId: release._id || release.id,
                  version: release.version,
                  platform: release.platform,
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('List CloudBase release files error:', err);
      }
    }

    return {
      success: true,
      files,
    };
  } catch (err) {
    console.error('List release files error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : '获取文件列表失败',
    };
  }
}

export async function deleteReleaseFile(
  fileName: string,
  source: 'supabase' | 'cloudbase',
  fileId?: string,
  releaseId?: string
) {
  try {
    await requireAdminSession();

    if (source === 'supabase') {
      if (!supabaseAdmin) {
        return { success: false, error: 'Supabase 未配置' };
      }

      const { error } = await supabaseAdmin.storage
        .from('releases')
        .remove([fileName]);

      if (error) {
        console.error('Supabase delete file error:', error);
        return { success: false, error: '删除文件失败' };
      }

      if (releaseId) {
        await supabaseAdmin.from('releases').delete().eq('id', releaseId);
      }
    } else if (source === 'cloudbase') {
      try {
        const connector = new CloudBaseConnector();
        await connector.initialize();
        const db = connector.getClient();
        const app = connector.getApp();

        if (releaseId) {
          try {
            await db.collection('releases').doc(releaseId).remove();
          } catch (dbErr) {
            console.warn('CloudBase delete release record warning:', dbErr);
          }
        }

        if (fileId && fileId.startsWith('cloud://')) {
          try {
            await app.deleteFile({ fileList: [fileId] });
          } catch (fileErr) {
            console.warn('CloudBase delete file warning:', fileErr);
          }
        }
      } catch (err) {
        console.error('CloudBase delete error:', err);
        return { success: false, error: '删除 CloudBase 文件失败' };
      }
    }

    return { success: true };
  } catch (err) {
    console.error('Delete release file error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : '删除文件失败',
    };
  }
}

export async function downloadReleaseFile(
  fileName: string,
  source: 'supabase' | 'cloudbase',
  fileId?: string
) {
  try {
    await requireAdminSession();

    if (source === 'supabase') {
      if (!supabaseAdmin) {
        return { success: false, error: 'Supabase 未配置' };
      }

      const { data, error } = await supabaseAdmin.storage
        .from('releases')
        .download(fileName);

      if (error || !data) {
        console.error('Supabase download error:', error);
        return { success: false, error: '下载文件失败' };
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      return {
        success: true,
        data: buffer.toString('base64'),
        contentType: data.type,
        fileName,
      };
    } else if (source === 'cloudbase') {
      if (!fileId || !fileId.startsWith('cloud://')) {
        return { success: false, error: '无效的 CloudBase fileId' };
      }

      const connector = new CloudBaseConnector();
      await connector.initialize();
      const app = connector.getApp();

      const downloadResult = await app.downloadFile({
        fileID: fileId,
      });

      if (!downloadResult.fileContent) {
        console.error('CloudBase download failed: no fileContent');
        return { success: false, error: '下载文件失败' };
      }

      const buffer = Buffer.from(downloadResult.fileContent);

      const ext = fileName.split('.').pop()?.toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext) {
        const mimeTypes: Record<string, string> = {
          apk: 'application/vnd.android.package-archive',
          ipa: 'application/octet-stream',
          exe: 'application/x-msdownload',
          dmg: 'application/x-apple-diskimage',
          deb: 'application/vnd.debian.binary-package',
          rpm: 'application/x-rpm',
          zip: 'application/zip',
          appimage: 'application/x-executable',
        };
        contentType = mimeTypes[ext] || contentType;
      }

      return {
        success: true,
        data: buffer.toString('base64'),
        contentType,
        fileName,
      };
    }

    return { success: false, error: '不支持的数据源' };
  } catch (err) {
    console.error('Download release file error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : '下载文件失败',
    };
  }
}

// ============================================================
// 社交链接文件管理
// ============================================================

export async function listSocialLinkFiles() {
  try {
    await requireAdminSession();

    const files: SocialLinkFile[] = [];

    if (RegionConfig.region === 'INTL') {
      // 国际版：只获取 Supabase Storage 文件
      if (supabaseAdmin) {
        try {
          const { data, error } = await supabaseAdmin.storage
            .from('social-icons')
            .list('', { limit: 100 });

          if (!error && data) {
            for (const file of data) {
              const { data: urlData } = supabaseAdmin.storage
                .from('social-icons')
                .getPublicUrl(file.name);

              files.push({
                name: file.name,
                url: urlData.publicUrl,
                size: file.metadata?.size,
                lastModified: file.updated_at,
                source: 'supabase',
              });
            }
          }
        } catch (err) {
          console.warn('List Supabase social icon files warning:', err);
        }
      }
    } else {
      // 国内版：只获取 CloudBase Storage 文件
      try {
        const connector = new CloudBaseConnector();
        await connector.initialize();
        const db = connector.getClient();
        const app = connector.getApp();

        const { data } = await db.collection('social_links').get();

        if (data && Array.isArray(data)) {
          const fileIdList: string[] = [];
          const linkMap: Map<string, { link: any; fileName: string }> = new Map();

          for (const link of data) {
            if (link.icon_url) {
              let fileId: string | null = null;
              let fileName: string;

              if (link.icon_url.startsWith('cloud://')) {
                fileId = link.icon_url;
                const pathParts = link.icon_url.split('/');
                fileName = pathParts[pathParts.length - 1] || link._id;
              } else {
                const urlParts = link.icon_url.split('/');
                fileName = urlParts[urlParts.length - 1]?.split('?')[0] || link._id;

                files.push({
                  name: fileName,
                  url: link.icon_url,
                  size: link.file_size,
                  lastModified: link.created_at,
                  source: 'cloudbase',
                  fileId: undefined,
                  linkId: link._id || link.id,
                });
                continue;
              }

              if (fileId) {
                fileIdList.push(fileId);
                linkMap.set(fileId, { link, fileName });
              }
            }
          }

          if (fileIdList.length > 0) {
            try {
              const urlResult = await app.getTempFileURL({
                fileList: fileIdList,
              });

              if (urlResult.fileList && Array.isArray(urlResult.fileList)) {
                for (const fileInfo of urlResult.fileList) {
                  const mapEntry = linkMap.get(fileInfo.fileID);
                  if (mapEntry) {
                    const { link, fileName } = mapEntry;
                    const isSuccess = fileInfo.code === 'SUCCESS' && fileInfo.tempFileURL;
                    const displayUrl = isSuccess ? fileInfo.tempFileURL : link.icon_url;

                    files.push({
                      name: fileName,
                      url: displayUrl,
                      size: link.file_size,
                      lastModified: link.created_at,
                      source: 'cloudbase',
                      fileId: fileInfo.fileID,
                      linkId: link._id || link.id,
                    });

                    linkMap.delete(fileInfo.fileID);
                  }
                }
              }

              for (const [fileId, { link, fileName }] of linkMap) {
                files.push({
                  name: fileName,
                  url: link.icon_url,
                  size: link.file_size,
                  lastModified: link.created_at,
                  source: 'cloudbase',
                  fileId: fileId,
                  linkId: link._id || link.id,
                });
              }
            } catch (urlErr) {
              console.error('CloudBase getTempFileURL error:', urlErr);
              for (const [fileId, { link, fileName }] of linkMap) {
                files.push({
                  name: fileName,
                  url: link.icon_url,
                  size: link.file_size,
                  lastModified: link.created_at,
                  source: 'cloudbase',
                  fileId: fileId,
                  linkId: link._id || link.id,
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('List CloudBase social icon files error:', err);
      }
    }

    return {
      success: true,
      files,
    };
  } catch (err) {
    console.error('List social link files error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : '获取文件列表失败',
    };
  }
}

export async function deleteSocialLinkFile(
  fileName: string,
  source: 'supabase' | 'cloudbase',
  fileId?: string,
  linkId?: string
) {
  try {
    await requireAdminSession();

    if (source === 'supabase') {
      if (!supabaseAdmin) {
        return { success: false, error: 'Supabase 未配置' };
      }

      if (linkId) {
        try {
          await supabaseAdmin.from('social_links').delete().eq('id', linkId);
          console.log('Supabase social link record deleted:', linkId);
        } catch (dbErr) {
          console.warn('Supabase delete social link record warning:', dbErr);
        }
      }

      const { error } = await supabaseAdmin.storage
        .from('social-icons')
        .remove([fileName]);

      if (error) {
        console.error('Supabase delete social icon error:', error);
        return { success: false, error: '删除文件失败' };
      }
    } else if (source === 'cloudbase') {
      try {
        const connector = new CloudBaseConnector();
        await connector.initialize();
        const db = connector.getClient();
        const app = connector.getApp();

        if (linkId) {
          try {
            await db.collection('social_links').doc(linkId).remove();
          } catch (dbErr) {
            console.warn('CloudBase delete social link record warning:', dbErr);
          }
        }

        if (fileId && fileId.startsWith('cloud://')) {
          try {
            await app.deleteFile({ fileList: [fileId] });
          } catch (fileErr) {
            console.warn('CloudBase delete file warning:', fileErr);
          }
        }
      } catch (err) {
        console.error('CloudBase delete error:', err);
        return { success: false, error: '删除 CloudBase 文件失败' };
      }
    }

    return { success: true };
  } catch (err) {
    console.error('Delete social link file error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : '删除文件失败',
    };
  }
}
