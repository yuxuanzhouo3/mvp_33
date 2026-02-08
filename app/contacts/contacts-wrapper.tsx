import { Suspense } from 'react'
import ContactsPageContent from './contacts-content'

export default function ContactsWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
      <ContactsPageContent />
    </Suspense>
  )
}

