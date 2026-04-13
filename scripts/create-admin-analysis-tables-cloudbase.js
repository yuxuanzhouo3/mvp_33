/**
 * CloudBase admin analysis bootstrap
 *
 * Creates collections and indexes for:
 * - user_feedback
 * - product_iterations
 * - user_behavior_events
 * - feedback_clusters
 *
 * Usage:
 * 1. Set CLOUDBASE_ENV_ID
 * 2. Set CLOUDBASE_SECRET_ID
 * 3. Set CLOUDBASE_SECRET_KEY
 * 4. Run: node scripts/create-admin-analysis-tables-cloudbase.js
 */

const cloudbase = require("@cloudbase/node-sdk");

function isAlreadyExistsError(error) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");
  return (
    message.includes("already exists") ||
    message.includes("Table exist") ||
    message.includes("DATABASE_COLLECTION_EXIST") ||
    message.includes("DATABASE_COLLECTION_ALREADY_EXIST") ||
    message.includes("ResourceExist") ||
    code.includes("DATABASE_COLLECTION_EXIST") ||
    code.includes("DATABASE_COLLECTION_ALREADY_EXIST") ||
    message.includes("index name existed")
  );
}

async function safeCreateCollection(db, name) {
  try {
    await db.createCollection(name);
    console.log(`Created collection: ${name}`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      console.log(`Collection already exists: ${name}`);
      return;
    }
    throw error;
  }
}

async function safeCreateIndex(collection, label, keys) {
  if (!collection || typeof collection.createIndex !== "function") {
    console.log(`Skipped index (SDK unsupported): ${label}`);
    return;
  }

  try {
    await collection.createIndex({ keys });
    console.log(`Created index: ${label}`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      console.log(`Index already exists: ${label}`);
      return;
    }
    throw error;
  }
}

async function main() {
  const app = cloudbase.init({
    env: process.env.CLOUDBASE_ENV_ID,
    secretId: process.env.CLOUDBASE_SECRET_ID,
    secretKey: process.env.CLOUDBASE_SECRET_KEY,
  });

  const db = app.database();

  await safeCreateCollection(db, "user_feedback");
  await safeCreateCollection(db, "product_iterations");
  await safeCreateCollection(db, "user_behavior_events");
  await safeCreateCollection(db, "feedback_clusters");

  await safeCreateIndex(db.collection("user_feedback"), "user_feedback.created_at", [{ name: "created_at", direction: "-1" }]);
  await safeCreateIndex(db.collection("user_feedback"), "user_feedback.status", [{ name: "status", direction: "1" }]);
  await safeCreateIndex(db.collection("user_feedback"), "user_feedback.source", [{ name: "source", direction: "1" }]);
  await safeCreateIndex(db.collection("user_feedback"), "user_feedback.version", [{ name: "version", direction: "1" }]);
  await safeCreateIndex(db.collection("user_feedback"), "user_feedback.feature_key", [{ name: "feature_key", direction: "1" }]);

  await safeCreateIndex(db.collection("product_iterations"), "product_iterations.version", [{ name: "version", direction: "-1" }]);
  await safeCreateIndex(db.collection("product_iterations"), "product_iterations.status", [{ name: "status", direction: "1" }]);

  await safeCreateIndex(db.collection("user_behavior_events"), "user_behavior_events.occurred_at", [{ name: "occurred_at", direction: "-1" }]);
  await safeCreateIndex(db.collection("user_behavior_events"), "user_behavior_events.feature_key", [{ name: "feature_key", direction: "1" }]);
  await safeCreateIndex(db.collection("user_behavior_events"), "user_behavior_events.event_type", [{ name: "event_type", direction: "1" }]);
  await safeCreateIndex(db.collection("user_behavior_events"), "user_behavior_events.user_id", [{ name: "user_id", direction: "1" }]);
  await safeCreateIndex(db.collection("user_behavior_events"), "user_behavior_events.source", [{ name: "source", direction: "1" }]);

  await safeCreateIndex(db.collection("feedback_clusters"), "feedback_clusters.snapshot_key", [{ name: "snapshot_key", direction: "1" }]);
  await safeCreateIndex(db.collection("feedback_clusters"), "feedback_clusters.created_at", [{ name: "created_at", direction: "-1" }]);
  await safeCreateIndex(db.collection("feedback_clusters"), "feedback_clusters.topic", [{ name: "topic", direction: "1" }]);

  console.log("Admin analysis bootstrap finished for CloudBase.");
}

main().catch((error) => {
  console.error("Failed to bootstrap CloudBase admin analysis tables:", error);
  process.exit(1);
});
