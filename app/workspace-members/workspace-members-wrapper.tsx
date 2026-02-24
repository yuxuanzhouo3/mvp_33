import { Suspense } from 'react'
import WorkspaceMembersContent from './workspace-members-content'

export default function WorkspaceMembersWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
      <WorkspaceMembersContent />
    </Suspense>
  )
}
