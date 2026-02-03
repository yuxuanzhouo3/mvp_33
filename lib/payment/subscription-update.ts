/**
 * Update user subscription after payment success
 * Supports both CloudBase (CN) and Supabase (Global)
 */

import { getDatabaseClientForUser } from '@/lib/database-router'
import { getCloudBaseDb } from '@/lib/cloudbase/client'

/**
 * Extract subscription type from plan description
 * @param planDescription - Order description, e.g. "Pro Plan - Pro Monthly"
 * @returns 'monthly' | 'yearly' | null
 */
function extractSubscriptionType(planDescription: string | null | undefined): 'monthly' | 'yearly' | null {
  if (!planDescription) return null
  
  const descLower = planDescription.toLowerCase().trim()
  
  // Check for yearly first (more specific), then monthly
  if (descLower.includes('pro yearly') || 
      descLower.includes('pro-yearly') ||
      descLower.includes('yearly') || 
      descLower.includes('annual') ||
      descLower === 'pro yearly' ||
      descLower.endsWith('yearly')) {
    return 'yearly'
  } else if (descLower.includes('pro monthly') || 
             descLower.includes('pro-monthly') ||
             descLower.includes('monthly') ||
             descLower === 'pro monthly' ||
             descLower.endsWith('monthly')) {
    return 'monthly'
  } else if (descLower.includes('year') && !descLower.includes('month')) {
    return 'yearly'
  } else if (descLower.includes('month') && !descLower.includes('year')) {
    return 'monthly'
  }
  
  return null
}

/**
 * Update user subscription after payment success
 * @param userId - User ID
 * @param planDescription - Order description, e.g. "Pro Plan - Pro Monthly"
 * @param dbClient - Database client (from getDatabaseClientForUser)
 */
export async function updateUserSubscriptionAfterPayment(
  userId: string,
  planDescription: string | null | undefined,
  dbClient: any
): Promise<void> {
  try {
    // Extract subscription type from description
    const subscriptionType = extractSubscriptionType(planDescription)
    
    if (!subscriptionType) {
      console.warn('[updateUserSubscriptionAfterPayment] Cannot determine subscription type from description:', planDescription)
      return
    }

    const now = new Date()
    let expiresAt: Date

    if (dbClient.type === 'cloudbase') {
      // CloudBase (CN)
      const db = dbClient.cloudbase
      
      try {
        // Query user by id field (Supabase Auth user ID stored in 'id' field, not document _id)
        const userResult = await db.collection('users')
          .where({
            id: userId
          })
          .get()
        
        let user: any = null
        let docId: string | null = null
        
        if (userResult && userResult.data && userResult.data.length > 0) {
          user = userResult.data[0]
          docId = user._id || userResult.data[0]._id
        }
        
        if (user && docId) {
          // Parse current expiration date
          let currentExpiresAt: Date | null = null
          if (user.subscription_expires_at !== null && user.subscription_expires_at !== undefined) {
            if (user.subscription_expires_at instanceof Date) {
              currentExpiresAt = user.subscription_expires_at
            } else {
              currentExpiresAt = new Date(user.subscription_expires_at)
            }
            if (isNaN(currentExpiresAt.getTime())) {
              currentExpiresAt = null
            }
          }
          
          // Calculate remaining days
          let daysRemaining = 0
          if (currentExpiresAt) {
            daysRemaining = Math.ceil((currentExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
          }
          
          // Calculate new expiration time
          const isActive = currentExpiresAt && daysRemaining > 0
          
          if (isActive) {
            // Accumulate days if membership is still active
            if (subscriptionType === 'monthly') {
              expiresAt = new Date(currentExpiresAt.getTime() + 30 * 24 * 60 * 60 * 1000)
            } else {
              expiresAt = new Date(currentExpiresAt.getTime() + 365 * 24 * 60 * 60 * 1000)
            }
          } else {
            // Start from current time if expired or no membership
            if (subscriptionType === 'monthly') {
              expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
            } else {
              expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
            }
          }
          
          // Update user subscription using document _id
          await db.collection('users')
            .doc(docId)
            .update({
              subscription_type: subscriptionType,
              subscription_expires_at: expiresAt.toISOString(),
              updated_at: new Date().toISOString()
            })
          
          console.log('[updateUserSubscriptionAfterPayment] CloudBase subscription updated:', {
            userId,
            subscriptionType,
            expiresAt: expiresAt.toISOString()
          })
        } else {
          console.warn('[updateUserSubscriptionAfterPayment] CloudBase user not found:', userId)
          // User not found - this shouldn't happen, but log it
        }
      } catch (error: any) {
        console.error('[updateUserSubscriptionAfterPayment] CloudBase error:', error)
        throw error
      }
    } else {
      // Supabase (Global)
      const supabase = dbClient.supabase
      
      try {
        // Ensure userId is number for Supabase
        const userIdNum = typeof userId === 'string' ? parseInt(userId) : userId
        
        // Query user current subscription
        let { data: user, error: userError } = await supabase
          .from('users')
          .select('id, subscription_type, subscription_expires_at')
          .eq('id', userIdNum)
          .single()
        
        // If user not found, try string ID
        if (!user && userError) {
          const result = await supabase
            .from('users')
            .select('id, subscription_type, subscription_expires_at')
            .eq('id', userId)
            .single()
          if (result.data) {
            user = result.data
          }
        }
        
        if (user) {
          // Parse current expiration date
          const currentExpiresAt = user.subscription_expires_at ? new Date(user.subscription_expires_at) : null
          
          // Calculate remaining days
          let daysRemaining = 0
          if (currentExpiresAt) {
            daysRemaining = Math.ceil((currentExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
          }
          
          // Calculate new expiration time
          const isActive = currentExpiresAt && daysRemaining > 0
          
          if (isActive) {
            // Accumulate days if membership is still active
            if (subscriptionType === 'monthly') {
              expiresAt = new Date(currentExpiresAt.getTime() + 30 * 24 * 60 * 60 * 1000)
            } else {
              expiresAt = new Date(currentExpiresAt.getTime() + 365 * 24 * 60 * 60 * 1000)
            }
          } else {
            // Start from current time if expired or no membership
            if (subscriptionType === 'monthly') {
              expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
            } else {
              expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
            }
          }
          
          // Update user subscription
          const updateUserId = user.id || userIdNum
          
          let { error: updateError } = await supabase
            .from('users')
            .update({
              subscription_type: subscriptionType,
              subscription_expires_at: expiresAt.toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', updateUserId)
          
          // Retry once if update fails
          if (updateError && updateError.code !== '42703') {
            await new Promise(resolve => setTimeout(resolve, 500))
            const retryResult = await supabase
              .from('users')
              .update({
                subscription_type: subscriptionType,
                subscription_expires_at: expiresAt.toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', updateUserId)
            updateError = retryResult.error
          }
          
          if (updateError) {
            console.error('[updateUserSubscriptionAfterPayment] Supabase update error:', updateError)
            throw updateError
          }
        } else {
          // User not found, create new subscription
          if (subscriptionType === 'monthly') {
            expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
          } else {
            expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
          }
          
          const { error: updateError } = await supabase
            .from('users')
            .update({
              subscription_type: subscriptionType,
              subscription_expires_at: expiresAt.toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', userIdNum)
          
          if (updateError) {
            console.error('[updateUserSubscriptionAfterPayment] Supabase create error:', updateError)
            throw updateError
          }
        }
      } catch (error: any) {
        console.error('[updateUserSubscriptionAfterPayment] Supabase error:', error)
        throw error
      }
    }
    
    // Wait a bit for database sync
    await new Promise(resolve => setTimeout(resolve, 1000))
    
  } catch (error: any) {
    console.error('[updateUserSubscriptionAfterPayment] Error:', error)
    // Don't throw error, because payment has already succeeded
    // Subscription update failure shouldn't affect payment flow
  }
}



















































