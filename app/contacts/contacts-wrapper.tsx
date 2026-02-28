import { Suspense } from 'react'
import ContactsPageContent from './contacts-content'

export default function ContactsWrapper() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
      <ContactsPageContent />
    </Suspense>
  )
}

