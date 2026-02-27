import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { getCloudBaseApp } from '@/lib/cloudbase/client'

// 使用 Node.js runtime，避免在 Edge 环境下 Buffer 不可用导致上传失败
export const runtime = 'nodejs'

// 设置最大执行时间为 5 分钟（用于大文件上传）
export const maxDuration = 300

/**
 * Upload file for message
 * POST /api/messages/upload
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[FILE UPLOAD] 开始处理文件上传请求')

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'
    const isCloudbase = dbClient.type === 'cloudbase' && userRegion === 'cn'

    let supabase: Awaited<ReturnType<typeof createClient>> | null = null
    let currentUser: { id: string } | null = null

    if (isCloudbase) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (cloudBaseUser) {
        currentUser = { id: cloudBaseUser.id }
      }
    } else {
      supabase = dbClient.supabase || await createClient()
      const { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser()
      if (authError) {
        console.error('[FILE UPLOAD] 用户认证失败:', authError)
      }
      if (supabaseUser) {
        currentUser = { id: supabaseUser.id }
      }
    }

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[FILE UPLOAD] 用户认证成功:', { userId: currentUser.id })

    console.log('[FILE UPLOAD] 数据库客户端信息:', {
      type: dbClient.type,
      region: userRegion
    })

    const formData = await request.formData()
    const file = formData.get('file') as File
    const conversationId = formData.get('conversationId') as string

    if (!file) {
      console.error('[FILE UPLOAD] 未提供文件')
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!conversationId) {
      console.error('[FILE UPLOAD] 未提供 conversationId')
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      )
    }

    console.log('[FILE UPLOAD] 文件信息:', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      conversationId
    })

    // Check subscription status to determine file size limit
    let subscriptionType: 'free' | 'monthly' | 'yearly' | null = 'free'
    let expiresAt: string | null = null
    let isPro = false

    console.log('[FILE UPLOAD] 开始检查订阅状态')

    if (dbClient.type === 'cloudbase') {
      // CN region: read from CloudBase users collection
      try {
        const { getUserById } = await import('@/lib/database/cloudbase/users')
        const user = await getUserById(currentUser.id)
        console.log('[FILE UPLOAD] CloudBase 用户信息:', {
          userId: currentUser.id,
          hasUser: !!user,
          subscriptionType: (user as any)?.subscription_type,
          expiresAt: (user as any)?.subscription_expires_at
        })
        if (user && (user as any).subscription_type) {
          const t = (user as any).subscription_type
          if (t === 'monthly' || t === 'yearly') {
            subscriptionType = t
          }
        }
        if (user && (user as any).subscription_expires_at) {
          const raw = (user as any).subscription_expires_at
          const d = raw instanceof Date ? raw : new Date(raw)
          if (!isNaN(d.getTime())) {
            expiresAt = d.toISOString()
          }
        }
        // Check if subscription is active
        isPro = subscriptionType !== 'free' && (!expiresAt || new Date(expiresAt) > new Date())
        console.log('[FILE UPLOAD] CloudBase 订阅检查结果:', { subscriptionType, expiresAt, isPro })
      } catch (err) {
        console.error('[FILE UPLOAD] CloudBase 订阅检查错误:', err)
      }
    } else {
      // Global region: read from Supabase users table
      try {
        const { data, error } = await dbClient.supabase
          .from('users')
          .select('subscription_type, subscription_expires_at')
          .eq('id', currentUser.id)
          .maybeSingle()

        console.log('[FILE UPLOAD] Supabase 用户信息:', {
          userId: currentUser.id,
          hasData: !!data,
          error: error?.message,
          subscriptionType: data?.subscription_type,
          expiresAt: data?.subscription_expires_at
        })

        if (!error && data) {
          if (data.subscription_type === 'monthly' || data.subscription_type === 'yearly') {
            subscriptionType = data.subscription_type
          }
          if (data.subscription_expires_at) {
            const d = new Date(data.subscription_expires_at)
            if (!isNaN(d.getTime())) {
              expiresAt = d.toISOString()
            }
          }
          // Check if subscription is active
          isPro = subscriptionType !== 'free' && (!expiresAt || new Date(expiresAt) > new Date())
        }
        console.log('[FILE UPLOAD] Supabase 订阅检查结果:', { subscriptionType, expiresAt, isPro })
      } catch (err) {
        console.error('[FILE UPLOAD] Supabase 订阅检查错误:', err)
      }
    }

    // Set file size limit based on subscription: 10MB for free, 500MB for pro
    const maxSize = isPro ? 500 * 1024 * 1024 : 10 * 1024 * 1024 // 500MB for pro, 10MB for free
    const maxSizeMB = isPro ? 500 : 10

    console.log('[FILE UPLOAD] 文件大小限制:', {
      maxSize,
      maxSizeMB,
      fileSize: file.size,
      isPro,
      willExceed: file.size > maxSize
    })

    if (file.size > maxSize) {
      console.error('[FILE UPLOAD] 文件大小超出限制:', {
        fileSize: file.size,
        maxSize,
        maxSizeMB,
        isPro
      })
      return NextResponse.json(
        {
          error: `File size must be less than ${maxSizeMB}MB`,
          details: isPro
            ? 'You have reached the file size limit for your subscription plan.'
            : 'Upgrade to Pro to upload files up to 500MB.'
        },
        { status: 400 }
      )
    }

    // CN region: 严格使用 CloudBase Storage
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      console.log('[FILE UPLOAD] 使用 CloudBase 存储')

      const app = getCloudBaseApp()
      if (!app) {
        console.error('[FILE UPLOAD] CloudBase 未配置')
        return NextResponse.json(
          { error: 'CloudBase is not configured. Please check CLOUDBASE_ENV_ID / SECRET_ID / SECRET_KEY.' },
          { status: 500 }
        )
      }

      // Generate unique cloud path: messages/{conversationId}/{timestamp-random}-{filename}
      const safeName = file.name || 'file'
      const fileExt = safeName.includes('.') ? safeName.split('.').pop() : 'bin'
      const baseName = safeName.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${baseName}`
      const cloudPath = `messages/${conversationId}/${fileName}`

      console.log('[FILE UPLOAD] CloudBase 文件路径信息:', {
        safeName,
        fileExt,
        baseName,
        fileName,
        cloudPath
      })

      // Convert File to Buffer for CloudBase SDK
      const arrayBuffer = await file.arrayBuffer()
      const fileBuffer = Buffer.from(arrayBuffer)

      console.log('[FILE UPLOAD] 文件转换为 Buffer:', {
        bufferSize: fileBuffer.length,
        arrayBufferSize: arrayBuffer.byteLength
      })

      try {
        console.log('[FILE UPLOAD] 开始上传到 CloudBase:', { cloudPath })
        // @cloudbase/node-sdk v3: 直接使用 app.uploadFile，而不是 app.storage().uploadFile
        const uploadResult = await (app as any).uploadFile({
          cloudPath,
          fileContent: fileBuffer,
        })

        console.log('[FILE UPLOAD] CloudBase 上传结果:', {
          uploadResult: JSON.stringify(uploadResult).substring(0, 500),
          hasFileID: !!(uploadResult as any)?.fileID,
          fileID: (uploadResult as any)?.fileID
        })

        // 确保 fileId 始终是 cloud:// 格式
        let fileId = (uploadResult as any)?.fileID
        if (!fileId || !fileId.startsWith('cloud://')) {
          // 如果 SDK 没有返回 fileID，或者返回的不是 cloud:// 格式，我们自己构造
          const envId = process.env.CLOUDBASE_ENV_ID
          console.log('[FILE UPLOAD] 构造 fileId:', {
            hasEnvId: !!envId,
            envId: envId ? `${envId.substring(0, 10)}...` : 'undefined',
            cloudPath
          })
          if (envId) {
            fileId = `cloud://${envId}/${cloudPath}`
          } else {
            // 如果没有 envId，fallback 到 cloudPath（但这不是标准格式）
            fileId = cloudPath
            console.warn('[FILE UPLOAD] ⚠️ CLOUDBASE_ENV_ID 未设置，使用 cloudPath 作为 fileId:', cloudPath)
          }
        }

        console.log('[FILE UPLOAD] 最终 fileId:', {
          uploadResultFileID: (uploadResult as any)?.fileID,
          constructedFileId: fileId,
          cloudPath,
        })

        // ✅ 不返回临时 URL，而是返回通过 cn-download API 的 URL
        // 这样可以避免临时链接过期的问题，每次访问都会动态生成新的临时链接
        const publicUrl = `/api/files/cn-download?fileId=${encodeURIComponent(fileId)}`

        console.log('[FILE UPLOAD] ✅ CloudBase 上传成功:', {
          cloudPath,
          publicUrl,
          fileId,
          fileName: safeName,
          fileSize: file.size
        })

        return NextResponse.json({
          success: true,
          file_url: publicUrl, // 使用 cn-download API URL，避免临时链接过期
          // CloudBase 原始 fileID，用于后续通过 /api/files/cn-download 动态获取文件
          file_id: fileId,
          file_name: safeName,
          file_size: file.size,
          file_type: file.type,
          file_path: cloudPath,
        })
      } catch (e: any) {
        console.error('[FILE UPLOAD] ❌ CloudBase 上传失败:', {
          message: e?.message,
          code: e?.code || e?.errCode,
          stack: e?.stack,
          errorObject: JSON.stringify(e).substring(0, 500)
        })
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to upload file to CloudBase storage',
            details: e?.message || String(e),
            code: e?.code || e?.errCode || 'CLOUDBASE_UPLOAD_ERROR',
          },
          { status: 500 }
        )
      }
    }

    if (!supabase) {
      return NextResponse.json(
        { error: 'Database client unavailable' },
        { status: 500 }
      )
    }

    // Global region：走 Supabase Storage（你这边已经验证 OK 的逻辑）
    console.log('[FILE UPLOAD] 使用 Supabase 存储')

    // Verify user is a member of the conversation (Supabase / global only)
    const { data: member } = await supabase
      .from('conversation_members')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', currentUser.id)
      .single()

    console.log('[FILE UPLOAD] 会话成员验证:', {
      conversationId,
      userId: currentUser.id,
      isMember: !!member
    })

    if (!member) {
      console.error('[FILE UPLOAD] 用户不是会话成员')
      return NextResponse.json(
        { error: 'Not a member of this conversation' },
        { status: 403 }
      )
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop() || 'bin'
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    // Store in conversation-specific folder: messages/{conversationId}/{filename}
    const filePath = `${conversationId}/${fileName}`

    console.log('[FILE UPLOAD] Supabase 文件路径:', {
      fileExt,
      fileName,
      filePath
    })

    // Upload to Supabase Storage
    console.log('[FILE UPLOAD] 开始上传到 Supabase:', { filePath })

    const { error: uploadError } = await supabase.storage
      .from('messages')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('[FILE UPLOAD] ❌ Supabase 上传失败:', {
        error: uploadError,
        message: uploadError.message,
        statusCode: (uploadError as any).statusCode
      })

      // Check if bucket exists
      const { data: buckets } = await supabase.storage.listBuckets()
      const messagesBucket = buckets?.find((b) => b.id === 'messages')

      console.log('[FILE UPLOAD] 存储桶检查:', {
        hasBuckets: !!buckets,
        bucketsCount: buckets?.length,
        hasMessagesBucket: !!messagesBucket
      })

      if (!messagesBucket) {
        console.error('[FILE UPLOAD] messages 存储桶不存在')
        return NextResponse.json(
          {
            error: 'Storage bucket not found',
            details: 'The "messages" storage bucket does not exist. Please run the setup script to create it.',
          },
          { status: 500 }
        )
      }

      return NextResponse.json(
        {
          error: 'Failed to upload file',
          details: uploadError.message || JSON.stringify(uploadError),
          code: (uploadError as any).statusCode || 'UNKNOWN',
        },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('messages').getPublicUrl(filePath)

    const fileUrl = urlData.publicUrl

    console.log('[FILE UPLOAD] ✅ Supabase 上传成功:', {
      filePath,
      fileUrl,
      fileName: file.name,
      fileSize: file.size
    })

    return NextResponse.json({
      success: true,
      file_url: fileUrl,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      file_path: filePath,
    })
  } catch (error: any) {
    console.error('[FILE UPLOAD] ❌ 未捕获的错误:', {
      error,
      message: error?.message,
      stack: error?.stack
    })
    return NextResponse.json(
      { error: 'Failed to upload file', details: error.message },
      { status: 500 }
    )
  }
}











