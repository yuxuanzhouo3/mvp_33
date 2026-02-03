/**
 * 测试 CloudBase 数据库连接
 * 用于诊断数据库连接问题
 */

const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: envPath });

const cloudbase = require('@cloudbase/node-sdk');

// 初始化云开发客户端
const app = cloudbase.init({
  env: process.env.CLOUDBASE_ENV_ID,
  secretId: process.env.CLOUDBASE_SECRET_ID,
  secretKey: process.env.CLOUDBASE_SECRET_KEY
});

const db = app.database();

async function testConnection() {
  console.log('开始测试 CloudBase 数据库连接...\n');
  
  console.log(`环境 ID: ${process.env.CLOUDBASE_ENV_ID}`);
  console.log(`Secret ID: ${process.env.CLOUDBASE_SECRET_ID.substring(0, 8)}...`);
  console.log('');

  // 1. 测试查询已存在的集合（如果用户已经创建了 _init）
  console.log('1. 测试查询已存在的集合 "_init"...');
  try {
    const result = await db.collection('_init').limit(1).get();
    console.log('✓ 集合 "_init" 存在，数据库已初始化');
    console.log(`   找到 ${result.data.length} 条记录\n`);
  } catch (error) {
    console.log('✗ 集合 "_init" 不存在或无法访问');
    console.log(`   错误: ${error.message}\n`);
  }

  // 2. 尝试创建一个测试集合
  console.log('2. 尝试创建测试集合 "test_collection"...');
  try {
    const testData = {
      _test: true,
      created_at: new Date(),
      message: '这是一个测试数据，用于验证数据库连接'
    };
    const result = await db.collection('test_collection').add(testData);
    const docId = result.id || result._id || result.inserted || result.insertedId;
    
    if (docId) {
      console.log(`✓ 测试集合创建成功，文档 ID: ${docId}`);
      
      // 尝试查询刚创建的数据
      try {
        const queryResult = await db.collection('test_collection').doc(docId).get();
        console.log('✓ 可以成功查询刚创建的数据');
        
        // 删除测试数据
        await db.collection('test_collection').doc(docId).remove();
        console.log('✓ 测试数据已删除\n');
      } catch (queryError) {
        console.log(`⚠️  查询测试数据失败: ${queryError.message}\n`);
      }
    } else {
      console.log('⚠️  创建成功但无法获取文档 ID\n');
    }
  } catch (error) {
    console.log('✗ 创建测试集合失败');
    console.log(`   错误代码: ${error.code || 'N/A'}`);
    console.log(`   错误信息: ${error.message}`);
    console.log(`   完整错误: ${JSON.stringify(error, null, 2)}\n`);
  }

  // 3. 尝试列出所有集合（如果 API 支持）
  console.log('3. 诊断信息:');
  console.log('   - 如果集合 "_init" 存在但无法创建新集合，可能是权限问题');
  console.log('   - 如果所有操作都失败，请检查：');
  console.log('     * Secret ID 和 Secret Key 是否正确');
  console.log('     * 是否有数据库读写权限');
  console.log('     * 数据库实例是否已完全启用');
  console.log('     * 环境 ID 是否正确');
}

testConnection()
  .then(() => {
    console.log('\n测试完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n测试失败:', error);
    process.exit(1);
  });




















































































