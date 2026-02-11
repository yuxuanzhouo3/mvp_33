import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { getCloudBaseApp } from '@/lib/cloudbase/client'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: groupId } = await params

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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      console.error('[GROUP FILES] 用户未认证')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }


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


    const dbClient = await getDatabaseClientForUser(request)
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
    } else {

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
    }


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
  } catch (error: any) {
    console.error('[GROUP FILES] ❌ 未捕获的错误:', {
      error,
      message: error?.message,
      stack: error?.stack
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
