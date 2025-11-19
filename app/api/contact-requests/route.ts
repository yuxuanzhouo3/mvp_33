import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Get contact requests
 * GET /api/contact-requests?type=sent|received
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') || 'received' // 'sent' or 'received'

    // Get current user
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      console.error('Auth error in contact-requests API (GET):', authError)
    }
    
    if (!currentUser) {
      console.error('No current user in contact-requests API (GET). Auth error:', authError)
      return NextResponse.json(
        { error: 'Unauthorized', details: authError?.message || 'No user found' },
        { status: 401 }
      )
    }
    
    console.log(`[Contact Requests API] Current user ID: ${currentUser.id}, Type: ${type}`)

    let query = supabase
      .from('contact_requests')
      .select(`
        id,
        requester_id,
        recipient_id,
        message,
        status,
        created_at,
        updated_at,
        requester:users!contact_requests_requester_id_fkey (
          id,
          email,
          username,
          full_name,
          avatar_url,
          department,
          title,
          status
        ),
        recipient:users!contact_requests_recipient_id_fkey (
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

    if (type === 'sent') {
      query = query.eq('requester_id', currentUser.id)
    } else {
      query = query.eq('recipient_id', currentUser.id)
    }

    query = query.eq('status', 'pending')
      .order('created_at', { ascending: false })

    const { data: requests, error } = await query

    if (error) {
      console.error('Get contact requests error:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      // If table doesn't exist, return empty array instead of error
      if (error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
        return NextResponse.json({
          success: true,
          requests: [],
        })
      }
      return NextResponse.json(
        { error: 'Failed to get contact requests', details: error.message },
        { status: 500 }
      )
    }

    console.log(`[Contact Requests API] Found ${requests?.length || 0} requests for user ${currentUser.id}`)
    if (requests && requests.length > 0) {
      console.log(`[Contact Requests API] Request IDs: ${requests.map(r => r.id).join(', ')}`)
    }

    return NextResponse.json({
      success: true,
      requests: requests || [],
    })
  } catch (error: any) {
    console.error('Get contact requests error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get contact requests' },
      { status: 500 }
    )
  }
}

/**
 * Create a contact request
 * POST /api/contact-requests
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { recipient_id, message } = body

    if (!recipient_id) {
      return NextResponse.json(
        { error: 'recipient_id is required' },
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

    // Check if trying to send to self
    if (recipient_id === currentUser.id) {
      return NextResponse.json(
        { error: 'Cannot send request to yourself' },
        { status: 400 }
      )
    }

    // Check if contact already exists
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('contact_user_id', recipient_id)
      .single()

    if (existingContact) {
      return NextResponse.json(
        { error: 'Contact already exists' },
        { status: 400 }
      )
    }

    // Check if request already exists (bidirectional)
    // Check as requester
    const { data: requestAsRequester } = await supabase
      .from('contact_requests')
      .select('id, status')
      .eq('requester_id', currentUser.id)
      .eq('recipient_id', recipient_id)
      .in('status', ['pending', 'accepted'])
      .maybeSingle()

    // Check as recipient (reverse direction)
    const { data: requestAsRecipient } = await supabase
      .from('contact_requests')
      .select('id, status')
      .eq('requester_id', recipient_id)
      .eq('recipient_id', currentUser.id)
      .in('status', ['pending', 'accepted'])
      .maybeSingle()

    const existingRequest = requestAsRequester || requestAsRecipient

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return NextResponse.json(
          { error: 'Request already pending' },
          { status: 400 }
        )
      } else {
        return NextResponse.json(
          { error: 'Contact already exists' },
          { status: 400 }
        )
      }
    }

    // Create contact request
    const { data: newRequest, error: insertError } = await supabase
      .from('contact_requests')
      .insert({
        requester_id: currentUser.id,
        recipient_id,
        message: message || null,
        status: 'pending',
      })
      .select(`
        *,
        requester:users!contact_requests_requester_id_fkey (
          id,
          email,
          username,
          full_name,
          avatar_url
        ),
        recipient:users!contact_requests_recipient_id_fkey (
          id,
          email,
          username,
          full_name,
          avatar_url
        )
      `)
      .single()

    if (insertError) {
      console.error('Create contact request error:', insertError)
      // If table doesn't exist, fall back to direct contact addition
      if (insertError.message?.includes('does not exist') || insertError.message?.includes('schema cache')) {
        // Fallback: Add contact directly
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            user_id: currentUser.id,
            contact_user_id: recipient_id,
            is_favorite: false,
            is_blocked: false,
          })
          .select(`
            *,
            users!contacts_contact_user_id_fkey (
              id,
              email,
              username,
              full_name,
              avatar_url
            )
          `)
          .single()

        if (contactError) {
          return NextResponse.json(
            { error: 'Please run scripts/005_contact_requests.sql in Supabase to enable contact requests, or contact already exists' },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          contact: {
            ...newContact,
            user: (newContact as any).users,
          },
          message: 'Contact added directly (contact_requests table not found)',
        })
      }
      return NextResponse.json(
        { error: insertError.message || 'Failed to create contact request' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      request: newRequest,
    })
  } catch (error: any) {
    console.error('Create contact request error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create contact request' },
      { status: 500 }
    )
  }
}

