import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Accept or reject a contact request
 * PATCH /api/contact-requests/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { action } = body // 'accept' or 'reject'

    if (!action || !['accept', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "accept" or "reject"' },
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

    // Get the request
    const { data: requestData, error: fetchError } = await supabase
      .from('contact_requests')
      .select('*')
      .eq('id', params.id)
      .eq('recipient_id', currentUser.id) // Only recipient can accept/reject
      .eq('status', 'pending')
      .single()

    if (fetchError || !requestData) {
      return NextResponse.json(
        { error: 'Request not found or already processed' },
        { status: 404 }
      )
    }

    if (action === 'accept') {
      // Update request status
      const { error: updateError } = await supabase
        .from('contact_requests')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', params.id)

      if (updateError) {
        console.error('Update request error:', updateError)
        return NextResponse.json(
          { error: 'Failed to accept request' },
          { status: 500 }
        )
      }

      // Create bidirectional contacts
      const contacts = [
        {
          user_id: requestData.requester_id,
          contact_user_id: requestData.recipient_id,
          is_favorite: false,
          is_blocked: false,
        },
        {
          user_id: requestData.recipient_id,
          contact_user_id: requestData.requester_id,
          is_favorite: false,
          is_blocked: false,
        },
      ]

      const { error: insertError } = await supabase
        .from('contacts')
        .upsert(contacts, { onConflict: 'user_id,contact_user_id' })

      if (insertError) {
        console.error('Create contacts error:', insertError)
        // Don't fail if contacts already exist
      }

      return NextResponse.json({
        success: true,
        message: 'Contact request accepted',
      })
    } else {
      // Reject request
      const { error: updateError } = await supabase
        .from('contact_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', params.id)

      if (updateError) {
        console.error('Update request error:', updateError)
        return NextResponse.json(
          { error: 'Failed to reject request' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Contact request rejected',
      })
    }
  } catch (error: any) {
    console.error('Process contact request error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process contact request' },
      { status: 500 }
    )
  }
}

