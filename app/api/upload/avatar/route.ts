import { NextRequest, NextResponse } from 'next/server'
import { CloudBaseConnector } from '@/lib/cloudbase/connector'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_AVATAR_SIZE_MB = 5
const maxAvatarSizeBytes = MAX_AVATAR_SIZE_MB * 1024 * 1024

/**
 * Upload avatar to CloudBase Storage
 * POST /api/upload/avatar
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 })
    }

    const arrayBuf = await file.arrayBuffer()
    if (arrayBuf.byteLength > maxAvatarSizeBytes) {
      return NextResponse.json(
        { error: `file too large (max ${MAX_AVATAR_SIZE_MB}MB)` },
        { status: 413 }
      )
    }

    const buffer = Buffer.from(arrayBuf)
    const ext = file.name.split('.').pop() || 'jpg'
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '') || 'jpg'
    const cloudPath = `avatars/${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`

    const connector = new CloudBaseConnector()
    await connector.initialize()
    const app = connector.getApp()

    const res = await app.uploadFile({ cloudPath, fileContent: buffer })

    let tempUrl: string | null = null
    try {
      const tmp = await app.getTempFileURL({
        fileList: [{ fileID: res.fileID, maxAge: 7 * 24 * 60 * 60 }],
      })
      tempUrl = tmp?.fileList?.[0]?.tempFileURL || null
    } catch (err) {
      console.warn('[avatar upload] failed to get temp url', err)
    }

    return NextResponse.json({
      success: true,
      fileId: res.fileID,
      tempUrl,
      avatarUrl: res.fileID,
    })
  } catch (error) {
    console.error('[avatar upload] error', error)
    return NextResponse.json(
      {
        success: false,
        error: 'upload failed',
      },
      { status: 500 }
    )
  }
}
