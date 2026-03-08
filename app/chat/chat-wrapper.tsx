import { Suspense } from 'react'
import ChatPageContent from './chat-content'

export default function ChatWrapper() {
  return (
    <Suspense fallback={
      <div className="flex h-screen flex-col mobile-app-shell mobile-overscroll-contain">
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading chats...</div>
        <div className="border-t bg-background/95 px-2 pt-2 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-5 gap-1">
            {[1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="rounded-md border bg-muted/50 px-1 py-2 text-center text-[10px] text-muted-foreground"
              >
                ...
              </div>
            ))}
          </div>
        </div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  )
}

