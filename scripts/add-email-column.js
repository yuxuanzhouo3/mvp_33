/**
 * Add email column to acquisition_b2b_leads and acquisition_vc_leads tables in Supabase.
 * Run: node scripts/add-email-column.js
 */
const { createClient } = require("@supabase/supabase-js")
require("dotenv").config({ path: ".env.local" })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(url, key)

async function run() {
  // Use rpc to run raw SQL
  const { error: e1 } = await supabase.rpc("exec_sql", {
    sql: `ALTER TABLE acquisition_b2b_leads ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';`,
  })
  if (e1) {
    console.log("B2B email column — trying direct approach:", e1.message)
    // Supabase doesn't have exec_sql by default, so just log the SQL for manual execution
  } else {
    console.log("✅ acquisition_b2b_leads.email added")
  }

  const { error: e2 } = await supabase.rpc("exec_sql", {
    sql: `ALTER TABLE acquisition_vc_leads ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';`,
  })
  if (e2) {
    console.log("VC email column — trying direct approach:", e2.message)
  } else {
    console.log("✅ acquisition_vc_leads.email added")
  }

  console.log("\n---")
  console.log("If the above failed, please run these SQL statements manually in the Supabase dashboard:")
  console.log("ALTER TABLE acquisition_b2b_leads ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';")
  console.log("ALTER TABLE acquisition_vc_leads ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';")
}

run().catch(console.error)
