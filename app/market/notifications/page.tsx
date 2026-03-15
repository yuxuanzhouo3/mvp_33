import { requireMarketAdminSession } from "../require-market-session"
import { Suspense } from "react"
import { NotificationsClient } from "./notifications-client"
import { Skeleton } from "@/components/ui/skeleton"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function MarketNotificationsPage() {
  await requireMarketAdminSession()

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-muted/20 px-4 py-8">
          <div className="mx-auto max-w-6xl space-y-4">
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-[600px] w-full" />
          </div>
        </div>
      }
    >
      <NotificationsClient />
    </Suspense>
  )
}
