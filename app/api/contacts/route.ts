import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'

/**
 * Get user's contacts
 * GET /api/contacts
 */
export async function GET(request: NextRequest) {
  try {
    const { IS_DOMESTIC_VERSION } = await import('@/config')

    let currentUser: any = null

    if (IS_DOMESTIC_VERSION) {
      // CN版本：只使用CloudBase认证
      console.log('[GET /api/contacts] 使用CloudBase认证（CN版本）')
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)

      if (!cloudBaseUser) {
        console.error('[GET /api/contacts] CloudBase用户未认证')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      console.log('[GET /api/contacts] CloudBase用户已认证:', cloudBaseUser.id)
      currentUser = cloudBaseUser
    } else {
      // INTL版本：只使用Supabase认证
      console.log('[GET /api/contacts] 使用Supabase认证（INTL版本）')
      const supabase = await createClient()
      const { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser()

      if (authError) {
        console.error('Auth error in contacts API (GET):', authError)
      }

      if (!supabaseUser) {
        console.error('No current user in contacts API (GET). Auth error:', authError)
        return NextResponse.json(
          { error: 'Unauthorized', details: authError?.message || 'No user found' },
          { status: 401 }
        )
      }

      console.log('[GET /api/contacts] Supabase用户已认证:', supabaseUser.id)
      currentUser = supabaseUser
    }

    const supabase = await createClient()

    // Decide which database this user actually uses
    const dbClient = await getDatabaseClientForUser(request)
    const currentRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    // CN users → CloudBase contacts
    if (dbClient.type === 'cloudbase' && currentRegion === 'cn' && dbClient.cloudbase) {
      const db = dbClient.cloudbase
      const cmd = db.command

      const contactsRes = await db
        .collection('contacts')
        .where({
          user_id: currentUser.id,
          is_blocked: false,
          region: 'cn',
        })
        .orderBy('added_at', 'desc')
        .get()

      const contactDocs = contactsRes?.data || []

      const userIds = Array.from(
        new Set(
          contactDocs.map((c: any) => c.contact_user_id).filter(Boolean)
        )
      )

      let usersById = new Map<string, any>()
      if (userIds.length > 0) {
        const usersRes = await db
          .collection('users')
          .where({
            id: cmd.in(userIds),
          })
          .get()
        const userDocs = usersRes?.data || []
        for (const u of userDocs) {
          const uid = u.id || u._id
          if (uid) {
            usersById.set(uid, u)
          }
        }
      }

      const normalizeUser = (u: any) => {
        if (!u) return undefined
        return {
          id: u.id || u._id,
          email: u.email,
          username: u.username || u.email?.split('@')[0] || '',
          full_name: u.full_name || u.name || '',
          avatar_url: u.avatar_url || null,
          department: u.department || undefined,
          title: u.title || undefined,
          status: u.status || 'offline',
          region: u.region || 'cn',
        }
      }

      const contactsWithUsers = contactDocs.map((c: any) => ({
        id: c.id || c._id,
        contact_user_id: c.contact_user_id,
        nickname: c.nickname || null,
        tags: c.tags || [],
        is_favorite: !!c.is_favorite,
        is_blocked: !!c.is_blocked,
        added_at: c.added_at,
        user: normalizeUser(usersById.get(c.contact_user_id)),
      }))

      return NextResponse.json({
        success: true,
        contacts: contactsWithUsers,
      })
    }

    // Global / Supabase users → keep existing Supabase contacts logic
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('region')
      .eq('id', currentUser.id)
      .maybeSingle()

    if (profileError) {
      console.error('Failed to load current user region in contacts API (GET):', profileError)
    }

    const currentRegionSupabase = profile?.region === 'cn' ? 'cn' : 'global'

    // Get contacts with user details
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select(`
        id,
        contact_user_id,
        nickname,
        tags,
        is_favorite,
        is_blocked,
        added_at,
        users!contacts_contact_user_id_fkey (
          id,
          email,
          username,
          full_name,
          avatar_url,
          department,
          title,
          status,
          region
        )
      `)
      .eq('user_id', currentUser.id)
      .eq('is_blocked', false) // Exclude blocked contacts
      .order('is_favorite', { ascending: false })
      .order('added_at', { ascending: false })

    if (error) {
      console.error('Get contacts error:', error)
      return NextResponse.json(
        { error: 'Failed to get contacts' },
        { status: 500 }
      )
    }

    // Transform contacts to include user data
    const contactsWithUsers = (contacts || [])
      .map((contact: any) => ({
        ...contact,
        user: contact.users,
      }))
      .filter((contact) => {
        const region = contact.user?.region || 'global'
        return region === currentRegionSupabase
      })

    return NextResponse.json({
      success: true,
      contacts: contactsWithUsers,
    })
  } catch (error: any) {
    console.error('Get contacts error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get contacts' },
      { status: 500 }
    )
  }
}

/**
 * Add a contact
 * POST /api/contacts
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { contact_user_id, nickname, tags, is_favorite } = body

    if (!contact_user_id) {
      return NextResponse.json(
        { error: 'contact_user_id is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get current user
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('region')
      .eq('id', currentUser.id)
      .maybeSingle()

    if (profileError) {
      console.error('Failed to load current user region in contacts API (POST):', profileError)
    }

    const currentRegion = profile?.region === 'cn' ? 'cn' : 'global'

    // Check if contact already exists
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('contact_user_id', contact_user_id)
      .single()

    if (existingContact) {
      return NextResponse.json(
        { error: 'Contact already exists' },
        { status: 400 }
      )
    }

    // Check if trying to add self
    if (contact_user_id === currentUser.id) {
      return NextResponse.json(
        { error: 'Cannot add yourself as a contact' },
        { status: 400 }
      )
    }

    // Verify contact user exists
    const { data: contactUser } = await supabase
      .from('users')
      .select('id, region')
      .eq('id', contact_user_id)
      .single()

    if (!contactUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    if ((contactUser.region || 'global') !== currentRegion) {
      return NextResponse.json(
        { error: 'Cross-region contacts are not allowed' },
        { status: 400 }
      )
    }

    // Add contact
    const { data: newContact, error: insertError } = await supabase
      .from('contacts')
      .insert({
        user_id: currentUser.id,
        contact_user_id,
        nickname: nickname || null,
        tags: tags || [],
        is_favorite: is_favorite || false,
        is_blocked: false,
      })
      .select(`
        *,
        users!contacts_contact_user_id_fkey (
          id,
          email,
          username,
          full_name,
          avatar_url,
          department,
          title,
          status
        )
      `)
      .single()

    if (insertError) {
      console.error('Add contact error:', insertError)
      return NextResponse.json(
        { error: insertError.message || 'Failed to add contact' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      contact: {
        ...newContact,
        user: (newContact as any).users,
      },
    })
  } catch (error: any) {
    console.error('Add contact error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add contact' },
      { status: 500 }
    )
  }
}

/**
 * Delete a contact (remove friend)
 * DELETE /api/contacts?contact_user_id=xxx
 */
export async function DELETE(request: NextRequest) {
  try {
    const { IS_DOMESTIC_VERSION } = await import('@/config')

    let currentUser: any = null

    if (IS_DOMESTIC_VERSION) {
      // CN版本：只使用CloudBase认证
      console.log('[DELETE /api/contacts] 使用CloudBase认证（CN版本）')
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)

      if (!cloudBaseUser) {
        console.error('[DELETE /api/contacts] CloudBase用户未认证')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      console.log('[DELETE /api/contacts] CloudBase用户已认证:', cloudBaseUser.id)
      currentUser = cloudBaseUser
    } else {
      // INTL版本：只使用Supabase认证
      console.log('[DELETE /api/contacts] 使用Supabase认证（INTL版本）')
      const supabase = await createClient()
      const { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser()

      if (authError || !supabaseUser) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }

      currentUser = supabaseUser
    }

    const supabase = await createClient()

    // Get contact_user_id from query params
    const { searchParams } = new URL(request.url)
    const contact_user_id = searchParams.get('contact_user_id')

    if (!contact_user_id) {
      return NextResponse.json(
        { error: 'contact_user_id is required' },
        { status: 400 }
      )
    }

    // Check if trying to delete self
    if (contact_user_id === currentUser.id) {
      return NextResponse.json(
        { error: 'Cannot delete yourself as a contact' },
        { status: 400 }
      )
    }

    // Decide which database this user actually uses
    const dbClient = await getDatabaseClientForUser(request)
    const currentRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    // CN users → CloudBase contacts
    if (dbClient.type === 'cloudbase' && currentRegion === 'cn' && dbClient.cloudbase) {
      const db = dbClient.cloudbase

      try {
        let deletedConversationId: string | null = null

        // Delete bidirectional contact relationships
        // 1. Delete current user -> contact user relationship
        const deleteRes1 = await db
          .collection('contacts')
          .where({
            user_id: currentUser.id,
            contact_user_id: contact_user_id,
          })
          .remove()
        // 1b. Fallback for legacy docs lacking region
        if (!deleteRes1?.deleted || deleteRes1.deleted === 0) {
          await db
            .collection('contacts')
            .where({
              user_id: currentUser.id,
              contact_user_id: contact_user_id,
            })
            .remove()
        }

        // 2. Delete contact user -> current user relationship (if exists)
        const deleteRes2 = await db
          .collection('contacts')
          .where({
            user_id: contact_user_id,
            contact_user_id: currentUser.id,
          })
          .remove()
        // 2b. Fallback for legacy docs lacking region
        if (!deleteRes2?.deleted || deleteRes2.deleted === 0) {
          await db
            .collection('contacts')
            .where({
              user_id: contact_user_id,
              contact_user_id: currentUser.id,
            })
            .remove()
        }

        // 3. Find and delete direct conversation between the two users
        try {
          // Find conversation_members where both users are members
          const membersRes1 = await db
            .collection('conversation_members')
            .where({
              user_id: currentUser.id,
            })
            .get()

          const membersRes2 = await db
            .collection('conversation_members')
            .where({
              user_id: contact_user_id,
            })
            .get()

          const user1ConversationIds = new Set(
            (membersRes1?.data || []).map((m: any) => m.conversation_id).filter(Boolean)
          )
          const user2ConversationIds = new Set(
            (membersRes2?.data || []).map((m: any) => m.conversation_id).filter(Boolean)
          )

          // Find common conversation IDs (direct conversations between the two users)
          const commonConversationIds = Array.from(user1ConversationIds).filter((id) => 
            typeof id === 'string' && user2ConversationIds.has(id)
          ) as string[]

          // For each common conversation, check if it's a direct conversation with exactly 2 members
          for (const convId of commonConversationIds) {
            const convRes = await db
              .collection('conversations')
              .doc(convId)
              .get()

            const conv = convRes?.data || convRes
            if (conv && conv.type === 'direct') {
              // Check member count
              const allMembersRes = await db
                .collection('conversation_members')
                .where({
                  conversation_id: convId,
                })
                .get()

              const memberCount = (allMembersRes?.data || []).length
              if (memberCount === 2) {
                // This is a direct conversation between the two users, soft delete it for BOTH users
                const now = new Date().toISOString()
                
                // Find both membership documents
                const userMembershipRes = await db
                  .collection('conversation_members')
                  .where({
                    conversation_id: convId,
                    user_id: currentUser.id,
                  })
                  .get()

                const contactMembershipRes = await db
                  .collection('conversation_members')
                  .where({
                    conversation_id: convId,
                    user_id: contact_user_id,
                  })
                  .get()

                const currentUserMembership = userMembershipRes.data?.[0]
                const contactUserMembership = contactMembershipRes.data?.[0]

                // Soft delete for current user
                if (currentUserMembership) {
                  await db
                    .collection('conversation_members')
                    .doc(currentUserMembership._id)
                    .update({
                      deleted_at: now,
                    })
                  deletedConversationId = convId
                  console.log(`✅ Soft deleted CloudBase conversation ${convId} for user ${currentUser.id}`, {
                    membershipId: currentUserMembership._id,
                    deletedAt: now
                  })
                } else {
                  console.warn(`⚠️ Could not find membership to delete for conversation ${convId} and user ${currentUser.id}`)
                }
                
                // Soft delete for contact user (the other party)
                if (contactUserMembership) {
                  await db
                    .collection('conversation_members')
                    .doc(contactUserMembership._id)
                    .update({
                      deleted_at: now,
                    })
                  console.log(`✅ Soft deleted CloudBase conversation ${convId} for contact user ${contact_user_id}`, {
                    membershipId: contactUserMembership._id,
                    deletedAt: now
                  })
                } else {
                  console.warn(`⚠️ Could not find membership to delete for conversation ${convId} and contact user ${contact_user_id}`)
                }
              }
            }
          }
        } catch (convError: any) {
          // Don't fail contact deletion if conversation deletion fails
          console.error('Failed to delete conversation when deleting contact:', convError)
        }

        return NextResponse.json({
          success: true,
          message: 'Contact deleted successfully',
          deletedConversationId,
        })
      } catch (cloudbaseError: any) {
        console.error('CloudBase delete contact error:', cloudbaseError)
        return NextResponse.json(
          { error: cloudbaseError.message || 'Failed to delete contact' },
          { status: 500 }
        )
      }
    }

    // Global / Supabase users → Supabase contacts
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('region')
      .eq('id', currentUser.id)
      .maybeSingle()

    if (profileError) {
      console.error('Failed to load current user region in contacts API (DELETE):', profileError)
    }

    // Delete bidirectional contact relationships
    // 1. Delete current user -> contact user relationship
    const { error: deleteError1 } = await supabase
      .from('contacts')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('contact_user_id', contact_user_id)

    if (deleteError1) {
      console.error('Delete contact error (direction 1):', deleteError1)
      return NextResponse.json(
        { error: deleteError1.message || 'Failed to delete contact' },
        { status: 500 }
      )
    }

    // 2. Delete contact user -> current user relationship (if exists)
    const { error: deleteError2 } = await supabase
      .from('contacts')
      .delete()
      .eq('user_id', contact_user_id)
      .eq('contact_user_id', currentUser.id)

    if (deleteError2) {
      console.error('Delete contact error (direction 2):', deleteError2)
      // Don't fail if reverse relationship doesn't exist
    }

    // 4. Delete contact_requests when contact is deleted
    // This ensures that when users re-add each other, they can create fresh requests
    try {
      const { error: deleteRequestsError } = await supabase
        .from('contact_requests')
        .delete()
        .or(`and(requester_id.eq.${currentUser.id},recipient_id.eq.${contact_user_id}),and(requester_id.eq.${contact_user_id},recipient_id.eq.${currentUser.id})`)
      
      if (deleteRequestsError) {
        console.error('Failed to delete contact_requests after contact deletion:', deleteRequestsError)
        // Don't fail contact deletion if request deletion fails
      } else {
        console.log('✅ Deleted contact_requests after contact deletion')
      }
    } catch (requestError: any) {
      console.error('Failed to delete contact_requests after contact deletion:', requestError)
      // Don't fail contact deletion if request deletion fails
    }

    // 3. Find and delete direct conversation between the two users
    let deletedConversationId: string | null = null
    try {
      console.log(`🔍 Looking for direct conversation between ${currentUser.id} and ${contact_user_id}`)
      const { data: existingConv, error: findError } = await supabase
        .rpc('find_direct_conversation', {
          p_user1_id: currentUser.id,
          p_user2_id: contact_user_id
        })

      if (findError) {
        console.error('❌ Error finding direct conversation:', findError)
      } else if (!existingConv || existingConv.length === 0) {
        console.log('ℹ️ No direct conversation found between users')
      } else {
        const conversationId = existingConv[0].id
        deletedConversationId = conversationId
        console.log(`✅ Found direct conversation: ${conversationId}`)
        
        const deletedAt = new Date().toISOString()
        
        // Soft delete the conversation for BOTH users
        // 1. Soft delete for current user
        const { data: updateData1, error: deleteConvError1 } = await supabase
          .from('conversation_members')
          .update({ deleted_at: deletedAt })
          .eq('conversation_id', conversationId)
          .eq('user_id', currentUser.id)
          .select()

        if (deleteConvError1) {
          console.error('❌ Failed to delete conversation for current user:', deleteConvError1)
        } else {
          console.log(`✅ Soft deleted conversation ${conversationId} for user ${currentUser.id}`, {
            updatedRows: updateData1?.length || 0
          })
        }
        
        // 2. Soft delete for contact user (the other party)
        const { data: updateData2, error: deleteConvError2 } = await supabase
          .from('conversation_members')
          .update({ deleted_at: deletedAt })
          .eq('conversation_id', conversationId)
          .eq('user_id', contact_user_id)
          .select()

        if (deleteConvError2) {
          console.error('❌ Failed to delete conversation for contact user:', deleteConvError2)
          // Don't fail contact deletion if conversation deletion fails
        } else {
          console.log(`✅ Soft deleted conversation ${conversationId} for contact user ${contact_user_id}`, {
            updatedRows: updateData2?.length || 0
          })
        }
        
        // Verify at least one update was successful
        if ((!updateData1 || updateData1.length === 0) && (!updateData2 || updateData2.length === 0)) {
          console.warn('⚠️ Both updates returned 0 rows - conversation members may not exist or already deleted')
        }
      }
    } catch (convError: any) {
      // Don't fail contact deletion if conversation deletion fails
      console.error('❌ Exception when deleting conversation:', convError)
    }

    return NextResponse.json({
      success: true,
      message: 'Contact deleted successfully',
      deletedConversationId: deletedConversationId, // Return conversation ID so frontend can update
    })
  } catch (error: any) {
    console.error('Delete contact error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete contact' },
      { status: 500 }
    )
  }
}

/**
 * Update contact favorite status
 * PATCH /api/contacts?contactUserId=xxx
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const contactUserId = searchParams.get('contactUserId')
    const body = await request.json()
    const { is_favorite } = body

    if (!contactUserId) {
      return NextResponse.json(
        { error: 'contactUserId is required' },
        { status: 400 }
      )
    }

    if (typeof is_favorite !== 'boolean') {
      return NextResponse.json(
        { error: 'is_favorite must be a boolean' },
        { status: 400 }
      )
    }

    // Update contact
    const { data: updatedContact, error: updateError } = await supabase
      .from('contacts')
      .update({ is_favorite })
      .eq('user_id', currentUser.id)
      .eq('contact_user_id', contactUserId)
      .select(`
        *,
        users!contacts_contact_user_id_fkey (
          id,
          email,
          username,
          full_name,
          avatar_url,
          department,
          title,
          status,
          status_message,
          phone,
          created_at,
          updated_at
        )
      `)
      .single()

    if (updateError) {
      console.error('Update contact favorite error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update contact favorite status' },
        { status: 500 }
      )
    }

    if (!updatedContact) {
      return NextResponse.json(
        { error: 'Contact not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      contact: updatedContact,
    })
  } catch (error: any) {
    console.error('Update contact favorite error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update contact favorite status' },
      { status: 500 }
    )
  }
}

