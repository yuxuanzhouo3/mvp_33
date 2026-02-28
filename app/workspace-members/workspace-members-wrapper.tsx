import { Suspense } from 'react'
import WorkspaceMembersContent from './workspace-members-content'

export default function WorkspaceMembersWrapper() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
      <WorkspaceMembersContent />
    </Suspense>
  )
}
