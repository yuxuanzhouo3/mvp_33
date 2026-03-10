#!/usr/bin/env node

const cloudbase = require('@cloudbase/node-sdk')

async function main() {
  const envId = process.env.CLOUDBASE_ENV_ID
  const secretId = process.env.CLOUDBASE_SECRET_ID
  const secretKey = process.env.CLOUDBASE_SECRET_KEY

  if (!envId || !secretId || !secretKey) {
    throw new Error('Missing CLOUDBASE_ENV_ID / CLOUDBASE_SECRET_ID / CLOUDBASE_SECRET_KEY')
  }

  const app = cloudbase.init({ env: envId, secretId, secretKey })
  const db = app.database()
  const now = new Date().toISOString()
  const collections = [
    'ai_project_analyses',
    'ai_creative_briefs',
    'ai_generation_jobs',
    'ai_assets',
  ]

  for (const name of collections) {
    const result = await db.collection(name).add({
      __bootstrap: true,
      created_at: now,
    })
    const insertedId = result.id || (Array.isArray(result.ids) ? result.ids[0] : null)
    if (insertedId) {
      await db.collection(name).doc(insertedId).remove()
    }
    console.log(`[ai-studio] ensured collection: ${name}`)
  }

  console.log('[ai-studio] CloudBase AI collections initialized')
}

main().catch((error) => {
  console.error('[ai-studio] failed to initialize CloudBase collections:', error)
  process.exitCode = 1
})
