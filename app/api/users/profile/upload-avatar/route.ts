import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { updateUser as updateCloudBaseUser } from '@/lib/database/cloudbase/users'
import { getCloudBaseApp } from '@/lib/cloudbase/client'

// Use Node.js runtime for CloudBase SDK compatibility
export const runtime = 'nodejs'

/**
 * Upload user avatar
 * POST /api/users/profile/upload-avatar
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

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      )
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size must be less than 5MB' },
        { status: 400 }
      )
    }

    // Get the correct database client based on user's registered region
    const dbClient = await getDatabaseClientForUser(request)
    console.log('[AVATAR UPLOAD] Database client type:', dbClient.type, 'region:', dbClient.region)

    // Generate unique filename
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}.${fileExt}`
    // Store in user-specific folder: avatars/{userId}/{filename}
    const filePath = `avatars/${currentUser.id}/${fileName}`

    let avatarUrl: string

    // CN region: Use CloudBase Storage
    if (dbClient.type === 'cloudbase' && dbClient.region === 'cn') {
      const app = getCloudBaseApp()
      if (!app) {
        return NextResponse.json(
          { error: 'CloudBase is not configured. Please check CLOUDBASE_ENV_ID / SECRET_ID / SECRET_KEY.' },
          { status: 500 }
        )
      }

      // Convert File to Buffer for CloudBase SDK
      const arrayBuffer = await file.arrayBuffer()
      const fileBuffer = Buffer.from(arrayBuffer)

      try {
        // Upload to CloudBase Storage
        const uploadResult = await (app as any).uploadFile({
          cloudPath: filePath,
          fileContent: fileBuffer,
        })

        // Get fileId (cloud:// format)
        let fileId = (uploadResult as any)?.fileID
        if (!fileId || !fileId.startsWith('cloud://')) {
          const envId = process.env.CLOUDBASE_ENV_ID
          if (envId) {
            fileId = `cloud://${envId}/${filePath}`
          } else {
            fileId = filePath
            console.warn('[AVATAR UPLOAD] CLOUDBASE_ENV_ID not set, using filePath as fileId:', filePath)
          }
        }

        // Use cn-download API for CloudBase files (avoids temporary URL expiration)
        avatarUrl = `/api/files/cn-download?fileId=${encodeURIComponent(fileId)}`

        console.log('[AVATAR UPLOAD] CloudBase upload successful:', {
          filePath,
          fileId,
          avatarUrl,
        })
      } catch (cloudbaseError: any) {
        console.error('[AVATAR UPLOAD] CloudBase upload error:', cloudbaseError)
        return NextResponse.json(
          { 
            error: 'Failed to upload file to CloudBase storage', 
            details: cloudbaseError.message || 'CloudBase upload failed',
            code: cloudbaseError.code || cloudbaseError.errCode,
          },
          { status: 500 }
        )
      }
    } else {
      // Global region: Use Supabase Storage
      const supabaseFilePath = `${currentUser.id}/${fileName}`
      
      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(supabaseFilePath, file, {
          cacheControl: '3600',
          upsert: true // Allow overwriting existing files
        })

      if (uploadError) {
        console.error('[AVATAR UPLOAD] Upload error:', uploadError)
        console.error('[AVATAR UPLOAD] Error details:', JSON.stringify(uploadError, null, 2))
        console.error('[AVATAR UPLOAD] File path:', supabaseFilePath)
        console.error('[AVATAR UPLOAD] User ID:', currentUser.id)
        
        // Check if bucket exists
        const { data: buckets } = await supabase.storage.listBuckets()
        const avatarsBucket = buckets?.find(b => b.id === 'avatars')
        
        if (!avatarsBucket) {
          return NextResponse.json(
            { 
              error: 'Storage bucket not found', 
              details: 'The "avatars" storage bucket does not exist. Please run the setup script: scripts/017_setup_avatar_storage.sql' 
            },
            { status: 500 }
          )
        }
        
        return NextResponse.json(
          { 
            error: 'Failed to upload file', 
            details: uploadError.message || JSON.stringify(uploadError),
            code: uploadError.statusCode || 'UNKNOWN'
          },
          { status: 500 }
        )
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(supabaseFilePath)

      avatarUrl = urlData.publicUrl
      console.log('[AVATAR UPLOAD] Supabase upload successful:', avatarUrl)
    }

    // Update user profile with avatar URL in the correct database
    let updatedUser
    if (dbClient.type === 'cloudbase') {
      // Update in CloudBase
      console.log('[AVATAR UPLOAD] Updating avatar in CloudBase:', currentUser.id, avatarUrl)
      try {
        updatedUser = await updateCloudBaseUser(currentUser.id, { avatar_url: avatarUrl })
        console.log('[AVATAR UPLOAD] CloudBase update successful:', updatedUser.id)
      } catch (cloudbaseError: any) {
        console.error('[AVATAR UPLOAD] CloudBase update error:', cloudbaseError)
        // Try to delete uploaded file from CloudBase Storage
        try {
          const app = getCloudBaseApp()
          if (app) {
            await (app as any).deleteFile({
              fileList: [filePath]
            })
          }
        } catch (deleteError) {
          console.error('[AVATAR UPLOAD] Failed to delete uploaded file:', deleteError)
        }
        return NextResponse.json(
          { 
            error: 'Failed to update profile', 
            details: cloudbaseError.message || 'CloudBase update failed',
            code: cloudbaseError.code,
          },
          { status: 500 }
        )
      }
    } else {
      // Update in Supabase
      const supabaseFilePath = `${currentUser.id}/${fileName}`
      console.log('[AVATAR UPLOAD] Updating avatar in Supabase:', currentUser.id, avatarUrl)
      const { data, error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: avatarUrl })
        .eq('id', currentUser.id)
        .select()
        .single()

      if (updateError) {
        console.error('[AVATAR UPLOAD] Supabase update error:', updateError)
        // Try to delete uploaded file from Supabase Storage
        try {
          await supabase.storage.from('avatars').remove([supabaseFilePath])
        } catch (deleteError) {
          console.error('[AVATAR UPLOAD] Failed to delete uploaded file:', deleteError)
        }
        return NextResponse.json(
          { 
            error: 'Failed to update profile', 
            details: updateError.message,
            code: updateError.code,
          },
          { status: 500 }
        )
      }
      updatedUser = data
      console.log('[AVATAR UPLOAD] Supabase update successful:', updatedUser.id)
    }

    return NextResponse.json({
      success: true,
      avatar_url: avatarUrl,
      user: updatedUser,
    })
  } catch (error: any) {
    console.error('Upload avatar error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload avatar' },
      { status: 500 }
    )
  }
}

