/**
 * Unified bootstrap entry for admin analysis storage.
 *
 * Modes:
 * - default: detect active deployment target from env
 * - --target=supabase
 * - --target=cloudbase
 * - --target=both
 *
 * Supabase:
 * - If DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL is available and `psql` exists,
 *   the SQL file is applied automatically.
 * - Otherwise the script prints the SQL file path and next steps.
 *
 * CloudBase:
 * - Runs the CloudBase bootstrap script directly.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const dotenv = require("dotenv");

const projectRoot = path.resolve(__dirname, "..");
const envFiles = [".env.local", ".env"];

for (const file of envFiles) {
  const fullPath = path.join(projectRoot, file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: false });
  }
}

const SUPABASE_SQL_PATH = path.join(__dirname, "create-admin-analysis-tables-supabase.sql");
const CLOUDBASE_SCRIPT_PATH = path.join(__dirname, "create-admin-analysis-tables-cloudbase.js");

function getArgValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : "";
}

function resolveTarget() {
  const explicit = getArgValue("target").toLowerCase();
  if (["supabase", "cloudbase", "both"].includes(explicit)) return explicit;

  const region = String(process.env.NEXT_PUBLIC_DEPLOYMENT_REGION || process.env.DEPLOYMENT_REGION || "")
    .trim()
    .toUpperCase();

  if (region === "CN") return "cloudbase";
  if (region === "INTL" || region === "GLOBAL") return "supabase";

  const hasCloudBase = Boolean(process.env.CLOUDBASE_ENV_ID && process.env.CLOUDBASE_SECRET_ID && process.env.CLOUDBASE_SECRET_KEY);
  const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (hasCloudBase && hasSupabase) return "both";
  if (hasCloudBase) return "cloudbase";
  return "supabase";
}

function hasCommand(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore", shell: true });
  return result.status === 0;
}

function runNodeScript(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`Script failed: ${path.basename(scriptPath)}`);
  }
}

function applySupabaseSql() {
  const sql = fs.readFileSync(SUPABASE_SQL_PATH, "utf8");
  const dbUrl =
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    "";

  console.log("\n[Admin Analysis] Supabase target detected");
  console.log(`[Admin Analysis] SQL file: ${SUPABASE_SQL_PATH}`);

  if (!dbUrl) {
    console.log("[Admin Analysis] No database connection string found.");
    console.log("[Admin Analysis] Next step: open Supabase SQL Editor and run the SQL file above.");
    return;
  }

  if (!hasCommand("psql")) {
    console.log("[Admin Analysis] DATABASE_URL is present, but `psql` was not found in PATH.");
    console.log("[Admin Analysis] Next step: run the SQL file manually in Supabase SQL Editor.");
    return;
  }

  const result = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", SUPABASE_SQL_PATH], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
    shell: true,
  });

  if (result.status !== 0) {
    throw new Error("Failed to apply Supabase SQL");
  }

  console.log("[Admin Analysis] Supabase bootstrap finished.");
}

function bootstrapCloudBase() {
  console.log("\n[Admin Analysis] CloudBase target detected");
  console.log(`[Admin Analysis] Bootstrap script: ${CLOUDBASE_SCRIPT_PATH}`);
  runNodeScript(CLOUDBASE_SCRIPT_PATH);
  console.log("[Admin Analysis] CloudBase bootstrap finished.");
}

function printSummary(target) {
  console.log("\n[Admin Analysis] Summary");
  console.log(`- target: ${target}`);
  console.log(`- region: ${String(process.env.NEXT_PUBLIC_DEPLOYMENT_REGION || process.env.DEPLOYMENT_REGION || "unknown").trim() || "unknown"}`);
  console.log(`- supabase configured: ${Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)}`);
  console.log(`- cloudbase configured: ${Boolean(process.env.CLOUDBASE_ENV_ID && process.env.CLOUDBASE_SECRET_ID && process.env.CLOUDBASE_SECRET_KEY)}`);
}

function main() {
  const target = resolveTarget();
  printSummary(target);

  if (target === "supabase") {
    applySupabaseSql();
    return;
  }

  if (target === "cloudbase") {
    bootstrapCloudBase();
    return;
  }

  bootstrapCloudBase();
  applySupabaseSql();
}

try {
  main();
} catch (error) {
  console.error("\n[Admin Analysis] Bootstrap failed:", error?.message || error);
  process.exit(1);
}
