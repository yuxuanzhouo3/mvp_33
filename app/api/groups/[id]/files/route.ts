import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { getCloudBaseApp, getCloudBaseDb } from '@/lib/cloudbase/client'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await params

    // Verify authentication based on version
    const { IS_DOMESTIC_VERSION } = await import('@/config')
    let user: any = null

    if (IS_DOMESTIC_VERSION) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (!cloudBaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = cloudBaseUser
    } else {
      const supabase = await createClient()
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()
      if (!supabaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = supabaseUser
    }

    const dbClient = await getDatabaseClientForUser()

    // CN users: read from CloudBase
    if (dbClient.type === 'cloudbase' && dbClient.region === 'cn' && dbClient.cloudbase) {
      const db = getCloudBaseDb()
      if (!db) {
        return NextResponse.json({ error: 'Database not available' }, { status: 500 })
      }

      const filesRes = await db.collection('group_files')
        .where({
          conversation_id: groupId,
          region: 'cn'
        })
        .orderBy('created_at', 'desc')
        .get()

      const files = filesRes.data || []

      // Get unique uploader IDs
      const uploaderIds = [...new Set(files.map((f: any) => f.uploaded_by).filter(Boolean))]

      // Fetch uploader info
      let uploaders: any[] = []
      if (uploaderIds.length > 0) {
        const usersRes = await db.collection('users')
          .where({
            id: db.command.in(uploaderIds)
          })
          .get()
        uploaders = usersRes.data || []
      }

      const uploaderMap = new Map(uploaders.map((u: any) => [u.id, u]))

      const filesWithUploader = files.map((f: any) => ({
        id: f._id,
        conversation_id: f.conversation_id,
        file_name: f.file_name,
        file_size: f.file_size,
        file_type: f.file_type,
        file_url: f.file_url,
        uploaded_by: f.uploaded_by,
        created_at: f.created_at,
        region: f.region,
        uploader: {
          id: f.uploaded_by,
          full_name: uploaderMap.get(f.uploaded_by)?.full_name || 'Unknown',
          avatar_url: uploaderMap.get(f.uploaded_by)?.avatar_url || null
        }
      }))

      return NextResponse.json({ success: true, files: filesWithUploader })
    }

    // Global users: read from Supabase
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('group_files')
      .select(`
        *,
        uploader:uploaded_by(id, full_name, avatar_url)
      `)
      .eq('conversation_id', groupId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, files: data })
  } catch (error: any) {
    console.error('[GROUP FILES GET] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await params
    const formData = await request.formData()
    const file = formData.get('file') as File

    console.log('[GROUP FILES] 收到请求:', {
      groupId,
      hasFile: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type
    })

    if (!file) {
      console.error('[GROUP FILES] 未提供文件')
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const maxSize = 100 * 1024 * 1024
    if (file.size > maxSize) {
      console.error('[GROUP FILES] 文件大小超出限制:', {
        fileSize: file.size,
        maxSize,
        maxSizeMB: 100
      })
      return NextResponse.json({ error: 'File size must be less than 100MB' }, { status: 400 })
    }

    // Verify authentication
    const { IS_DOMESTIC_VERSION } = await import('@/config')
    let user: any = null

    if (IS_DOMESTIC_VERSION) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (!cloudBaseUser) {
        console.error('[GROUP FILES] 国内版用户未认证')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = cloudBaseUser
    } else {
      const supabase = await createClient()
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()
      if (!supabaseUser) {
        console.error('[GROUP FILES] 国际版用户未认证')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = supabaseUser
    }

    const dbClient = await getDatabaseClientForUser()
    console.log('[GROUP FILES] 数据库客户端:', {
      type: dbClient.type,
      region: dbClient.region
    })

    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}.${fileExt}`
    const filePath = `group-files/${groupId}/${fileName}`

    console.log('[GROUP FILES] 文件信息:', {
      fileExt,
      fileName,
      filePath
    })

    let fileUrl: string

    if (dbClient.type === 'cloudbase' && dbClient.region === 'cn') {
      // CloudBase: Upload file to CloudBase storage
      const app = getCloudBaseApp()
      if (!app) {
        console.error('[GROUP FILES] CloudBase 未配置')
        return NextResponse.json({ error: 'CloudBase is not configured' }, { status: 500 })
      }

      const arrayBuffer = await file.arrayBuffer()
      const fileBuffer = Buffer.from(arrayBuffer)

      console.log('[GROUP FILES] CloudBase 文件缓冲:', {
        bufferSize: fileBuffer.length,
        arrayBufferSize: arrayBuffer.byteLength
      })

      try {
        const uploadResult = await (app as any).uploadFile({
          cloudPath: filePath,
          fileContent: fileBuffer,
        })

        console.log('[GROUP FILES] CloudBase 上传结果:', {
          uploadResult: JSON.stringify(uploadResult).substring(0, 500),
          hasFileID: !!(uploadResult as any)?.fileID,
          fileID: (uploadResult as any)?.fileID
        })

        let fileId = (uploadResult as any)?.fileID
        if (!fileId || !fileId.startsWith('cloud://')) {
          const envId = process.env.CLOUDBASE_ENV_ID
          console.log('[GROUP FILES] CloudBase 文件ID构造:', {
            hasEnvId: !!envId,
            envId: envId ? `${envId.substring(0, 10)}...` : 'undefined',
            filePath
          })
          fileId = envId ? `cloud://${envId}/${filePath}` : filePath
        }

        fileUrl = `/api/files/cn-download?fileId=${encodeURIComponent(fileId)}`

        console.log('[GROUP FILES] CloudBase 最终URL:', {
          fileId,
          fileUrl,
          filePath
        })
      } catch (error: any) {
        console.error('[GROUP FILES] ❌ CloudBase 上传失败:', {
          message: error?.message,
          code: error?.code || error?.errCode,
          stack: error?.stack,
          errorObject: JSON.stringify(error).substring(0, 500)
        })
        return NextResponse.json({ error: 'Failed to upload to CloudBase', details: error.message }, { status: 500 })
      }

      // Save file record to CloudBase
      const db = getCloudBaseDb()
      if (!db) {
        return NextResponse.json({ error: 'Database not available' }, { status: 500 })
      }

      const now = new Date().toISOString()
      const fileRecord = {
        conversation_id: groupId,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        file_url: fileUrl,
        uploaded_by: user.id,
        created_at: now,
        region: 'cn'
      }

      const insertRes = await db.collection('group_files').add(fileRecord)
      const fileRecordId = insertRes.id || insertRes._id

      // Get uploader info
      const usersRes = await db.collection('users')
        .where({ id: user.id })
        .get()
      const uploader = usersRes.data?.[0] || { full_name: 'Unknown', avatar_url: null }

      const result = {
        id: fileRecordId,
        ...fileRecord,
        uploader: {
          id: user.id,
          full_name: uploader.full_name || 'Unknown',
          avatar_url: uploader.avatar_url || null
        }
      }

      console.log('[GROUP FILES] ✅ CloudBase 文件记录保存成功:', {
        fileRecordId,
        fileName: file.name
      })

      return NextResponse.json({ success: true, file: result })
    } else {
      // Supabase: Upload file to Supabase storage
      const supabase = await createClient()

      const supabaseFilePath = `${groupId}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('group-files')
        .upload(supabaseFilePath, file, { cacheControl: '3600', upsert: false })

      if (uploadError) {
        console.error('[GROUP FILES] ❌ Supabase 上传失败:', {
          error: uploadError,
          message: uploadError.message,
          statusCode: (uploadError as any).statusCode
        })
        return NextResponse.json({ error: 'Failed to upload file', details: uploadError.message }, { status: 500 })
      }

      const { data: urlData } = supabase.storage.from('group-files').getPublicUrl(supabaseFilePath)
      fileUrl = urlData.publicUrl

      console.log('[GROUP FILES] ✅ Supabase 上传成功:', {
        supabaseFilePath,
        fileUrl
      })

      // Save file record to Supabase
      const { data, error } = await supabase
        .from('group_files')
        .insert({
          conversation_id: groupId,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          file_url: fileUrl,
          uploaded_by: user.id
        })
        .select(`
          *,
          uploader:uploaded_by(id, full_name, avatar_url)
        `)
        .single()

      if (error) {
        console.error('[GROUP FILES] ❌ 数据库插入失败:', {
          error,
          message: error.message,
          code: error.code
        })
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      console.log('[GROUP FILES] ✅ 文件上传完成:', {
        fileId: data?.id,
        fileName: file.name
      })

      return NextResponse.json({ success: true, file: data })
    }
  } catch (error: any) {
    console.error('[GROUP FILES] ❌ 未捕获的错误:', {
      error,
      message: error?.message,
      stack: error?.stack
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
