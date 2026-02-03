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
    const supabase = await createClient()
    
    // Get current user
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    const formData = await request.formData()
    const file = formData.get('file') as File
    const conversationId = formData.get('conversationId') as string

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      )
    }

    // Check subscription status to determine file size limit
    let subscriptionType: 'free' | 'monthly' | 'yearly' | null = 'free'
    let expiresAt: string | null = null
    let isPro = false

    if (dbClient.type === 'cloudbase') {
      // CN region: read from CloudBase users collection
      try {
        const { getUserById } = await import('@/lib/database/cloudbase/users')
        const user = await getUserById(currentUser.id)
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
      } catch (err) {
        console.error('[UPLOAD] CloudBase subscription check error:', err)
      }
    } else {
      // Global region: read from Supabase users table
      try {
        const { data, error } = await dbClient.supabase
          .from('users')
          .select('subscription_type, subscription_expires_at')
          .eq('id', currentUser.id)
          .maybeSingle()

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
      } catch (err) {
        console.error('[UPLOAD] Supabase subscription check error:', err)
      }
    }

    // Set file size limit based on subscription: 10MB for free, 500MB for pro
    const maxSize = isPro ? 500 * 1024 * 1024 : 10 * 1024 * 1024 // 500MB for pro, 10MB for free
    const maxSizeMB = isPro ? 500 : 10

    if (file.size > maxSize) {
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
      const app = getCloudBaseApp()
      if (!app) {
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

      // Convert File to Buffer for CloudBase SDK
      const arrayBuffer = await file.arrayBuffer()
      const fileBuffer = Buffer.from(arrayBuffer)

      try {
        // @cloudbase/node-sdk v3: 直接使用 app.uploadFile，而不是 app.storage().uploadFile
        const uploadResult = await (app as any).uploadFile({
          cloudPath,
          fileContent: fileBuffer,
        })

        // 确保 fileId 始终是 cloud:// 格式
        let fileId = (uploadResult as any)?.fileID
        if (!fileId || !fileId.startsWith('cloud://')) {
          // 如果 SDK 没有返回 fileID，或者返回的不是 cloud:// 格式，我们自己构造
          const envId = process.env.CLOUDBASE_ENV_ID
          if (envId) {
            fileId = `cloud://${envId}/${cloudPath}`
          } else {
            // 如果没有 envId，fallback 到 cloudPath（但这不是标准格式）
            fileId = cloudPath
            console.warn('[CLOUDBASE MESSAGE FILE UPLOAD] CLOUDBASE_ENV_ID not set, using cloudPath as fileId:', cloudPath)
          }
        }
        
        console.log('[CLOUDBASE MESSAGE FILE UPLOAD] Upload result:', {
          uploadResultFileID: (uploadResult as any)?.fileID,
          constructedFileId: fileId,
          cloudPath,
        })

        // ✅ 不返回临时 URL，而是返回通过 cn-download API 的 URL
        // 这样可以避免临时链接过期的问题，每次访问都会动态生成新的临时链接
        const publicUrl = `/api/files/cn-download?fileId=${encodeURIComponent(fileId)}`

        console.log('[CLOUDBASE MESSAGE FILE UPLOAD] Success:', {
          cloudPath,
          publicUrl,
          fileId,
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
        console.error('[CLOUDBASE MESSAGE FILE UPLOAD] Error:', {
          message: e?.message,
          code: e?.code || e?.errCode,
          stack: e?.stack,
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

    // Global region：走 Supabase Storage（你这边已经验证 OK 的逻辑）
    // Verify user is a member of the conversation (Supabase / global only)
    const { data: member } = await supabase
      .from('conversation_members')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', currentUser.id)
      .single()

    if (!member) {
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

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('messages')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('[MESSAGE FILE UPLOAD] Error:', uploadError)

      // Check if bucket exists
      const { data: buckets } = await supabase.storage.listBuckets()
      const messagesBucket = buckets?.find((b) => b.id === 'messages')

      if (!messagesBucket) {
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

    return NextResponse.json({
      success: true,
      file_url: fileUrl,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      file_path: filePath,
    })
  } catch (error: any) {
    console.error('Upload message file error:', error)
    return NextResponse.json(
      { error: 'Failed to upload file', details: error.message },
      { status: 500 }
    )
  }
}












