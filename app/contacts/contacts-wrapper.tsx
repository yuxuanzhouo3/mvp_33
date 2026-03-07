import { Suspense } from 'react'
import ContactsPageContent from './contacts-content'

export default function ContactsWrapper() {
  return (
    <Suspense fallback={
      <div className="flex h-screen flex-col mobile-overscroll-contain">
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading contacts...</div>
        <div className="border-t bg-background/95 px-2 pt-2 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-5 gap-1">
            {['消息', '联系人', '工作区', '频道', '设置'].map((label) => (
              <div
                key={label}
                className="rounded-md border bg-muted/50 px-1 py-2 text-center text-[10px] text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    }>
      <ContactsPageContent />
    </Suspense>
  )
}

