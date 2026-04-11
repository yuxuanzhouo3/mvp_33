import { NextRequest, NextResponse } from 'next/server'
import { getCloudBaseApp } from '@/lib/cloudbase/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_AVATAR_SIZE_MB = 5
const maxAvatarSizeBytes = MAX_AVATAR_SIZE_MB * 1024 * 1024

/**
 * Upload avatar to CloudBase Storage (used by WeChat mini-program profile page)
 * POST /api/upload/avatar
 * 
 * This endpoint does NOT require authentication because it is called
 * from the mini-program native page before the user has logged in.
 * The avatar is uploaded to CloudBase storage and a permanent URL is returned.
 */
export async function POST(req: NextRequest) {
  try {
    console.log('[avatar upload] Received upload request')

    const form = await req.formData()
    const file = form.get('file')

    if (!file || !(file instanceof File)) {
      console.error('[avatar upload] No file in request')
      return NextResponse.json({ success: false, error: 'file required' }, { status: 400 })
    }

    console.log('[avatar upload] File info:', {
      name: file.name,
      size: file.size,
      type: file.type,
    })

    const arrayBuf = await file.arrayBuffer()
    if (arrayBuf.byteLength > maxAvatarSizeBytes) {
      return NextResponse.json(
        { success: false, error: `file too large (max ${MAX_AVATAR_SIZE_MB}MB)` },
        { status: 413 }
      )
    }

    const buffer = Buffer.from(arrayBuf)
    const ext = file.name.split('.').pop() || 'jpg'
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '') || 'jpg'
    const cloudPath = `avatars/${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`

    // Use the standard CloudBase app singleton (same as all other routes)
    const app = getCloudBaseApp()
    if (!app) {
      console.error('[avatar upload] CloudBase app not initialized. Check CLOUDBASE_ENV_ID / SECRET_ID / SECRET_KEY.')
      return NextResponse.json(
        { success: false, error: 'CloudBase not configured' },
        { status: 500 }
      )
    }

    console.log('[avatar upload] Uploading to CloudBase:', cloudPath)

    const res = await (app as any).uploadFile({ cloudPath, fileContent: buffer })

    const fileId = res?.fileID
    if (!fileId) {
      console.error('[avatar upload] No fileID returned:', res)
      return NextResponse.json(
        { success: false, error: 'upload returned no fileID' },
        { status: 500 }
      )
    }

    console.log('[avatar upload] Upload success, fileId:', fileId)

    // Get a temporary download URL for immediate use
    let tempUrl: string | null = null
    try {
      const tmp = await (app as any).getTempFileURL({
        fileList: [{ fileID: fileId, maxAge: 7 * 24 * 60 * 60 }],
      })
      tempUrl = tmp?.fileList?.[0]?.tempFileURL || null
    } catch (err) {
      console.warn('[avatar upload] failed to get temp url:', err)
    }

    // Use cn-download proxy URL for long-term access (avoids temp URL expiration)
    const permanentUrl = `/api/files/cn-download?fileId=${encodeURIComponent(fileId)}`

    console.log('[avatar upload] Complete:', { fileId, tempUrl: !!tempUrl, permanentUrl })

    return NextResponse.json({
      success: true,
      fileId,
      tempUrl: tempUrl || permanentUrl,
      avatarUrl: permanentUrl,
    })
  } catch (error: any) {
    console.error('[avatar upload] Unexpected error:', error?.message || error, error?.stack)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'upload failed',
      },
      { status: 500 }
    )
  }
}
