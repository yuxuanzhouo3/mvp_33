/**
 * CloudBase user database operations
 * Handles user operations in CloudBase (for China region)
 */

import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { User } from '@/lib/types'

const normalizeCloudBaseUser = (userData: any): User => ({
  id: userData.id || userData._id,
  email: userData.email,
  username: userData.username || userData.email?.split('@')[0] || '',
  full_name: userData.full_name || userData.name || '',
  avatar_url: userData.avatar_url || null,
  auth_email: userData.auth_email || null,
  provider: userData.provider || null,
  provider_id: userData.provider_id || null,
  wechat_openid: userData.wechat_openid || null,
  wechat_unionid: userData.wechat_unionid || null,
  phone: userData.phone || undefined,
  department: userData.department || undefined,
  title: userData.title || undefined,
  status: userData.status || 'offline',
  status_message: userData.status_message || undefined,
  region: userData.region || 'cn',
  country: userData.country || null,
  subscription_type: userData.subscription_type || null,
  subscription_expires_at: userData.subscription_expires_at || null,
  created_at: userData.created_at || new Date().toISOString(),
  updated_at: userData.updated_at || new Date().toISOString(),
})

/**
 * Get user by email from CloudBase
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const db = getCloudBaseDb()
    if (!db) {
      return null
    }

    const result = await db.collection('users')
      .where({
        email: email
      })
      .get()

    if (result.data && result.data.length > 0) {
      return normalizeCloudBaseUser(result.data[0])
    }

    return null
  } catch (error) {
    console.error('CloudBase getUserByEmail error:', error)
    return null
  }
}

/**
 * Get user by ID from CloudBase
 * Note: userId is the Supabase Auth user ID stored in the 'id' field
 */
export async function getUserById(userId: string): Promise<User | null> {
  try {
    const db = getCloudBaseDb()
    if (!db) {
      return null
    }

    // Query by 'id' field (Supabase Auth user ID) instead of document _id
    const result = await db.collection('users')
      .where({
        id: userId
      })
      .get()

    if (result.data && result.data.length > 0) {
      return normalizeCloudBaseUser(result.data[0])
    }

    return null
  } catch (error) {
    console.error('CloudBase getUserById error:', error)
    return null
  }
}

/**
 * Get user by WeChat identifiers
 */
export async function getUserByWeChatId({
  unionid,
  openid,
}: {
  unionid?: string | null
  openid?: string | null
}): Promise<User | null> {
  try {
    const db = getCloudBaseDb()
    if (!db) {
      return null
    }

    if (!unionid && !openid) {
      return null
    }

    if (unionid) {
      const unionResult = await db
        .collection('users')
        .where({
          wechat_unionid: unionid,
        })
        .get()
      if (unionResult.data && unionResult.data.length > 0) {
        return normalizeCloudBaseUser(unionResult.data[0])
      }
    }

    if (openid) {
      const openResult = await db
        .collection('users')
        .where({
          wechat_openid: openid,
        })
        .get()
      if (openResult.data && openResult.data.length > 0) {
        return normalizeCloudBaseUser(openResult.data[0])
      }
    }

    return null
  } catch (error) {
    console.error('CloudBase getUserByWeChatId error:', error)
    return null
  }
}

/**
 * Create user in CloudBase
 */
export async function createUser(
  userData: {
    id: string // Supabase Auth user ID
    email: string
    username: string
    full_name: string
    avatar_url?: string
    region: 'cn' | 'global'
    country?: string | null
  },
  extraData?: Record<string, any>
): Promise<User> {
  try {
    const db = getCloudBaseDb()
    if (!db) {
      const errorMsg = 'CloudBase not configured - check environment variables: CLOUDBASE_ENV_ID, CLOUDBASE_SECRET_ID, CLOUDBASE_SECRET_KEY'
      console.error('[CloudBase]', errorMsg)
      throw new Error(errorMsg)
    }

    const now = new Date().toISOString()
    const userRecord = {
      id: userData.id, // Store Supabase Auth user ID
      email: userData.email,
      username: userData.username,
      full_name: userData.full_name,
      name: userData.full_name, // Also store as 'name' for compatibility
      avatar_url: userData.avatar_url || null,
      status: 'online',
      region: userData.region,
      country: userData.country || null,
      created_at: now,
      updated_at: now,
      ...extraData,
    }

    // Add user to CloudBase (CloudBase will auto-generate _id, but we store Supabase Auth ID in id field)
    console.log('[CloudBase] Attempting to create user:', {
      id: userData.id,
      email: userData.email,
      region: userData.region,
      country: userData.country,
    })
    
    const result = await db.collection('users').add(userRecord)
    
    // CloudBase returns the document ID in result.id or result._id
    const docId = result.id || result._id
    
    if (!docId) {
      console.error('[CloudBase] Failed to create user - no document ID returned:', result)
      throw new Error('Failed to create user in CloudBase: no document ID returned')
    }

    console.log('[CloudBase] User created successfully:', {
      docId,
      userId: userData.id,
      email: userData.email,
    })

    // Verify the user was actually created by fetching it
    const verifyUser = await getUserById(userData.id)
    if (!verifyUser) {
      console.warn('[CloudBase] User created but verification fetch returned null. This might be a timing issue.')
    } else {
      console.log('[CloudBase] User verification successful:', verifyUser.id)
    }

    return normalizeCloudBaseUser({
      ...userRecord,
      _id: docId,
    })
  } catch (error: any) {
    console.error('[CloudBase] createUser error:', {
      error: error.message,
      code: error.code,
      stack: error.stack,
      userData: {
        id: userData.id,
        email: userData.email,
        region: userData.region,
      }
    })
    throw error
  }
}

/**
 * Update user in CloudBase
 * Note: userId is the Supabase Auth user ID stored in the 'id' field
 */
export async function updateUser(userId: string, updates: Partial<User>): Promise<User> {
  try {
    const db = getCloudBaseDb()
    if (!db) {
      throw new Error('CloudBase not configured')
    }

    console.log('[CloudBase] updateUser called:', {
      userId,
      updateFields: Object.keys(updates),
    })

    // Build update data - filter out undefined values and handle null properly
    const updateData: any = {
      updated_at: new Date().toISOString(),
    }
    
    // Only include fields that are explicitly provided (not undefined)
    // CloudBase may not handle undefined well, so we filter them out
    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && value !== undefined) {
        // Include null values (for clearing fields), but skip undefined
        updateData[key] = value
      }
    }

    // Remove id field if present (shouldn't be updated)
    delete updateData.id
    
    // If no fields to update (only updated_at), that's fine - just update timestamp
    if (Object.keys(updateData).length === 1 && updateData.updated_at) {
      console.log('[CloudBase] Only updating timestamp, no other fields to update')
    }

    // First, find the document by id field
    console.log('[CloudBase] Finding user by id:', userId)
    const queryResult = await db.collection('users')
      .where({
        id: userId
      })
      .get()

    if (!queryResult.data || queryResult.data.length === 0) {
      console.error('[CloudBase] User not found:', userId)
      throw new Error(`User not found: ${userId}`)
    }

    // Get the document _id to update
    const docId = queryResult.data[0]._id
    console.log('[CloudBase] Found user document:', docId, 'userId:', userId)

    // Update the document
    // IMPORTANT: CloudBase doc() requires the document _id, not the 'id' field
    console.log('[CloudBase] Updating document with data:', updateData)
    try {
      const updateResult = await db.collection('users')
        .doc(docId)
        .update(updateData)

      console.log('[CloudBase] Update operation completed')
    } catch (updateError: any) {
      // Format error message for better debugging
      const errorMessage = updateError.message || updateError.toString() || 'Unknown CloudBase update error'
      const errorCode = updateError.code || updateError.errCode || 'UNKNOWN'
      
      console.error('[CloudBase] Update operation failed:', {
        error: errorMessage,
        code: errorCode,
        docId,
        userId,
        updateData,
        fullError: JSON.stringify(updateError, Object.getOwnPropertyNames(updateError)),
      })
      
      // Create a more descriptive error
      const formattedError = new Error(`CloudBase update failed: ${errorMessage}`)
      ;(formattedError as any).code = errorCode
      ;(formattedError as any).originalError = updateError
      throw formattedError
    }

    // Fetch updated user
    const updatedUser = await getUserById(userId)
    if (!updatedUser) {
      console.error('[CloudBase] Failed to fetch updated user after update')
      throw new Error('Failed to fetch updated user')
    }

    console.log('[CloudBase] User updated successfully:', updatedUser.id)
    return updatedUser
  } catch (error: any) {
    console.error('[CloudBase] updateUser error:', {
      error: error.message,
      code: error.code,
      userId,
      updateFields: Object.keys(updates),
    })
    throw error
  }
}





















