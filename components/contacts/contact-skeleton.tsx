'use client'

import { cn } from '@/lib/utils'
import { Building2 } from 'lucide-react'

interface ContactSkeletonProps {
  count?: number
  showDepartments?: boolean
}

export function ContactSkeleton({ count = 8, showDepartments = true }: ContactSkeletonProps) {
  // Generate skeleton contacts with varying widths for names and titles
  const skeletonContacts = [
    { nameWidth: 'w-24', titleWidth: 'w-32' },
    { nameWidth: 'w-28', titleWidth: 'w-28' },
    { nameWidth: 'w-20', titleWidth: 'w-36' },
    { nameWidth: 'w-32', titleWidth: 'w-24' },
    { nameWidth: 'w-26', titleWidth: 'w-30' },
    { nameWidth: 'w-22', titleWidth: 'w-28' },
    { nameWidth: 'w-30', titleWidth: 'w-32' },
    { nameWidth: 'w-24', titleWidth: 'w-26' },
  ].slice(0, count)

  // Group contacts into departments for more realistic skeleton
  const departments = showDepartments ? [
    { name: 'Engineering', count: 3 },
    { name: 'Design', count: 2 },
    { name: 'Product', count: 3 },
  ] : [{ name: '', count: count }]

  return (
    <div className="space-y-2">
      {departments.map((dept, deptIndex) => (
        <div key={deptIndex} className="p-2">
          {showDepartments && dept.name && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <div className="h-4 w-20 bg-muted/60 rounded animate-pulse" />
              <div className="ml-auto h-5 w-6 bg-muted/60 rounded animate-pulse" />
            </div>
          )}
          <div className="space-y-1">
            {skeletonContacts.slice(0, dept.count).map((contact, index) => (
              <div
                key={index}
                className="w-full flex items-center gap-3 rounded-lg p-3"
              >
                {/* Avatar skeleton */}
                <div className="relative flex-shrink-0">
                  <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                  {/* Status indicator skeleton */}
                  <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-muted/60 border-2 border-background animate-pulse" />
                </div>

                {/* Name and title skeleton */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className={cn('h-4 bg-muted rounded animate-pulse', contact.nameWidth)} />
                  <div className={cn('h-3 bg-muted/60 rounded animate-pulse', contact.titleWidth)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}








