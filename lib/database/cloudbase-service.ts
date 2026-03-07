import { getCloudBaseDb, isCloudBaseConfigured } from "@/lib/cloudbase/client"

export async function getDatabase() {
  if (!isCloudBaseConfigured()) {
    throw new Error("CloudBase is not configured")
  }
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error("CloudBase database is unavailable")
  }
  return db
}

