"use strict";

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = process.cwd();
const envLocalPath = path.join(projectRoot, ".env.local");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

const fileEnv = parseEnvFile(envLocalPath);
const mergedEnv = { ...fileEnv, ...process.env };
const region = String(
  mergedEnv.NEXT_PUBLIC_DEPLOYMENT_REGION || mergedEnv.DEPLOYMENT_REGION || "INTL",
)
  .trim()
  .toUpperCase();

const requiredCommon = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
  "FRONTEND_URL",
  "NEXT_PUBLIC_FRONTEND_URL",
  "ADMIN_SESSION_SECRET",
];

const requiredByRegion = {
  CN: [
    "DEPLOYMENT_REGION",
    "NEXT_PUBLIC_DEPLOYMENT_REGION",
    "CLOUDBASE_ENV_ID",
    "CLOUDBASE_SECRET_ID",
    "CLOUDBASE_SECRET_KEY",
    "CLOUDBASE_SESSION_SECRET",
  ],
  INTL: [
    "DEPLOYMENT_REGION",
    "NEXT_PUBLIC_DEPLOYMENT_REGION",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ],
};

const optionalFeatureChecks = [
  {
    label: "Market live search",
    when: () => ["serper", "tavily", "webhook"].includes(String(mergedEnv.MARKET_LEAD_SOURCE_PROVIDER || "").toLowerCase()),
    vars:
      String(mergedEnv.MARKET_LEAD_SOURCE_PROVIDER || "").toLowerCase() === "serper"
        ? ["SERPER_API_KEY"]
        : String(mergedEnv.MARKET_LEAD_SOURCE_PROVIDER || "").toLowerCase() === "tavily"
          ? ["TAVILY_API_KEY"]
          : ["MARKET_LEAD_SOURCE_WEBHOOK_URL"],
  },
  {
    label: "WeChat OA direct publish",
    when: () => Boolean(mergedEnv.WECHAT_OA_ACCESS_TOKEN || (mergedEnv.WECHAT_OA_APP_ID && mergedEnv.WECHAT_OA_APP_SECRET)),
    vars: ["WECHAT_OA_THUMB_MEDIA_ID"],
  },
  {
    label: "Douyin direct publish",
    when: () => Boolean(
      mergedEnv.DOUYIN_CLIENT_KEY ||
        mergedEnv.DOUYIN_CLIENT_SECRET ||
        mergedEnv.MARKET_DOUYIN_CLIENT_KEY ||
        mergedEnv.MARKET_DOUYIN_CLIENT_SECRET,
    ),
    vars: ["DOUYIN_CLIENT_KEY", "DOUYIN_CLIENT_SECRET"],
  },
];

function isMissing(key) {
  return !String(mergedEnv[key] || "").trim();
}

function printList(title, values) {
  if (!values.length) return;
  console.log(`\n${title}`);
  for (const value of values) {
    console.log(`- ${value}`);
  }
}

console.log(`[env:check] project root: ${projectRoot}`);
console.log(`[env:check] env file: ${fs.existsSync(envLocalPath) ? ".env.local found" : ".env.local missing"}`);
console.log(`[env:check] target region: ${region}`);

const supportedRegion = region === "CN" || region === "INTL";
const missingRequired = supportedRegion
  ? [...requiredCommon, ...requiredByRegion[region]].filter(isMissing)
  : ["DEPLOYMENT_REGION", "NEXT_PUBLIC_DEPLOYMENT_REGION"];

const warnings = [];

if (!supportedRegion) {
  warnings.push(`Unsupported DEPLOYMENT_REGION "${region}". Use CN or INTL.`);
}

if (fileEnv.NODE_ENV) {
  warnings.push(`NODE_ENV is set in .env.local (${fileEnv.NODE_ENV}). Remove it for local dev and let Next.js manage it.`);
}

if (
  mergedEnv.DEPLOYMENT_REGION &&
  mergedEnv.NEXT_PUBLIC_DEPLOYMENT_REGION &&
  String(mergedEnv.DEPLOYMENT_REGION).trim().toUpperCase() !==
    String(mergedEnv.NEXT_PUBLIC_DEPLOYMENT_REGION).trim().toUpperCase()
) {
  warnings.push("DEPLOYMENT_REGION and NEXT_PUBLIC_DEPLOYMENT_REGION do not match.");
}

const optionalWarnings = [];
for (const check of optionalFeatureChecks) {
  if (!check.when()) continue;
  const missing = check.vars.filter(isMissing);
  if (missing.length) {
    optionalWarnings.push(`${check.label}: missing ${missing.join(", ")}`);
  }
}

if (missingRequired.length) {
  printList("[env:check] Missing required variables", missingRequired);
}

printList("[env:check] Warnings", warnings);
printList("[env:check] Optional feature warnings", optionalWarnings);

if (missingRequired.length) {
  console.error("\n[env:check] Environment is not ready.");
  console.error("[env:check] Copy .env.example to .env.local and fill the required values for your region.");
  process.exit(1);
}

console.log("\n[env:check] Environment looks ready for local development.");
