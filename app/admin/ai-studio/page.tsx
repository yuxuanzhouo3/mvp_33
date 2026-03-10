import { getDeploymentRegion } from '@/config'
import { resolveAiProviderRoute } from '@/lib/admin/ai/provider-router'
import AiStudioClient from './ai-studio-client'

export const runtime = 'nodejs'

export default function AiStudioPage() {
  const region = getDeploymentRegion()
  const route = resolveAiProviderRoute(region)

  return <AiStudioClient region={region} language={route.language} route={route} />
}