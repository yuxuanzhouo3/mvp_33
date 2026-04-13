"use strict";

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = process.cwd();
const source = path.join(projectRoot, ".env.example");
const target = path.join(projectRoot, ".env.local");
const force = process.argv.includes("--force");

if (!fs.existsSync(source)) {
  console.error("[setup:dev] .env.example is missing.");
  process.exit(1);
}

if (fs.existsSync(target) && !force) {
  console.log("[setup:dev] .env.local already exists. Use --force if you want to overwrite it.");
  process.exit(0);
}

fs.copyFileSync(source, target);
console.log("[setup:dev] Created .env.local from .env.example");
console.log("[setup:dev] Fill the required variables, then run: npm run env:check");
