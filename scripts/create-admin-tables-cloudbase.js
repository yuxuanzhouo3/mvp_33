/**
 * CloudBase 管理员表创建脚本
 *
 * 使用方法:
 * 1. 确保已安装 @cloudbase/node-sdk
 * 2. 配置环境变量 CLOUDBASE_ENV_ID 和 CLOUDBASE_SECRET_ID/KEY
 * 3. 运行: node scripts/create-admin-tables-cloudbase.js
 */

const cloudbase = require("@cloudbase/node-sdk");

async function createAdminTables() {
  const app = cloudbase.init({
    env: process.env.CLOUDBASE_ENV_ID,
    secretId: process.env.CLOUDBASE_SECRET_ID,
    secretKey: process.env.CLOUDBASE_SECRET_KEY,
  });

  const db = app.database();

  try {
    // 创建 admins 集合
    await db.createCollection("admins");
    console.log("✓ Created 'admins' collection");

    // 创建索引
    const admins = db.collection("admins");
    await admins.createIndex({
      keys: [{ name: "username", direction: "1" }],
      unique: true,
    });
    console.log("✓ Created unique index on username");

    // 创建 admin_sessions 集合
    await db.createCollection("admin_sessions");
    console.log("✓ Created 'admin_sessions' collection");

    // 创建索引
    const sessions = db.collection("admin_sessions");
    await sessions.createIndex({
      keys: [{ name: "session_id", direction: "1" }],
      unique: true,
    });
    await sessions.createIndex({
      keys: [{ name: "expires_at", direction: "1" }],
    });
    console.log("✓ Created indexes on admin_sessions");

    console.log("\n✓ All tables created successfully!");
  } catch (error) {
    console.error("Error creating tables:", error);
    process.exit(1);
  }
}

createAdminTables();
