import { NextRequest, NextResponse } from 'next/server'
import { getCloudBaseApp } from '@/lib/cloudbase/client'

// 使用 Node.js runtime，方便调用 CloudBase Node SDK 和服务端转发文件流
export const runtime = 'nodejs'

/**
 * CloudBase 文件下载中转：
 * 1. 如果提供 fileId（cloud:// 开头），先使用 getTempFileURL 拿到临时链接。
 * 2. 如果提供 url（https://...）则直接使用这个 URL。
 * 3. 服务端 fetch 文件并流式返回，绕过浏览器直接访问被 403/418 拦截的问题。
 *
 * 支持：
 * - GET /api/files/cn-download?fileId=cloud%3A%2F%2F...
 * - GET /api/files/cn-download?url=https%3A%2F%2F...
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawFileId = searchParams.get('fileId')
    const rawUrl = searchParams.get('url')
    // 检查是否是预览请求（默认是预览，除非明确指定 download=true）
    const isDownload = searchParams.get('download') === 'true'

    if (rawFileId) {
      // ✅ 首选：使用 CloudBase SDK 直接通过 fileID 下载文件，避免走临时 HTTP 链接的 418/403 拦截
      const decodedFileId = decodeURIComponent(rawFileId)

      const app1 = getCloudBaseApp()
      if (!app1) {
        return NextResponse.json(
          { error: 'CloudBase is not configured. Please check CLOUDBASE_* environment variables.' },
          { status: 500 }
        )
      }

      // ✅ 使用 CloudBase SDK 的 downloadFile 直接下载文件内容（永久访问，不依赖临时 URL）
      // 确保 fileId 是 cloud:// 格式（在 try 块外定义，以便在 catch 中使用）
      let finalFileId = decodedFileId
      if (!finalFileId.startsWith('cloud://')) {
        const envId = process.env.CLOUDBASE_ENV_ID
        if (envId) {
          // 如果不是 cloud:// 格式，尝试构造
          finalFileId = `cloud://${envId}/${decodedFileId}`
          console.log('[CLOUDBASE CN DOWNLOAD] fileId is not cloud:// format, constructing:', {
            original: decodedFileId,
            constructed: finalFileId,
          })
        } else {
          console.error('[CLOUDBASE CN DOWNLOAD] fileId is not cloud:// format and CLOUDBASE_ENV_ID is not set:', decodedFileId)
          return NextResponse.json(
            { error: 'Invalid fileId format. Expected cloud:// format or CLOUDBASE_ENV_ID must be set.' },
            { status: 400 }
          )
        }
      }

      try {

        console.log('[CLOUDBASE CN DOWNLOAD] Attempting to download file via SDK downloadFile:', {
          originalFileID: decodedFileId,
          finalFileID: finalFileId,
          envId: process.env.CLOUDBASE_ENV_ID,
        })

        // 尝试多种 fileID 格式
        let result = null
        let lastError = null
        
        // 尝试 1: 使用完整的 cloud:// 格式
        try {
          result = await (app1 as any).downloadFile({
            fileID: finalFileId,
          })
          console.log('[CLOUDBASE CN DOWNLOAD] downloadFile succeeded with cloud:// format')
        } catch (err1: any) {
          lastError = err1
          console.warn('[CLOUDBASE CN DOWNLOAD] downloadFile failed with cloud:// format, trying alternative formats:', {
            error: err1?.message,
            code: err1?.code || err1?.errCode,
          })
          
          // 尝试 2: 如果 finalFileId 是 cloud://envId/path，尝试只用 path
          if (finalFileId.startsWith('cloud://')) {
            const pathOnly = finalFileId.replace(/^cloud:\/\/[^/]+\//, '')
            try {
              console.log('[CLOUDBASE CN DOWNLOAD] Trying downloadFile with path only:', pathOnly)
              result = await (app1 as any).downloadFile({
                fileID: pathOnly,
              })
              console.log('[CLOUDBASE CN DOWNLOAD] downloadFile succeeded with path only format')
            } catch (err2: any) {
              console.warn('[CLOUDBASE CN DOWNLOAD] downloadFile failed with path only format:', {
                error: err2?.message,
                code: err2?.code || err2?.errCode,
              })
              lastError = err2
              
              // 尝试 3: 尝试使用 cloudPath 格式（不带 cloud:// 前缀）
              try {
                const cloudPath = finalFileId.includes('/') ? finalFileId.split('cloud://')[1]?.split('/').slice(1).join('/') : finalFileId
                if (cloudPath && cloudPath !== finalFileId) {
                  console.log('[CLOUDBASE CN DOWNLOAD] Trying downloadFile with cloudPath:', cloudPath)
                  result = await (app1 as any).downloadFile({
                    fileID: cloudPath,
                  })
                  console.log('[CLOUDBASE CN DOWNLOAD] downloadFile succeeded with cloudPath format')
                }
              } catch (err3: any) {
                console.error('[CLOUDBASE CN DOWNLOAD] All downloadFile attempts failed:', {
                  cloudFormat: err1?.message,
                  pathOnly: err2?.message,
                  cloudPath: err3?.message,
                })
                lastError = err3
              }
            }
          }
        }
        
        // 如果所有尝试都失败，返回错误
        if (!result && lastError) {
          throw lastError
        }

        console.log('[CLOUDBASE CN DOWNLOAD] downloadFile result type:', {
          resultType: typeof result,
          hasFileContent: !!(result && result.fileContent),
          hasData: !!(result && result.data),
          hasBuffer: !!(result && result.buffer),
          isBuffer: Buffer.isBuffer(result),
          keys: result ? Object.keys(result) : null,
        });

        // 尝试多种方式获取文件内容
        let fileContent: any = null
        
        if (Buffer.isBuffer(result)) {
          // 如果直接返回 Buffer
          fileContent = result
        } else if (result && result.fileContent) {
          fileContent = result.fileContent
        } else if (result && result.data) {
          fileContent = result.data
        } else if (result && result.buffer) {
          fileContent = result.buffer
        } else if (result && typeof result === 'object') {
          // 如果 result 是对象，尝试转换为 Buffer
          try {
            fileContent = Buffer.from(result as any)
          } catch (e) {
            // 如果转换失败，尝试直接使用 result
            fileContent = result
          }
        } else {
          fileContent = result
        }

        // 确保 fileContent 是 Buffer 或可以转换为 Buffer
        if (!fileContent) {
          console.error('[CLOUDBASE CN DOWNLOAD] downloadFile returned empty content:', {
            result,
            resultType: typeof result,
          })
          return NextResponse.json(
            { error: 'Empty file content from CloudBase downloadFile', details: 'The file may not exist or access is denied.' },
            { status: 404 }
          )
        }

        // 如果不是 Buffer，尝试转换
        if (!Buffer.isBuffer(fileContent)) {
          try {
            if (typeof fileContent === 'string') {
              fileContent = Buffer.from(fileContent, 'base64')
            } else if (fileContent instanceof ArrayBuffer) {
              fileContent = Buffer.from(fileContent)
            } else if (fileContent instanceof Uint8Array) {
              fileContent = Buffer.from(fileContent)
            } else {
              fileContent = Buffer.from(JSON.stringify(fileContent))
            }
          } catch (convertErr) {
            console.error('[CLOUDBASE CN DOWNLOAD] Failed to convert fileContent to Buffer:', convertErr)
            return NextResponse.json(
              { error: 'Failed to process file content', details: 'Unable to convert file content to buffer.' },
              { status: 500 }
            )
          }
        }

        // 尝试从 fileId 中解析文件名：cloud://env/messages/convId/filename.ext
        let filename = 'file'
        const pathMatch = decodedFileId.split('/')
        if (pathMatch.length > 0) {
          filename = pathMatch[pathMatch.length - 1] || filename
        }

        // 尝试从文件名推断 MIME 类型
        let contentType = 'application/octet-stream'
        if (filename.includes('.')) {
          const ext = filename.split('.').pop()?.toLowerCase()
          const mimeTypes: Record<string, string> = {
            'pdf': 'application/pdf',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'mp4': 'video/mp4',
            'mp3': 'audio/mpeg',
            'txt': 'text/plain',
            'json': 'application/json',
          }
          if (ext && mimeTypes[ext]) {
            contentType = mimeTypes[ext]
          }
        }

        const headers: HeadersInit = {
          'Content-Type': contentType,
          'Content-Disposition': `${isDownload ? 'attachment' : 'inline'}; filename="${encodeURIComponent(filename)}"`,
          'Content-Length': fileContent.length.toString(),
        }

        console.log('[CLOUDBASE CN DOWNLOAD] Successfully downloaded file via SDK:', {
          fileID: decodedFileId,
          filename,
          contentType,
          size: fileContent.length,
        });

        return new NextResponse(fileContent, {
          status: 200,
          headers,
        })
      } catch (sdkErr: any) {
        console.error('[CLOUDBASE CN DOWNLOAD] downloadFile failed after all attempts:', {
          message: sdkErr?.message,
          code: sdkErr?.code || sdkErr?.errCode,
          stack: sdkErr?.stack,
          originalFileID: decodedFileId,
          finalFileID: finalFileId,
          envId: process.env.CLOUDBASE_ENV_ID,
          errorDetails: {
            name: sdkErr?.name,
            errCode: sdkErr?.errCode,
            errMsg: sdkErr?.errMsg,
            requestId: sdkErr?.requestId,
          },
        })
        
        // 不再 fallback 到临时 URL，直接返回错误
        return NextResponse.json(
          { 
            error: 'Failed to download file from CloudBase',
            details: sdkErr?.message || String(sdkErr),
            code: sdkErr?.code || sdkErr?.errCode,
            hint: sdkErr?.code === 'STORAGE_FILE_NONEXIST' 
              ? `File not found. Please check: 1) CLOUDBASE_ENV_ID is correct (current: ${process.env.CLOUDBASE_ENV_ID || 'NOT SET'}), 2) fileId format is correct (used: ${finalFileId}), 3) the file exists in CloudBase storage.`
              : 'Please check if the file exists and you have permission to access it.',
            debug: {
              originalFileId: decodedFileId,
              finalFileId: finalFileId,
              envId: process.env.CLOUDBASE_ENV_ID || 'NOT SET',
            },
          },
          { status: 404 }
        )
      }

    } else if (rawUrl) {
      // 兼容旧数据：已经由 CloudBase 生成的 HTTP 下载链接
      const downloadUrl = decodeURIComponent(rawUrl)

      // 判断 URL 格式：
      // 1. 新数据：https://636c-cloud1-...-xxx.tcb.qcloud.la/...?sign=...&t=... （带签名的临时链接，可以直接用）
      // 2. 旧数据：https://cloud1-...tcb.qcloud.la/... （我们自己拼的，会被 418，需要重新生成）
      const isNewFormat = downloadUrl.includes('636c-') || downloadUrl.includes('sign=')
      const isOldFormat = downloadUrl.match(/https?:\/\/cloud\d+-[^/]+\.tcb\.qcloud\.la\//) && !downloadUrl.includes('sign=')

      if (isNewFormat) {
        // ✅ 新格式：CloudBase 官方生成的临时链接（带 sign=）
        // 尝试从 URL 提取 fileId，使用 SDK downloadFile（更可靠，避免 418/403）
        // 如果提取失败，再 fallback 到直接 fetch
        console.log('[CLOUDBASE CN DOWNLOAD] Processing new format tempFileURL:', {
          originalUrl: downloadUrl,
        })

        try {
          // 首先尝试从 URL 提取 fileId 并使用 SDK
          // 关键：CloudBase SDK 返回的 fileID 格式是 cloud://baseEnvId.fullDomain/path
          // 例如：cloud://cloud1-3giwb8x723267ff3.636c-cloud1-3giwb8x723267ff3-1385299329/path
          // 我们需要从 URL 域名中提取完整的环境 ID
          const urlMatch = downloadUrl.match(/https?:\/\/([^/]+)\.tcb\.qcloud\.la\/(.+?)(?:\?|$)/)
          if (urlMatch && urlMatch.length >= 3) {
            const urlDomain = urlMatch[1] // 例如：636c-cloud1-3giwb8x723267ff3-1385299329
            const filePath = urlMatch[2]
            
            // 从域名中提取完整的环境 ID
            // URL 域名格式：636c-cloud1-3giwb8x723267ff3-1385299329
            // SDK 返回的 fileID 格式：cloud://cloud1-3giwb8x723267ff3.636c-cloud1-3giwb8x723267ff3-1385299329/path
            // 策略：使用 CLOUDBASE_ENV_ID（基础环境 ID）拼接 URL 域名（完整域名）
            const envId = process.env.CLOUDBASE_ENV_ID
            if (!envId) {
              console.error('[CLOUDBASE CN DOWNLOAD] CLOUDBASE_ENV_ID not set')
              return NextResponse.json(
                { error: 'CLOUDBASE_ENV_ID environment variable is required to process CloudBase URLs.' },
                { status: 500 }
              )
            }
            
            // 构造完整的环境 ID：baseEnvId.fullDomain
            // 例如：cloud1-3giwb8x723267ff3.636c-cloud1-3giwb8x723267ff3-1385299329
            const fullEnvId = `${envId}.${urlDomain}`
            let fileId = `cloud://${fullEnvId}/${filePath}`

            console.log('[CLOUDBASE CN DOWNLOAD] Extracted fileId from new format URL, using SDK:', {
              fileId,
              filePath,
              originalUrl: downloadUrl,
              envId,
              fullEnvId,
              urlDomain,
              urlMatch: urlMatch[0],
            });

            const app2 = getCloudBaseApp()
            if (app2) {
                try {
                  // 尝试多种 fileID 格式
                  let result = null
                  let lastError = null
                  
                  // 尝试 1: 使用完整的 cloud:// 格式
                  try {
                    console.log('[CLOUDBASE CN DOWNLOAD] Attempt 1: Calling downloadFile with cloud:// format:', fileId);
                    result = await (app2 as any).downloadFile({ fileID: fileId });
                    console.log('[CLOUDBASE CN DOWNLOAD] downloadFile succeeded with cloud:// format')
                  } catch (err1: any) {
                    lastError = err1
                    console.warn('[CLOUDBASE CN DOWNLOAD] Attempt 1 failed, trying alternative formats:', {
                      error: err1?.message,
                      code: err1?.code || err1?.errCode,
                    })
                    
                    // 尝试 2: 只用路径部分（不带 cloud:// 前缀）
                    try {
                      console.log('[CLOUDBASE CN DOWNLOAD] Attempt 2: Calling downloadFile with path only:', filePath);
                      result = await (app2 as any).downloadFile({ fileID: filePath });
                      console.log('[CLOUDBASE CN DOWNLOAD] downloadFile succeeded with path only format')
                    } catch (err2: any) {
                      console.warn('[CLOUDBASE CN DOWNLOAD] Attempt 2 failed:', {
                        error: err2?.message,
                        code: err2?.code || err2?.errCode,
                      })
                      lastError = err2
                      
                      // 尝试 3: 尝试从 URL 域名中提取环境 ID
                      try {
                        const urlEnvMatch = downloadUrl.match(/https?:\/\/([^/]+)\.tcb\.qcloud\.la\//)
                        if (urlEnvMatch && urlEnvMatch[1]) {
                          const urlEnvId = urlEnvMatch[1].replace(/^636c-/, '').split('-')[0] // 尝试提取环境 ID
                          const altFileId = `cloud://${urlEnvId}/${filePath}`
                          console.log('[CLOUDBASE CN DOWNLOAD] Attempt 3: Trying with extracted envId from URL:', {
                            urlEnvId,
                            altFileId,
                          })
                          result = await (app2 as any).downloadFile({ fileID: altFileId });
                          console.log('[CLOUDBASE CN DOWNLOAD] downloadFile succeeded with extracted envId')
                        }
                      } catch (err3: any) {
                        console.error('[CLOUDBASE CN DOWNLOAD] All downloadFile attempts failed:', {
                          cloudFormat: err1?.message,
                          pathOnly: err2?.message,
                          extractedEnvId: err3?.message,
                        })
                        lastError = err3
                      }
                    }
                  }
                  
                  // 如果所有尝试都失败，抛出最后一个错误
                  if (!result && lastError) {
                    throw lastError
                  }
                  
                  console.log('[CLOUDBASE CN DOWNLOAD] downloadFile result received:', {
                    resultType: typeof result,
                    isBuffer: Buffer.isBuffer(result),
                    hasFileContent: !!(result && result.fileContent),
                    hasData: !!(result && result.data),
                  });

                  // 处理文件内容
                  let fileContent: any = null
                  if (Buffer.isBuffer(result)) {
                    fileContent = result
                  } else if (result && result.fileContent) {
                    fileContent = result.fileContent
                  } else if (result && result.data) {
                    fileContent = result.data
                  } else if (result && result.buffer) {
                    fileContent = result.buffer
                  } else {
                    fileContent = result
                  }

                  if (!fileContent) {
                    console.error('[CLOUDBASE CN DOWNLOAD] downloadFile returned empty content for new format URL:', {
                      fileId,
                      originalUrl: downloadUrl,
                      result,
                    })
                    return NextResponse.json(
                      { error: 'Empty file content from CloudBase downloadFile', details: 'The file may not exist or access is denied.' },
                      { status: 404 }
                    )
                  }

                  // 转换为 Buffer
                  if (!Buffer.isBuffer(fileContent)) {
                    try {
                      if (typeof fileContent === 'string') {
                        fileContent = Buffer.from(fileContent, 'base64')
                      } else if (fileContent instanceof ArrayBuffer) {
                        fileContent = Buffer.from(fileContent)
                      } else if (fileContent instanceof Uint8Array) {
                        fileContent = Buffer.from(fileContent)
                      } else {
                        fileContent = Buffer.from(JSON.stringify(fileContent))
                      }
                    } catch (convertErr) {
                      console.error('[CLOUDBASE CN DOWNLOAD] Failed to convert fileContent to Buffer:', convertErr)
                      return NextResponse.json(
                        { error: 'Failed to process file content', details: 'Unable to convert file content to buffer.' },
                        { status: 500 }
                      )
                    }
                  }

                  // 提取文件名
                  let filename = 'file'
                  const pathParts = filePath.split('/')
                  if (pathParts.length > 0) {
                    filename = pathParts[pathParts.length - 1] || filename
                  }

                  // 推断 MIME 类型
                  let contentType = 'application/octet-stream'
                  if (filename.includes('.')) {
                    const ext = filename.split('.').pop()?.toLowerCase()
                    const mimeTypes: Record<string, string> = {
                      'pdf': 'application/pdf',
                      'jpg': 'image/jpeg',
                      'jpeg': 'image/jpeg',
                      'png': 'image/png',
                      'gif': 'image/gif',
                      'webp': 'image/webp',
                      'mp4': 'video/mp4',
                      'mp3': 'audio/mpeg',
                      'txt': 'text/plain',
                      'json': 'application/json',
                    }
                    if (ext && mimeTypes[ext]) {
                      contentType = mimeTypes[ext]
                    }
                  }

                  const headers: HeadersInit = {
                    'Content-Type': contentType,
                    'Content-Disposition': `${isDownload ? 'attachment' : 'inline'}; filename="${encodeURIComponent(filename)}"`,
                    'Content-Length': fileContent.length.toString(),
                  }

                  console.log('[CLOUDBASE CN DOWNLOAD] Successfully downloaded via SDK from new format URL:', {
                    fileId,
                    filename,
                    contentType,
                    size: fileContent.length,
                  });

                  return new NextResponse(fileContent, {
                    status: 200,
                    headers,
                  })
                } catch (sdkErr: any) {
                  console.error('[CLOUDBASE CN DOWNLOAD] SDK downloadFile failed for new format URL:', {
                    error: sdkErr?.message,
                    code: sdkErr?.code || sdkErr?.errCode,
                    stack: sdkErr?.stack,
                    fileId,
                    originalUrl: downloadUrl,
                  });
                  // 不再 fallback 到临时 URL，直接返回错误
                  return NextResponse.json(
                    {
                      error: 'Failed to download file from CloudBase',
                      details: sdkErr?.message || String(sdkErr),
                      code: sdkErr?.code || sdkErr?.errCode,
                      hint: sdkErr?.code === 'STORAGE_FILE_NONEXIST'
                        ? 'File not found. Please check if CLOUDBASE_ENV_ID is correct, or the file may have been deleted.'
                        : 'Please check if the file exists and you have permission to access it.',
                    },
                    { status: 404 }
                  )
                }
              } else {
                console.error('[CLOUDBASE CN DOWNLOAD] CloudBase app not available')
                return NextResponse.json(
                  { error: 'CloudBase is not configured. Please check CLOUDBASE_* environment variables.' },
                  { status: 500 }
                )
              }
            } else {
              console.error('[CLOUDBASE CN DOWNLOAD] Failed to extract filePath from URL:', downloadUrl)
              return NextResponse.json(
                { error: 'Failed to extract file path from URL', details: 'The URL format may be incorrect.' },
                { status: 400 }
              )
            }
        } catch (err: any) {
          console.error('[CLOUDBASE CN DOWNLOAD] Error processing new format URL:', err)
          return NextResponse.json(
            {
              error: 'Failed to download file from CloudBase',
              details: err?.message || String(err),
            },
            { status: 500 }
          )
        }
      } else if (isOldFormat) {
        // ⚠️ 旧格式：从 URL 中提取 fileId，用 SDK 重新生成临时链接
        // 然后服务端 fetch 文件内容，流式返回给浏览器，避免浏览器直接访问 CloudBase 的 403/418 拦截
        try {
          const envId = process.env.CLOUDBASE_ENV_ID
          if (!envId) {
            console.error('[CLOUDBASE CN DOWNLOAD] CLOUDBASE_ENV_ID not set, cannot convert URL to fileId')
            return NextResponse.json(
              { error: 'CLOUDBASE_ENV_ID environment variable is required' },
              { status: 500 }
            )
          }

          // 从 URL 中提取路径：https://xxx.tcb.qcloud.la/messages/... -> messages/...
          const urlMatch = downloadUrl.match(/https?:\/\/[^/]+\.tcb\.qcloud\.la\/(.+?)(?:\?|$)/)
          if (!urlMatch || urlMatch.length < 2) {
            console.error('[CLOUDBASE CN DOWNLOAD] Failed to extract path from URL:', downloadUrl)
            return NextResponse.json(
              { error: 'Failed to extract file path from URL' },
              { status: 400 }
            )
          }

          const filePath = urlMatch[1]
          const fileId = `cloud://${envId}/${filePath}`

          console.log('[CLOUDBASE CN DOWNLOAD] Converting URL to fileId and downloading via SDK:', {
            originalUrl: downloadUrl,
            filePath,
            fileId,
            isNewFormat,
            isOldFormat,
          });

          // ✅ 使用 downloadFile 直接下载（永久访问，不依赖临时 URL）
          const app3 = getCloudBaseApp()
          if (!app3) {
            return NextResponse.json(
              { error: 'CloudBase is not configured. Please check CLOUDBASE_* environment variables.' },
              { status: 500 }
            )
          }

          // 使用 downloadFile 直接下载文件内容（永久访问，不依赖临时 URL）
          const result = await (app3 as any).downloadFile({
            fileID: fileId,
          })

          // 处理文件内容（与 fileId 参数的处理逻辑相同）
          let fileContent: any = null
          
          if (Buffer.isBuffer(result)) {
            fileContent = result
          } else if (result && result.fileContent) {
            fileContent = result.fileContent
          } else if (result && result.data) {
            fileContent = result.data
          } else if (result && result.buffer) {
            fileContent = result.buffer
          } else {
            fileContent = result
          }

          if (!fileContent) {
            console.error('[CLOUDBASE CN DOWNLOAD] downloadFile returned empty content for old format URL:', {
              fileId,
              originalUrl: downloadUrl,
            })
            return NextResponse.json(
              { error: 'Empty file content from CloudBase downloadFile', details: 'The file may not exist or access is denied.' },
              { status: 404 }
            )
          }

          // 转换为 Buffer
          if (!Buffer.isBuffer(fileContent)) {
            try {
              if (typeof fileContent === 'string') {
                fileContent = Buffer.from(fileContent, 'base64')
              } else if (fileContent instanceof ArrayBuffer) {
                fileContent = Buffer.from(fileContent)
              } else if (fileContent instanceof Uint8Array) {
                fileContent = Buffer.from(fileContent)
              } else {
                fileContent = Buffer.from(JSON.stringify(fileContent))
              }
            } catch (convertErr) {
              console.error('[CLOUDBASE CN DOWNLOAD] Failed to convert fileContent to Buffer:', convertErr)
              return NextResponse.json(
                { error: 'Failed to process file content', details: 'Unable to convert file content to buffer.' },
                { status: 500 }
              )
            }
          }

          // 从 filePath 中提取文件名
          let filename = 'file'
          const pathParts = filePath.split('/')
          if (pathParts.length > 0) {
            filename = pathParts[pathParts.length - 1] || filename
          }

          // 推断 MIME 类型
          let contentType = 'application/octet-stream'
          if (filename.includes('.')) {
            const ext = filename.split('.').pop()?.toLowerCase()
            const mimeTypes: Record<string, string> = {
              'pdf': 'application/pdf',
              'jpg': 'image/jpeg',
              'jpeg': 'image/jpeg',
              'png': 'image/png',
              'gif': 'image/gif',
              'webp': 'image/webp',
              'mp4': 'video/mp4',
              'mp3': 'audio/mpeg',
              'txt': 'text/plain',
              'json': 'application/json',
            }
            if (ext && mimeTypes[ext]) {
              contentType = mimeTypes[ext]
            }
          }

          const headers: HeadersInit = {
            'Content-Type': contentType,
            'Content-Disposition': `${isDownload ? 'attachment' : 'inline'}; filename="${encodeURIComponent(filename)}"`,
            'Content-Length': fileContent.length.toString(),
          }

          console.log('[CLOUDBASE CN DOWNLOAD] Successfully downloaded file from old format URL via SDK:', {
            fileId,
            filename,
            contentType,
            size: fileContent.length,
          });

          return new NextResponse(fileContent, {
            status: 200,
            headers,
          })
        } catch (convertErr: any) {
          console.error('[CLOUDBASE CN DOWNLOAD] Error processing old format URL:', {
            error: convertErr?.message || String(convertErr),
            code: convertErr?.code || convertErr?.errCode,
            originalUrl: downloadUrl,
          })
          return NextResponse.json(
            {
              error: 'Failed to download file from CloudBase',
              details: convertErr?.message || String(convertErr),
              code: convertErr?.code || convertErr?.errCode,
              hint: convertErr?.code === 'STORAGE_FILE_NONEXIST'
                ? 'The file may have been deleted or the fileID is incorrect.'
                : 'Please check if the file exists and you have permission to access it.',
            },
            { status: 404 }
          )
        }
      } else {
        // 未知格式，尝试从 URL 提取 fileId
        try {
          const envId = process.env.CLOUDBASE_ENV_ID
          if (envId && downloadUrl.includes('.tcb.qcloud.la/')) {
            const urlMatch = downloadUrl.match(/https?:\/\/[^/]+\.tcb\.qcloud\.la\/(.+?)(?:\?|$)/)
            if (urlMatch && urlMatch.length >= 2) {
              const filePath = urlMatch[1]
              const fileId = `cloud://${envId}/${filePath}`
              
              // 尝试使用 downloadFile 下载
              const app4 = getCloudBaseApp()
              if (app4) {
                try {
                  const result = await (app4 as any).downloadFile({ fileID: fileId })
                  
                  let fileContent: any = null
                  if (Buffer.isBuffer(result)) {
                    fileContent = result
                  } else if (result?.fileContent) {
                    fileContent = result.fileContent
                  } else if (result?.data) {
                    fileContent = result.data
                  } else {
                    fileContent = result
                  }

                  if (fileContent && Buffer.isBuffer(fileContent)) {
                    let filename = 'file'
                    const pathParts = filePath.split('/')
                    if (pathParts.length > 0) {
                      filename = pathParts[pathParts.length - 1] || filename
                    }

                    return new NextResponse(fileContent as any, {
                      status: 200,
                      headers: {
                        'Content-Type': 'application/octet-stream',
                        'Content-Disposition': `${isDownload ? 'attachment' : 'inline'}; filename="${encodeURIComponent(filename)}"`,
                      },
                    })
                  }
                } catch (e) {
                  // 如果 downloadFile 失败，继续 fallback
                }
              }
            }
          }
          
          // 最后的 fallback：直接重定向
          return NextResponse.redirect(downloadUrl, 302)
        } catch (e) {
          return NextResponse.json(
            { error: 'Failed to process download request', details: String(e) },
            { status: 500 }
          )
        }
      }
    } else {
      return NextResponse.json(
        { error: 'fileId or url is required' },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error('[CLOUDBASE CN DOWNLOAD] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to generate CloudBase download URL', details: error.message || String(error) },
      { status: 500 }
    )
  }
}
