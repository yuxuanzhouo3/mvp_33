/**
 * CloudBase 管理后台功能表创建脚本
 * 包含：社交链接、广告管理、发布版本管理
 *
 * 使用方法:
 * 1. 确保已安装 @cloudbase/node-sdk
 * 2. 配置环境变量 CLOUDBASE_ENV_ID 和 CLOUDBASE_SECRET_ID/KEY
 * 3. 运行: node scripts/create-admin-feature-tables-cloudbase.js
 */

const cloudbase = require("@cloudbase/node-sdk");

async function createAdminFeatureTables() {
  const app = cloudbase.init({
    env: process.env.CLOUDBASE_ENV_ID,
    secretId: process.env.CLOUDBASE_SECRET_ID,
    secretKey: process.env.CLOUDBASE_SECRET_KEY,
  });

  const db = app.database();

  try {
    // ==================== 创建社交链接集合 ====================
    await db.createCollection("social_links");
    console.log("✓ Created 'social_links' collection");

    const socialLinks = db.collection("social_links");
    await socialLinks.createIndex({
      keys: [{ name: "order", direction: "1" }],
    });
    console.log("✓ Created index on social_links.order");

    // ==================== 创建广告集合 ====================
    await db.createCollection("advertisements");
    console.log("✓ Created 'advertisements' collection");

    const advertisements = db.collection("advertisements");
    await advertisements.createIndex({
      keys: [{ name: "status", direction: "1" }],
    });
    await advertisements.createIndex({
      keys: [{ name: "position", direction: "1" }],
    });
    await advertisements.createIndex({
      keys: [{ name: "priority", direction: "-1" }],
    });
    console.log("✓ Created indexes on advertisements");

    // ==================== 创建发布版本集合 ====================
    await db.createCollection("releases");
    console.log("✓ Created 'releases' collection");

    const releases = db.collection("releases");
    await releases.createIndex({
      keys: [{ name: "platform", direction: "1" }],
    });
    await releases.createIndex({
      keys: [{ name: "version", direction: "1" }],
    });
    await releases.createIndex({
      keys: [{ name: "is_active", direction: "1" }],
    });
    console.log("✓ Created indexes on releases");

    console.log("\n✓ All feature tables created successfully!");
  } catch (error) {
    console.error("Error creating tables:", error);
    process.exit(1);
  }
}

createAdminFeatureTables();
