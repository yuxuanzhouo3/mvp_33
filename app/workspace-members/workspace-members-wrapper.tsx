import { Suspense } from 'react'
import WorkspaceMembersContent from './workspace-members-content'

export default function WorkspaceMembersWrapper() {
  return (
    <Suspense fallback={null}>
      <WorkspaceMembersContent />
    </Suspense>
  )
}
