import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMessages, createMessage } from '@/lib/database/supabase/messages'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { getMessages as getMessagesCN, createMessage as createMessageCN } from '@/lib/database/cloudbase/messages'

// GET /api/messages?conversationId=xxx
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const conversationId = searchParams.get('conversationId')

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      )
    }

    // Verify user is authenticated
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

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    // CN users: read messages from CloudBase
    if (dbClient.type === 'cloudbase' && userRegion === 'cn' && dbClient.cloudbase) {
      const allMessages = await getMessagesCN(conversationId)

      // Filter out hidden messages for this user
      const db = dbClient.cloudbase
      const hiddenRes = await db.collection('hidden_messages')
        .where({
          user_id: user.id,
          region: 'cn',
        })
        .get()

      const hiddenMessageIds = new Set((hiddenRes.data || []).map((h: any) => h.message_id))
      const messages = allMessages.filter(msg => !hiddenMessageIds.has(msg.id))

      return NextResponse.json({
        success: true,
        messages,
      })
    }

    // If we reach here for CN users, need to create supabase client
    const supabase = await createClient()

    // Verify user is a member of the conversation (must check before fetching messages)
    // CRITICAL: Only check memberships that are NOT deleted (deleted_at IS NULL)
    const { data: member, error: memberError } = await supabase
      .from('conversation_members')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .is('deleted_at', null) // Only consider memberships not soft-deleted by this user
      .maybeSingle()
    
    if (!member) {
      console.error('User is not a member of conversation:', { conversationId, userId: user.id, memberError: memberError?.message })
      return NextResponse.json(
        { error: 'Not a member of this conversation' },
        { status: 403 }
      )
    }

    // Get hidden message IDs for this user
    const { data: hiddenMessages } = await supabase
      .from('hidden_messages')
      .select('message_id')
      .eq('user_id', user.id)
    
    const hiddenMessageIds = new Set(hiddenMessages?.map(h => h.message_id) || [])

    // Now fetch messages (getMessages already optimizes queries internally)
    const allMessages = await getMessages(conversationId)
    
    // Filter out hidden messages
    const messages = allMessages.filter(msg => !hiddenMessageIds.has(msg.id))
    console.log('Retrieved messages:', { conversationId, count: messages.length, hiddenCount: hiddenMessageIds.size })
    
    return NextResponse.json({
      success: true,
      messages,
    })
  } catch (error) {
    console.error('Get messages error:', error)
    return NextResponse.json(
      { error: 'Failed to get messages' },
      { status: 500 }
    )
  }
}

// POST /api/messages
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversationId, content, type = 'text', metadata } = body

    // Allow empty content for file/image/video/code messages (content can be empty if metadata has file info or code info)
    const hasFileMetadata = metadata && (metadata.file_url || metadata.file_name)
    const hasCodeMetadata = metadata && (metadata.code_content || metadata.code_language)
    if (!conversationId || (!content && !hasFileMetadata && !hasCodeMetadata && type === 'text')) {
      return NextResponse.json(
        { error: 'conversationId and content are required' },
        { status: 400 }
      )
    }

    // Verify user is authenticated
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

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    // CN: write message into CloudBase messages collection
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      // CRITICAL: For direct conversations, verify that the other user is still in contacts
      // This prevents sending messages to deleted contacts
      const db = dbClient.cloudbase
      const cmd = db.command
      
      // Get conversation type
      const convRes = await db.collection('conversations')
        .doc(conversationId)
        .get()
      
      const conversation = convRes?.data || convRes
      if (conversation?.type === 'direct') {
        // Get the other user in this conversation
        const membersRes = await db.collection('conversation_members')
          .where({
            conversation_id: conversationId,
            user_id: cmd.neq(user.id),
            deleted_at: cmd.exists(false), // Not deleted
          })
          .limit(1)
          .get()
        
        if (membersRes?.data && membersRes.data.length > 0) {
          const otherUserId = membersRes.data[0].user_id
          
          // Check if the other user is still in contacts
          const contactRes = await db.collection('contacts')
            .where({
              user_id: user.id,
              contact_user_id: otherUserId,
              region: 'cn',
            })
            .limit(1)
            .get()
          
          if (!contactRes?.data || contactRes.data.length === 0) {
            // SLACK MODE: 在 Slack 模式下，工作区成员之间可以互相聊天
            // 不需要是联系人关系，所以允许发送消息给非联系人
            console.log(`📤 [SLACK MODE CN] User ${user.id} sending message to workspace member ${otherUserId} (not in contacts)`)
            // console.warn(`❌ User ${user.id} tried to send message to deleted contact ${otherUserId} in conversation ${conversationId}`)
            // return NextResponse.json(
            //   { error: 'Cannot send message: Contact has been deleted' },
            //   { status: 403 }
            // )
          }
        }
      }
      
      const message = await createMessageCN(
        conversationId,
        user.id,
        content || '',
        type,
        metadata,
      )

      return NextResponse.json({
        success: true,
        message,
      })
    }

    // For Supabase users, create supabase client
    const supabase = await createClient()

    // Verify user is a member of the conversation
    // CRITICAL: Only check memberships that are NOT deleted (deleted_at IS NULL)
    const { data: member } = await supabase
      .from('conversation_members')
      .select('id, conversation_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .is('deleted_at', null) // Only consider memberships not soft-deleted by this user
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'Not a member of this conversation' },
        { status: 403 }
      )
    }

    // CRITICAL: For direct conversations, verify that the other user is still in contacts
    // This prevents sending messages to deleted contacts
    const { data: conversation } = await supabase
      .from('conversations')
      .select('type, id')
      .eq('id', conversationId)
      .single()

    if (conversation?.type === 'direct') {
      // Get the other user in this conversation
      const { data: otherMembers } = await supabase
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', user.id)
        .is('deleted_at', null)
        .limit(1)

      if (otherMembers && otherMembers.length > 0) {
        const otherUserId = otherMembers[0].user_id
        
        // Check if the other user is still in contacts
        const { data: contact } = await supabase
          .from('contacts')
          .select('id')
          .eq('user_id', user.id)
          .eq('contact_user_id', otherUserId)
          .maybeSingle()

        if (!contact) {
          // SLACK MODE: 在 Slack 模式下，工作区成员之间可以互相聊天
          // 不需要是联系人关系，所以允许发送消息给非联系人
          console.log(`📤 [SLACK MODE] User ${user.id} sending message to workspace member ${otherUserId} (not in contacts)`)
          // console.warn(`❌ User ${user.id} tried to send message to deleted contact ${otherUserId} in conversation ${conversationId}`)
          // return NextResponse.json(
          //   { error: 'Cannot send message: Contact has been deleted' },
          //   { status: 403 }
          // )
        }
      }
    }

    console.log('📥 API: Creating message:', {
      type,
      contentLength: content?.length || 0,
      hasMetadata: !!metadata,
      metadataKeys: metadata ? Object.keys(metadata) : [],
      code_content: metadata?.code_content?.substring(0, 50),
      code_language: metadata?.code_language
    })
    
    const message = await createMessage(
      conversationId,
      user.id,
      content,
      type,
      metadata
    )
    
    console.log('✅ API: Message created:', {
      id: message.id,
      type: message.type,
      hasMetadata: !!message.metadata,
      metadataKeys: message.metadata ? Object.keys(message.metadata) : []
    })

    return NextResponse.json({
      success: true,
      message,
    })
  } catch (error) {
    console.error('Send message error:', error)
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    )
  }
}

