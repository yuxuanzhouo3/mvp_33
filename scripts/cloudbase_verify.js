/**
 * 验证 CloudBase 集合是否已创建
 * 用于检查在控制台手动创建的集合
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const parsed = dotenv.parse(fs.readFileSync(filePath));
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(__dirname, '..', '.env'));
loadEnvFile(path.join(__dirname, '..', '.env.cn'));

const cloudbase = require('@cloudbase/node-sdk');

// 初始化云开发客户端
const app = cloudbase.init({
  env: process.env.CLOUDBASE_ENV_ID,
  secretId: process.env.CLOUDBASE_SECRET_ID,
  secretKey: process.env.CLOUDBASE_SECRET_KEY
});

const db = app.database();

// 需要创建的集合列表
const collections = [
  'users',
  'workspaces',
  'workspace_members',
  'conversations',
  'conversation_members',
  'messages',
  'contacts',
  'contact_requests',
  'departments',
  'user_profiles',
  'hidden_messages',
  'workspace_announcements',
  'workspace_join_requests',
  'group_files'
];

async function verifyCollections() {
  console.log('开始验证 CloudBase 集合...\n');
  console.log(`环境 ID: ${process.env.CLOUDBASE_ENV_ID}\n`);

  const results = {
    exists: [],
    notExists: [],
    errors: []
  };

  for (const collectionName of collections) {
    try {
      // 尝试查询集合（即使为空也可以）
      await db.collection(collectionName).limit(1).get();
      results.exists.push(collectionName);
      console.log(`✓ ${collectionName} - 集合存在`);
    } catch (error) {
      if (error.message && (
        error.message.includes('not exist') ||
        error.message.includes('COLLECTION_NOT_EXIST') ||
        error.message.includes('Db or Table not exist') ||
        error.code === 'DATABASE_COLLECTION_NOT_EXIST'
      )) {
        results.notExists.push(collectionName);
        console.log(`✗ ${collectionName} - 集合不存在`);
      } else {
        results.errors.push({ collection: collectionName, error: error.message });
        console.log(`⚠ ${collectionName} - 错误: ${error.message}`);
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('验证结果汇总:');
  console.log(`✓ 已存在的集合: ${results.exists.length}/${collections.length}`);
  console.log(`✗ 不存在的集合: ${results.notExists.length}/${collections.length}`);
  
  if (results.exists.length > 0) {
    console.log('\n已存在的集合:');
    results.exists.forEach(name => console.log(`  - ${name}`));
  }
  
  if (results.notExists.length > 0) {
    console.log('\n需要在控制台创建的集合:');
    results.notExists.forEach(name => console.log(`  - ${name}`));
    console.log('\n请在 CloudBase 控制台手动创建这些集合:');
    const envId = process.env.CLOUDBASE_ENV_ID || '';
    console.log(`https://tcb.cloud.tencent.com/dev?envId=${envId}#/db/doc/collection/`);
  }
  
  if (results.errors.length > 0) {
    console.log('\n错误信息:');
    results.errors.forEach(({ collection, error }) => {
      console.log(`  - ${collection}: ${error}`);
    });
  }

  if (results.exists.length === collections.length) {
    console.log('\n✓ 所有集合都已创建，可以开始使用！');
  } else {
    console.log('\n⚠️  请先在控制台创建缺失的集合，然后重新运行此脚本验证。');
  }
}

verifyCollections()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n验证失败:', error);
    process.exit(1);
  });



















































































