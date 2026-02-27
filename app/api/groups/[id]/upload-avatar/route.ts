import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { updateGroupSettings as updateGroupSettingsSupabase } from '@/lib/database/supabase/groups'
import { updateGroupSettings as updateGroupSettingsCloudbase } from '@/lib/database/cloudbase/groups'
import { getCloudBaseApp } from '@/lib/cloudbase/client'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const dbClient = await getDatabaseClientForUser(request)
    const isCloudbase = dbClient.type === 'cloudbase' && dbClient.region === 'cn'

    let supabase: Awaited<ReturnType<typeof createClient>> | null = null
    let user: { id: string } | null = null

    if (isCloudbase) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (cloudBaseUser) {
        user = { id: cloudBaseUser.id }
      }
    } else {
      supabase = dbClient.supabase || await createClient()
      const { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser()
      if (authError) {
        console.error('[GROUP AVATAR] 用户认证失败:', authError)
      }
      if (supabaseUser) {
        user = { id: supabaseUser.id }
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: groupId } = await params
    const formData = await request.formData()
    const file = formData.get('file') as File

    console.log('[GROUP AVATAR] 收到请求:', {
      groupId,
      hasFile: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type
    })

    if (!file) {
      console.error('[GROUP AVATAR] 未提供文件')
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      console.error('[GROUP AVATAR] 文件类型错误:', { fileType: file.type })
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      console.error('[GROUP AVATAR] 文件大小超出限制:', {
        fileSize: file.size,
        maxSize,
        maxSizeMB: 5
      })
      return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 })
    }

    console.log('[GROUP AVATAR] 数据库客户端:', {
      type: dbClient.type,
      region: dbClient.region
    })

    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}.${fileExt}`
    const filePath = `group-avatars/${groupId}/${fileName}`

    console.log('[GROUP AVATAR] 文件信息:', {
      fileExt,
      fileName,
      filePath
    })

    let avatarUrl: string

    if (dbClient.type === 'cloudbase' && dbClient.region === 'cn') {

      const app = getCloudBaseApp()
      if (!app) {
        console.error('[GROUP AVATAR] CloudBase 未配置')
        return NextResponse.json({ error: 'CloudBase is not configured' }, { status: 500 })
      }


      const arrayBuffer = await file.arrayBuffer()
      const fileBuffer = Buffer.from(arrayBuffer)

      console.log('[GROUP AVATAR] CloudBase 文件缓冲:', {
        bufferSize: fileBuffer.length,
        arrayBufferSize: arrayBuffer.byteLength
      })

      try {

        const uploadResult = await (app as any).uploadFile({
          cloudPath: filePath,
          fileContent: fileBuffer,
        })

        console.log('[GROUP AVATAR] CloudBase 上传结果:', {
          uploadResult: JSON.stringify(uploadResult).substring(0, 500),
          hasFileID: !!(uploadResult as any)?.fileID,
          fileID: (uploadResult as any)?.fileID
        })

        let fileId = (uploadResult as any)?.fileID
        if (!fileId || !fileId.startsWith('cloud://')) {
          const envId = process.env.CLOUDBASE_ENV_ID
          console.log('[GROUP AVATAR] CloudBase 文件ID构造:', {
            hasEnvId: !!envId,
            envId: envId ? `${envId.substring(0, 10)}...` : 'undefined',
            filePath
          })
          fileId = envId ? `cloud://${envId}/${filePath}` : filePath
        }

        avatarUrl = `/api/files/cn-download?fileId=${encodeURIComponent(fileId)}`

        console.log('[GROUP AVATAR] CloudBase 最终URL:', {
          fileId,
          avatarUrl,
          filePath
        })
      } catch (error: any) {
        console.error('[GROUP AVATAR] ❌ CloudBase 上传失败:', {
          message: error?.message,
          code: error?.code || error?.errCode,
          stack: error?.stack,
          errorObject: JSON.stringify(error).substring(0, 500)
        })
        return NextResponse.json({ error: 'Failed to upload to CloudBase', details: error.message }, { status: 500 })
      }
    } else {
      if (!supabase) {
        return NextResponse.json({ error: 'Database client unavailable' }, { status: 500 })
      }


      const supabaseFilePath = `${groupId}/${fileName}`


      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(supabaseFilePath, file, { cacheControl: '3600', upsert: true })

      if (uploadError) {
        console.error('[GROUP AVATAR] ❌ Supabase 上传失败:', {
          error: uploadError,
          message: uploadError.message,
          statusCode: (uploadError as any).statusCode
        })
        return NextResponse.json({ error: 'Failed to upload file', details: uploadError.message }, { status: 500 })
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(supabaseFilePath)
      avatarUrl = urlData.publicUrl

      console.log('[GROUP AVATAR] ✅ Supabase 上传成功:', {
        supabaseFilePath,
        avatarUrl
      })
    }

    console.log('[GROUP AVATAR] 准备更新数据库:', {
      groupId,
      avatarUrl
    })

    const success = isCloudbase
      ? await updateGroupSettingsCloudbase(groupId, { avatar_url: avatarUrl })
      : await updateGroupSettingsSupabase(groupId, { avatar_url: avatarUrl })

    console.log('[GROUP AVATAR] 数据库更新结果:', {
      success,
      groupId,
      avatarUrl
    })

    if (!success) {
      console.error('[GROUP AVATAR] ❌ 更新群组头像失败')
      return NextResponse.json({ error: 'Failed to update group avatar' }, { status: 500 })
    }

    console.log('[GROUP AVATAR] ✅ 群头像上传完成:', {
      groupId,
      avatarUrl
    })

    return NextResponse.json({ success: true, avatar_url: avatarUrl })
  } catch (error: any) {
    console.error('[GROUP AVATAR] ❌ 未捕获的错误:', {
      error,
      message: error?.message,
      stack: error?.stack
    })
    return NextResponse.json({ error: error.message || 'Failed to upload avatar' }, { status: 500 })
  }
}
