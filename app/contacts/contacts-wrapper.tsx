import { Suspense } from 'react'
import ContactsPageContent from './contacts-content'

export default function ContactsWrapper() {
  return (
    <Suspense fallback={null}>
      <ContactsPageContent />
    </Suspense>
  )
}

