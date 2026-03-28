import { NextRequest, NextResponse } from 'next/server'
import { getDeploymentRegion } from '@/config'
import { getCloudBaseDb } from '@/lib/cloudbase/client'

export const runtime = 'nodejs'

async function getAuthenticatedUser(request: NextRequest) {
  const region = getDeploymentRegion()
  if (region === 'CN') {
    const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
    return await verifyCloudBaseSession(request)
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
  }
}

/**
 * GET /api/docs — list user's documents
 * Query: ?tab=recent|my|shared&id=xxx (optional single doc)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const docId = searchParams.get('id')
    const tab = searchParams.get('tab') || 'recent'

    const db = getCloudBaseDb()
    if (!db) {
      return NextResponse.json({ success: true, documents: [] })
    }

    try {
      // Single document fetch
      if (docId) {
        const result = await db.collection('documents').doc(docId).get()
        if (!result.data || result.data.length === 0) {
          return NextResponse.json({ error: 'Document not found' }, { status: 404 })
        }
        return NextResponse.json({ success: true, document: result.data[0] })
      }

      // List by tab
      let query: any
      if (tab === 'shared') {
        query = db.collection('documents')
          .where({ shared_with: user.id })
          .orderBy('updated_at', 'desc')
          .limit(50)
      } else {
        // 'recent' and 'my' both show own documents, sorted by updated_at
        query = db.collection('documents')
          .where({ owner_id: user.id })
          .orderBy('updated_at', 'desc')
          .limit(50)
      }

      const result = await query.get()
      return NextResponse.json({ success: true, documents: result.data || [] })
    } catch (err: any) {
      if (err?.code === 'DATABASE_COLLECTION_NOT_EXIST') {
        return NextResponse.json({ success: true, documents: [] })
      }
      throw err
    }
  } catch (error: any) {
    console.error('[API /api/docs GET] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to get documents' }, { status: 500 })
  }
}

/**
 * POST /api/docs — create a document
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title, type, content } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const document = {
      title,
      type: type || 'doc', // 'doc' | 'spreadsheet' | 'slides' | 'folder'
      content: content || '',
      owner_id: user.id,
      owner_name: (user as any).full_name || (user as any).username || (user as any).email || 'Unknown',
      shared_with: [],
      created_at: now,
      updated_at: now,
    }

    const db = getCloudBaseDb()
    if (!db) {
      const fakeId = `doc_${Date.now()}`
      return NextResponse.json({
        success: true,
        document: { ...document, _id: fakeId, id: fakeId },
      })
    }

    try {
      const result = await db.collection('documents').add(document)
      return NextResponse.json({
        success: true,
        document: { ...document, _id: result.id, id: result.id },
      })
    } catch (err: any) {
      if (err?.code === 'DATABASE_COLLECTION_NOT_EXIST') {
        const fakeId = `doc_${Date.now()}`
        return NextResponse.json({
          success: true,
          document: { ...document, _id: fakeId, id: fakeId },
        })
      }
      throw err
    }
  } catch (error: any) {
    console.error('[API /api/docs POST] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to create document' }, { status: 500 })
  }
}

/**
 * PUT /api/docs — update a document
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, title, content, shared_with } = body

    if (!id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    const db = getCloudBaseDb()
    if (!db) {
      return NextResponse.json({ success: true })
    }

    await db.collection('documents').doc(id).update({
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(shared_with !== undefined && { shared_with }),
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API /api/docs PUT] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to update document' }, { status: 500 })
  }
}

/**
 * DELETE /api/docs — delete a document
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const docId = searchParams.get('id')
    if (!docId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    const db = getCloudBaseDb()
    if (!db) {
      return NextResponse.json({ success: true })
    }

    await db.collection('documents').doc(docId).remove()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API /api/docs DELETE] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to delete document' }, { status: 500 })
  }
}
