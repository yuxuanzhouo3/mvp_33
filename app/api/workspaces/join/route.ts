import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Join a workspace (add user to workspace_members)
 * POST /api/workspaces/join
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workspace_id } = body

    if (!workspace_id) {
      return NextResponse.json(
        { error: 'workspace_id is required' },
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

    // Check if user is already a member
    const { data: existingMember, error: checkError } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspace_id)
      .eq('user_id', currentUser.id)
      .maybeSingle()

    if (checkError) {
      console.error('Error checking existing member:', checkError)
      // If there's an RLS error, we'll try to insert anyway
      // The insert might work even if the select fails due to RLS
    }

    if (existingMember) {
      // User is already a member, return success
      return NextResponse.json({
        success: true,
        message: 'User is already a member of this workspace',
      })
    }

    // Verify workspace exists, or create it if it doesn't
    let workspace: { id: string; owner_id: string } | null = null
    
    const { data: existingWorkspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id, owner_id')
      .eq('id', workspace_id)
      .maybeSingle()

    if (workspaceError && workspaceError.code !== 'PGRST116') {
      // PGRST116 means "no rows found", which is okay - we'll create it
      // Other errors are real problems
      console.error('Error checking workspace:', workspaceError)
      return NextResponse.json(
        { 
          error: 'Failed to check workspace',
          details: workspaceError.message,
          code: workspaceError.code
        },
        { status: 500 }
      )
    }

    if (existingWorkspace) {
      workspace = existingWorkspace
      console.log('Workspace exists:', workspace.id)
    } else {
      // Workspace doesn't exist, try to create it
      console.log('Workspace not found, attempting to create new workspace:', workspace_id)
      
      // Generate a domain based on workspace ID or user ID
      const domain = workspace_id === '10000000-0000-0000-0000-000000000001' 
        ? 'techcorp' 
        : `workspace-${currentUser.id.substring(0, 8)}`
      
      const name = workspace_id === '10000000-0000-0000-0000-000000000001'
        ? 'TechCorp'
        : 'My Workspace'
      
      const { data: newWorkspace, error: createError } = await supabase
        .from('workspaces')
        .insert({
          id: workspace_id,
          name: name,
          domain: domain,
          owner_id: currentUser.id,
        })
        .select('id, owner_id')
        .single()

      if (createError) {
        // If error is due to duplicate key (workspace already exists), that's okay
        // Try to fetch the existing workspace instead
        if (createError.code === '23505') {
          console.log('Workspace already exists (duplicate key), fetching existing workspace:', workspace_id)
          const { data: fetchedWorkspace, error: fetchError } = await supabase
            .from('workspaces')
            .select('id, owner_id')
            .eq('id', workspace_id)
            .maybeSingle()
          
          if (fetchError) {
            // If fetch fails (likely due to RLS), assume workspace exists and continue
            // We'll use the current user as owner as a fallback
            console.warn('Could not fetch existing workspace (likely RLS issue), assuming it exists:', fetchError.message)
            workspace = {
              id: workspace_id,
              owner_id: currentUser.id // Use current user as fallback owner
            }
            console.log('Using fallback workspace object:', workspace.id)
          } else if (fetchedWorkspace) {
            workspace = fetchedWorkspace
            console.log('Fetched existing workspace:', workspace.id)
          } else {
            // Workspace doesn't exist in query but exists in DB (RLS issue)
            // Assume it exists and continue with fallback
            console.warn('Workspace exists in DB but not accessible via RLS, using fallback')
            workspace = {
              id: workspace_id,
              owner_id: currentUser.id // Use current user as fallback owner
            }
            console.log('Using fallback workspace object:', workspace.id)
          }
        } else {
          // Other errors are real problems
          console.error('Error creating workspace:', createError)
          console.error('Create error details:', JSON.stringify(createError, null, 2))
          return NextResponse.json(
            { 
              error: 'Failed to create workspace',
              details: createError.message,
              code: createError.code,
              hint: createError.hint
            },
            { status: 500 }
          )
        }
      } else if (newWorkspace) {
        workspace = newWorkspace
        console.log('Created new workspace:', workspace.id)
      } else {
        // Insert succeeded but no data returned (shouldn't happen, but handle it)
        console.error('Workspace insert succeeded but no data returned')
        return NextResponse.json(
          { error: 'Failed to create workspace' },
          { status: 500 }
        )
      }
    }

    // Add user to workspace_members
    // If user is the owner, set role to 'owner', otherwise 'member'
    const role = workspace.owner_id === currentUser.id ? 'owner' : 'member'
    
    console.log('Attempting to insert workspace_member:', {
      workspace_id,
      user_id: currentUser.id,
      role,
      workspace_owner_id: workspace.owner_id
    })
    
    const { data: insertData, error: insertError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id,
        user_id: currentUser.id,
        role,
      })
      .select()

    console.log('Insert result:', {
      hasData: !!insertData,
      dataLength: insertData?.length || 0,
      hasError: !!insertError,
      error: insertError ? {
        message: insertError.message,
        code: insertError.code,
        hint: insertError.hint,
        details: insertError.details
      } : null
    })

    if (insertError) {
      console.error('Join workspace error:', insertError)
      // Log full error details for debugging
      console.error('Insert error details:', JSON.stringify(insertError, null, 2))
      return NextResponse.json(
        { 
          error: insertError.message || 'Failed to join workspace',
          details: insertError,
          code: insertError.code,
          hint: insertError.hint
        },
        { status: 500 }
      )
    }

    // Verify the insert actually worked by querying back
    const { data: verifyData, error: verifyError } = await supabase
      .from('workspace_members')
      .select('id, workspace_id, user_id, role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', currentUser.id)
      .maybeSingle()

    console.log('Verification query result:', {
      hasData: !!verifyData,
      data: verifyData,
      hasError: !!verifyError,
      error: verifyError?.message
    })

    if (!verifyData) {
      console.error('WARNING: Insert appeared to succeed but verification query returned no data!')
      return NextResponse.json(
        { 
          error: 'Insert appeared to succeed but verification failed',
          warning: 'Please check RLS policies and database logs'
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully joined workspace',
      data: verifyData
    })
  } catch (error: any) {
    console.error('Join workspace error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to join workspace' },
      { status: 500 }
    )
  }
}

