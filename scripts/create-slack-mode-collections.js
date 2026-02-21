/**
 * CloudBase Collections Migration Script
 * 创建 Slack 模式所需的集合
 *
 * 运行方式：
 * node scripts/create-slack-mode-collections.js
 */

const tcb = require('@cloudbase/node-sdk')

// 初始化 CloudBase
const app = tcb.init({
  env: process.env.CLOUDBASE_ENV_ID,
  secretId: process.env.CLOUDBASE_SECRET_ID,
  secretKey: process.env.CLOUDBASE_SECRET_KEY,
})

const db = app.database()

async function createCollections() {
  console.log('Starting CloudBase collections migration...')

  try {
    // 1. 创建 blocked_users 集合
    console.log('Creating blocked_users collection...')
    try {
      await db.createCollection('blocked_users')
      console.log('✓ blocked_users collection created')
    } catch (error) {
      if (error.message?.includes('already exists')) {
        console.log('✓ blocked_users collection already exists')
      } else {
        throw error
      }
    }

    // 2. 创建 reports 集合
    console.log('Creating reports collection...')
    try {
      await db.createCollection('reports')
      console.log('✓ reports collection created')
    } catch (error) {
      if (error.message?.includes('already exists')) {
        console.log('✓ reports collection already exists')
      } else {
        throw error
      }
    }

    // 3. 确保 workspace_members 集合存在
    console.log('Checking workspace_members collection...')
    try {
      await db.createCollection('workspace_members')
      console.log('✓ workspace_members collection created')
    } catch (error) {
      if (error.message?.includes('already exists')) {
        console.log('✓ workspace_members collection already exists')
      } else {
        throw error
      }
    }

    // 4. 创建索引
    console.log('Creating indexes...')

    // blocked_users 索引
    try {
      await db.collection('blocked_users').createIndex({
        keys: { blocker_id: 1, blocked_id: 1 },
        unique: true,
        name: 'idx_blocker_blocked_unique',
      })
      console.log('✓ blocked_users index created')
    } catch (error) {
      console.log('Note: blocked_users index may already exist:', error.message)
    }

    // reports 索引
    try {
      await db.collection('reports').createIndex({
        keys: { reporter_id: 1 },
        name: 'idx_reports_reporter',
      })
      await db.collection('reports').createIndex({
        keys: { reported_user_id: 1 },
        name: 'idx_reports_reported',
      })
      await db.collection('reports').createIndex({
        keys: { status: 1 },
        name: 'idx_reports_status',
      })
      console.log('✓ reports indexes created')
    } catch (error) {
      console.log('Note: reports indexes may already exist:', error.message)
    }

    // workspace_members 索引
    try {
      await db.collection('workspace_members').createIndex({
        keys: { workspace_id: 1, user_id: 1 },
        unique: true,
        name: 'idx_workspace_user_unique',
      })
      console.log('✓ workspace_members indexes created')
    } catch (error) {
      console.log('Note: workspace_members indexes may already exist:', error.message)
    }

    console.log('\n✅ Migration completed successfully!')
    console.log('\nNote: You need to manually add allow_non_friend_messages field to users collection.')
    console.log('Default value should be true (allow non-friends to send messages).')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

// 运行迁移
createCollections()
