import { MarketingConsoleClient } from "./marketing-console-client"
import { requireMarketAdminSession } from "../require-market-session"
import { resolveDeploymentRegion } from "@/lib/config/deployment-region"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function MarketFissionPage() {
  await requireMarketAdminSession()
  const region = resolveDeploymentRegion() === "INTL" ? "INTL" : "CN"
  return <MarketingConsoleClient region={region} />
}
