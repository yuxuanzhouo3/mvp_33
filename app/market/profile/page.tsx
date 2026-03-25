import { requireMarketAdminSession } from "../require-market-session"
import { ProfileClient } from "./profile-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function ProfilePage() {
  await requireMarketAdminSession()
  return <ProfileClient />
}
