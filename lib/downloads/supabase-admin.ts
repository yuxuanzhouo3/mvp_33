import { getSupabaseAdmin } from "@/lib/integrations/supabase-admin"

export function getSupabaseAdminForDownloads(): any {
  return getSupabaseAdmin() as any
}
