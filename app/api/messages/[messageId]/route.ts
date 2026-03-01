import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateMessage, deleteMessage, recallMessage } from '@/lib/database/supabase/messages'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { updateMessage as updateMessageCN, deleteMessage as deleteMessageCN, recallMessage as recallMessageCN, hideMessage as hideMessageCN, unhideMessage as unhideMessageCN } from '@/lib/database/cloudbase/messages'

// PUT /api/messages/[messageId] - Update message
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> | { messageId: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const messageId = resolvedParams.messageId

    if (!messageId) {
      return NextResponse.json(
        { error: 'messageId is required' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { content, metadata } = body

    // Allow updating metadata without content (for call status updates)
    if (!content && !metadata) {
      return NextResponse.json(
        { error: 'content or metadata is required' },
        { status: 400 }
      )
    }

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'
    const isCloudbase = dbClient.type === 'cloudbase' && userRegion === 'cn'

    let supabase: Awaited<ReturnType<typeof createClient>> | null = null
    let user: { id: string } | null = null

    if (isCloudbase) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (cloudBaseUser) {
        user = { id: cloudBaseUser.id }
      }
    } else {
      supabase = dbClient.supabase || await createClient()
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()
      if (supabaseUser) {
        user = { id: supabaseUser.id }
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // CN: permission + update in CloudBase
    if (isCloudbase) {
      // Ensure the message exists and user is sender
      const db = dbClient.cloudbase
      const res = await db.collection('messages').doc(messageId).get()
      const m = res?.data || res
      if (!m) {
        return NextResponse.json(
          { error: 'Message not found' },
          { status: 404 }
        )
      }
      // Convert both to string for comparison
      const messageSenderId = String(m.sender_id || '')
      const currentUserId = String(user.id || '')
      const isSender = messageSenderId === currentUserId
      
      // For call messages, allow recipient to update call status
      const isCallMessage = m.type === 'system' && m.metadata?.call_type
      const isUpdatingCallStatus = metadata && (metadata.call_status === 'answered' || metadata.call_status === 'missed' || metadata.call_status === 'cancelled' || metadata.call_status === 'ended')
      let isRecipient = false
      
      if (isCallMessage && isUpdatingCallStatus && !isSender) {
        // Check if user is a member of the conversation
        try {
          // First try exact lookup.
          // Some CloudBase environments may miss a compound index on (conversation_id, user_id),
          // so we keep a fallback query to avoid false negatives.
          const convRes = await db.collection('conversation_members')
            .where({
              conversation_id: m.conversation_id,
              user_id: String(user.id),
            })
            .get()

          let membershipRows = Array.isArray(convRes?.data) ? convRes.data : []

          if (membershipRows.length === 0) {
            const fallbackRes = await db.collection('conversation_members')
              .where({ conversation_id: m.conversation_id })
              .get()
            const fallbackRows = Array.isArray(fallbackRes?.data) ? fallbackRes.data : []
            membershipRows = fallbackRows.filter((row: any) => String(row.user_id) === String(user.id))
          }

          isRecipient = membershipRows.some((row: any) => !row.deleted_at)

          // Fallback for legacy/direct conversations where conversation_members
          // was not written correctly in older CloudBase flows.
          if (!isRecipient) {
            const callerId = String(m?.metadata?.caller_id || '')
            if (callerId && callerId !== String(user.id)) {
              const contactsRes = await db.collection('contacts')
                .where({
                  user_id: String(user.id),
                  contact_user_id: callerId,
                  region: 'cn',
                })
                .limit(1)
                .get()

              const reverseContactsRes = await db.collection('contacts')
                .where({
                  user_id: callerId,
                  contact_user_id: String(user.id),
                  region: 'cn',
                })
                .limit(1)
                .get()

              isRecipient =
                (Array.isArray(contactsRes?.data) && contactsRes.data.length > 0) ||
                (Array.isArray(reverseContactsRes?.data) && reverseContactsRes.data.length > 0)
            }
          }
        } catch (error) {
          console.error('Failed to check conversation membership:', error)
        }
      }
      
      if (!isSender && !(isCallMessage && isUpdatingCallStatus && isRecipient)) {
        console.error('Edit authorization failed:', {
          messageId,
          messageSenderId,
          currentUserId,
          isCallMessage,
          isUpdatingCallStatus,
          isRecipient,
        })
        return NextResponse.json(
          { error: 'Not authorized to edit this message' },
          { status: 403 }
        )
      }

      const updatedMessage = await updateMessageCN(messageId, content, metadata)
      if (!updatedMessage) {
        return NextResponse.json(
          { error: 'Failed to update message' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: updatedMessage,
      })
    }

    if (!supabase) {
      return NextResponse.json(
        { error: 'Database client unavailable' },
        { status: 500 }
      )
    }

    // Verify user is the sender of the message, OR it's a call message and user is the recipient
    const { data: message } = await supabase
      .from('messages')
      .select('sender_id, type, metadata, conversation_id')
      .eq('id', messageId)
      .single()

    if (!message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }

    // Allow update if:
    // 1. User is the sender, OR
    // 2. It's a system call message and user is updating call status (for answering/rejecting calls)
    const isCallMessage = message.type === 'system' && message.metadata?.call_type
    const isUpdatingCallStatus = metadata && (metadata.call_status === 'answered' || metadata.call_status === 'missed' || metadata.call_status === 'cancelled' || metadata.call_status === 'ended')
    const isSender = message.sender_id === user.id

    console.log('[API] 权限检查:', {
      messageId,
      isCallMessage,
      isUpdatingCallStatus,
      callStatus: metadata?.call_status,
      isSender,
      messageSenderId: message.sender_id,
      currentUserId: user.id,
    })
    
    // For call messages, also check if user is in the conversation (recipient can update call status)
    let isRecipient = false
    if (isCallMessage && isUpdatingCallStatus && !isSender) {
      // Check if user is a member of the conversation
      const { data: membership, error: membershipError } = await supabase
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', message.conversation_id)
        .eq('user_id', user.id)
        .maybeSingle()
      
      // maybeSingle() returns null if no record found (no error), or data if found
      isRecipient = !!membership && !membershipError

      console.log('[API] 会话成员检查:', {
        messageId,
        conversationId: message.conversation_id,
        userId: user.id,
        membership,
        isRecipient,
        membershipError: membershipError?.message,
      })
      
      if (membershipError) {
        console.warn('[API] Error checking conversation membership:', membershipError)
      }
    }

    if (!isSender && !(isCallMessage && isUpdatingCallStatus && isRecipient)) {
      console.error('[API] ❌ Authorization failed:', {
        messageId,
        isSender,
        isCallMessage,
        isUpdatingCallStatus,
        isRecipient,
        callStatus: metadata?.call_status,
      })
      return NextResponse.json(
        { error: 'Not authorized to edit this message' },
        { status: 403 }
      )
    }

    console.log('[API] ✅ 授权检查通过:', {
      messageId,
      isSender,
      isCallMessage,
      isUpdatingCallStatus,
      isRecipient,
    })

    // For call messages, merge metadata instead of replacing
    let finalMetadata = metadata
    if (isCallMessage && metadata) {
      // 确保 metadata 是对象
      const existingMetadata = message.metadata || {}
      finalMetadata = {
        ...existingMetadata,
        ...metadata,
      }
      console.log('[API] 合并通话元数据:', {
        existing: existingMetadata,
        new: metadata,
        final: finalMetadata,
      })
    }

    // 减少日志输出：只在错误时输出
    try {
      const updatedMessage = await updateMessage(messageId, content, finalMetadata)

      if (!updatedMessage) {
        console.error('[API] updateMessage returned null:', {
          messageId,
          isCallMessage,
          isUpdatingCallStatus,
          userId: user.id,
        })
        return NextResponse.json(
          { error: 'Failed to update message. Check server logs for details.' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: updatedMessage,
      })
    } catch (error: any) {
      console.error('[API] Exception in updateMessage:', {
        error: error?.message || error,
        stack: error?.stack,
        messageId,
      })
      return NextResponse.json(
        { error: `Failed to update message: ${error?.message || 'Unknown error'}` },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Edit message error:', error)
    return NextResponse.json(
      { error: 'Failed to edit message' },
      { status: 500 }
    )
  }
}

// DELETE /api/messages/[messageId] - Delete message
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> | { messageId: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const messageId = resolvedParams.messageId

    if (!messageId) {
      return NextResponse.json(
        { error: 'messageId is required' },
        { status: 400 }
      )
    }

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'
    const isCloudbase = dbClient.type === 'cloudbase' && userRegion === 'cn'

    let supabase: Awaited<ReturnType<typeof createClient>> | null = null
    let user: { id: string } | null = null

    if (isCloudbase) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (cloudBaseUser) {
        user = { id: cloudBaseUser.id }
      }
    } else {
      supabase = dbClient.supabase || await createClient()
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()
      if (supabaseUser) {
        user = { id: supabaseUser.id }
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (isCloudbase) {
      const db = dbClient.cloudbase
      const res = await db.collection('messages').doc(messageId).get()
      const m = res?.data || res
      if (!m) {
        return NextResponse.json(
          { error: 'Message not found' },
          { status: 404 }
        )
      }
      // Convert both to string for comparison
      const messageSenderId = String(m.sender_id || '')
      const currentUserId = String(user.id || '')
      if (messageSenderId !== currentUserId) {
        console.error('Delete authorization failed:', {
          messageId,
          messageSenderId,
          currentUserId,
        })
        return NextResponse.json(
          { error: 'Not authorized to delete this message' },
          { status: 403 }
        )
      }

      const deletedMessage = await deleteMessageCN(messageId)
      if (!deletedMessage) {
        return NextResponse.json(
          { error: 'Failed to delete message' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: deletedMessage,
      })
    }

    if (!supabase) {
      return NextResponse.json(
        { error: 'Database client unavailable' },
        { status: 500 }
      )
    }

    // Verify user is the sender of the message
    const { data: message } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('id', messageId)
      .single()

    if (!message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }

    if (message.sender_id !== user.id) {
      return NextResponse.json(
        { error: 'Not authorized to delete this message' },
        { status: 403 }
      )
    }

    const deletedMessage = await deleteMessage(messageId)

    if (!deletedMessage) {
      return NextResponse.json(
        { error: 'Failed to delete message' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: deletedMessage,
    })
  } catch (error) {
    console.error('Delete message error:', error)
    return NextResponse.json(
      { error: 'Failed to delete message' },
      { status: 500 }
    )
  }
}

// PATCH /api/messages/[messageId] - Hide/unhide message or recall message
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> | { messageId: string } }
) {
  try {

    // Handle Next.js 15+ async params
    const resolvedParams = await Promise.resolve(params)
    const messageId = resolvedParams.messageId

    if (!messageId) {
      console.error('[MESSAGE RECALL] messageId 缺失')
      return NextResponse.json(
        { error: 'messageId is required' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { action } = body // 'hide', 'unhide', or 'recall'

    console.log('[MESSAGE RECALL] 收到请求:', {
      messageId,
      action
    })

    if (!action || !['hide', 'unhide', 'recall'].includes(action)) {
      console.error('[MESSAGE RECALL] 无效的 action:', action)
      return NextResponse.json(
        { error: 'action must be "hide", "unhide", or "recall"' },
        { status: 400 }
      )
    }

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'
    const isCloudbase = dbClient.type === 'cloudbase' && userRegion === 'cn'

    let supabase: Awaited<ReturnType<typeof createClient>> | null = null
    let user: { id: string } | null = null

    if (isCloudbase) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (cloudBaseUser) {
        user = { id: cloudBaseUser.id }
      }
    } else {
      supabase = dbClient.supabase || await createClient()
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()
      if (supabaseUser) {
        user = { id: supabaseUser.id }
      }
    }

    if (!user) {
      console.error('[MESSAGE RECALL] 用户未认证')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[MESSAGE RECALL] 数据库客户端:', {
      type: dbClient.type,
      region: userRegion
    })

    // CN recall / hide / unhide via CloudBase
    if (isCloudbase) {

      const db = dbClient.cloudbase
      const res = await db.collection('messages').doc(messageId).get()

      console.log('[MESSAGE RECALL] CloudBase 查询结果:', {
        hasRes: !!res,
        resType: typeof res,
        resKeys: res ? Object.keys(res) : [],
        hasData: !!(res && res.data),
        dataType: res?.data ? typeof res.data : 'undefined',
        dataIsArray: Array.isArray(res?.data)
      })

      // CloudBase may return data in different formats - try multiple ways
      let m: any = null

      // Try res.data first (most common)
      if (res && res.data) {
        if (Array.isArray(res.data)) {
          m = res.data[0]
        } else {
          m = res.data
        }
      }

      // If res.data doesn't work, try res directly
      if (!m && res && typeof res === 'object') {
        // Check if res itself has the message fields
        if (res.sender_id !== undefined || res._id !== undefined) {
          m = res
        }
      }

      // Last resort: try accessing nested properties
      if (!m && res) {
        // Sometimes CloudBase wraps data in different structures
        const possiblePaths = [
          res.data,
          res.result,
          res.document,
          res,
        ]
        for (const path of possiblePaths) {
          if (path && typeof path === 'object') {
            if (Array.isArray(path) && path.length > 0) {
              m = path[0]
              break
            } else if (path.sender_id !== undefined || path._id !== undefined) {
              m = path
              break
            }
          }
        }
      }

      if (!m) {
        console.error('[MESSAGE RECALL] ❌ CloudBase 消息未找到:', {
          messageId,
          res,
          resType: typeof res,
          resKeys: res ? Object.keys(res) : [],
          resData: res?.data,
          resDataType: typeof res?.data,
        })
        return NextResponse.json(
          { error: 'Message not found' },
          { status: 404 }
        )
      }

      // Log the raw message data for debugging
      console.log('[MESSAGE RECALL] CloudBase 消息数据:', {
        messageId,
        sender_id: m.sender_id,
        sender_id_type: typeof m.sender_id,
        user_id: user.id,
        user_id_type: typeof user.id,
        messageKeys: Object.keys(m),
        full_message: JSON.stringify(m, null, 2).substring(0, 1000),
      })
      
      // Check if sender_id exists
      if (m.sender_id === undefined || m.sender_id === null) {
        console.error('[MESSAGE RECALL] ❌ CloudBase 消息缺少 sender_id:', {
          messageId,
          messageKeys: Object.keys(m),
          fullMessage: JSON.stringify(m, null, 2),
          resStructure: JSON.stringify({
            hasData: !!res.data,
            resKeys: Object.keys(res || {}),
            resDataKeys: res?.data ? Object.keys(res.data) : [],
          }),
        })
        return NextResponse.json(
          { error: 'Message data is invalid: missing sender_id' },
          { status: 500 }
        )
      }

      if (action === 'recall') {

        // Convert both to string for comparison (CloudBase may store as string or number)
        // Try multiple comparison methods to handle different formats
        const messageSenderId = String(m.sender_id || '').trim()
        const currentUserId = String(user.id || '').trim()

        // Also try comparing as numbers if they look like numbers
        const messageSenderIdNum = Number(m.sender_id)
        const currentUserIdNum = Number(user.id)
        const numericMatch = !isNaN(messageSenderIdNum) && !isNaN(currentUserIdNum) && messageSenderIdNum === currentUserIdNum

        const stringMatch = messageSenderId === currentUserId
        const isAuthorized = stringMatch || numericMatch

        console.log('[MESSAGE RECALL] 权限验证:', {
          messageId,
          messageSenderId,
          currentUserId,
          messageSenderIdType: typeof m.sender_id,
          currentUserIdType: typeof user.id,
          rawSenderId: m.sender_id,
          rawUserId: user.id,
          stringMatch,
          numericMatch,
          isAuthorized,
        })

        if (!isAuthorized) {
          console.error('[MESSAGE RECALL] ❌ 撤回权限验证失败:', {
            messageId,
            messageSenderId,
            currentUserId,
            messageSenderIdType: typeof m.sender_id,
            currentUserIdType: typeof user.id,
            rawSenderId: m.sender_id,
            rawUserId: user.id,
            stringMatch,
            numericMatch,
            messageData: {
              _id: m._id,
              sender_id: m.sender_id,
              conversation_id: m.conversation_id,
              created_at: m.created_at,
            },
          })
          return NextResponse.json(
            {
              error: 'Not authorized to recall this message',
              debug: {
                messageSenderId,
                currentUserId,
                messageSenderIdType: typeof m.sender_id,
                currentUserIdType: typeof user.id,
              }
            },
            { status: 403 }
          )
        }


        // Check if message is already recalled or deleted
        if (m.is_recalled) {
          console.error('[MESSAGE RECALL] 消息已被撤回')
          return NextResponse.json(
            { error: 'Message is already recalled' },
            { status: 400 }
          )
        }

        if (m.is_deleted) {
          console.error('[MESSAGE RECALL] 无法撤回已删除的消息')
          return NextResponse.json(
            { error: 'Cannot recall a deleted message' },
            { status: 400 }
          )
        }

        // 无时间限制，任何时候都可以撤回

        const recalled = await recallMessageCN(messageId)

        console.log('[MESSAGE RECALL] CloudBase 撤回结果:', {
          success: !!recalled,
          messageId
        })

        if (!recalled) {
          console.error('[MESSAGE RECALL] ❌ 撤回操作失败')
          return NextResponse.json(
            { error: 'Failed to recall message' },
            { status: 500 }
          )
        }


        return NextResponse.json({
          success: true,
          message: recalled,
        })
      }

      // Handle hide/unhide actions for CloudBase
      if (action === 'hide') {
        const success = await hideMessageCN(messageId, user.id)
        if (!success) {
          return NextResponse.json(
            { error: 'Failed to hide message' },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          action,
          messageId: messageId,
        })
      } else if (action === 'unhide') {
        const success = await unhideMessageCN(messageId, user.id)
        if (!success) {
          return NextResponse.json(
            { error: 'Failed to unhide message' },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          action,
          messageId: messageId,
        })
      }

      return NextResponse.json(
        { error: 'Invalid action for CloudBase' },
        { status: 400 }
      )
    }

    if (!supabase) {
      return NextResponse.json(
        { error: 'Database client unavailable' },
        { status: 500 }
      )
    }

    // Handle recall action (Supabase)
    if (action === 'recall') {

      // Verify user is the sender of the message
      const { data: message, error: messageError } = await supabase
        .from('messages')
        .select('sender_id, created_at, is_recalled, is_deleted')
        .eq('id', messageId)
        .single()

      if (messageError) {
        console.error('[MESSAGE RECALL] ❌ 获取消息失败:', {
          messageError,
          message: messageError.message,
          messageId
        })
        return NextResponse.json(
          { error: `Database error: ${messageError.message}` },
          { status: 500 }
        )
      }

      if (!message) {
        console.error('[MESSAGE RECALL] ❌ 消息未找到:', messageId)
        return NextResponse.json(
          { error: 'Message not found' },
          { status: 404 }
        )
      }

      console.log('[MESSAGE RECALL] Supabase 消息数据:', {
        messageId,
        senderId: message.sender_id,
        userId: user.id,
        isRecalled: message.is_recalled,
        isDeleted: message.is_deleted,
        createdAt: message.created_at
      })

      if (message.sender_id !== user.id) {
        console.error('[MESSAGE RECALL] ❌ 权限验证失败:', {
          messageSenderId: message.sender_id,
          currentUserId: user.id
        })
        return NextResponse.json(
          { error: 'Not authorized to recall this message' },
          { status: 403 }
        )
      }


      if (message.is_recalled) {
        console.error('[MESSAGE RECALL] 消息已被撤回')
        return NextResponse.json(
          { error: 'Message is already recalled' },
          { status: 400 }
        )
      }

      if (message.is_deleted) {
        console.error('[MESSAGE RECALL] 无法撤回已删除的消息')
        return NextResponse.json(
          { error: 'Cannot recall a deleted message' },
          { status: 400 }
        )
      }

      // 无时间限制，任何时候都可以撤回

      const recalledMessage = await recallMessage(messageId)

      console.log('[MESSAGE RECALL] Supabase 撤回结果:', {
        success: !!recalledMessage,
        messageId
      })

      if (!recalledMessage) {
        console.error('[MESSAGE RECALL] ❌ 撤回操作失败')
        return NextResponse.json(
          { error: 'Failed to recall message' },
          { status: 500 }
        )
      }


      return NextResponse.json({
        success: true,
        message: recalledMessage,
      })
    }

    // Handle hide/unhide actions
    // Verify message exists
    const { data: message } = await supabase
      .from('messages')
      .select('id')
      .eq('id', messageId)
      .single()

    if (!message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }

    if (action === 'hide') {
      const { error } = await supabase
        .from('hidden_messages')
        .upsert({
          user_id: user.id,
          message_id: messageId,
        }, { onConflict: 'user_id,message_id' })

      if (error) {
        console.error('Failed to hide message:', error)
        return NextResponse.json(
          { error: 'Failed to hide message' },
          { status: 500 }
        )
      }
    } else {
      const { error } = await supabase
        .from('hidden_messages')
        .delete()
        .eq('user_id', user.id)
        .eq('message_id', messageId)

      if (error) {
        console.error('Failed to unhide message:', error)
        return NextResponse.json(
          { error: 'Failed to unhide message' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      action,
      messageId: messageId,
    })
  } catch (error) {
    console.error('Hide/unhide/recall message error:', error)
    return NextResponse.json(
      { error: 'Failed to process message action' },
      { status: 500 }
    )
  }
}
