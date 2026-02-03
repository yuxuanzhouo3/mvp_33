import { Suspense } from 'react'
import ChatPageContent from './chat-content'

export default function ChatWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
      <ChatPageContent />
    </Suspense>
  )
}

