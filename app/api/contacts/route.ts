import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Get user's contacts
 * GET /api/contacts
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      console.error('Auth error in contacts API (GET):', authError)
    }
    
    if (!currentUser) {
      console.error('No current user in contacts API (GET). Auth error:', authError)
      // Try to get session for debugging
      const { data: sessionData } = await supabase.auth.getSession()
      console.error('Session data:', sessionData ? 'exists' : 'null')
      
      return NextResponse.json(
        { error: 'Unauthorized', details: authError?.message || 'No user found' },
        { status: 401 }
      )
    }

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
          status
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
    const contactsWithUsers = (contacts || []).map((contact: any) => ({
      ...contact,
      user: contact.users,
    }))

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
      .select('id')
      .eq('id', contact_user_id)
      .single()

    if (!contactUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
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

