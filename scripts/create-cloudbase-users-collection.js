/**
 * 快速创建 CloudBase users 集合
 * 用于解决 "Db or Table not exist" 错误
 */

const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
require('dotenv').config({ path: envPath });

const cloudbase = require('@cloudbase/node-sdk');

async function createUsersCollection() {
  console.log('='.repeat(60));
  console.log('创建 CloudBase users 集合');
  console.log('='.repeat(60));
  console.log('');

  // 检查环境变量
  const envId = process.env.CLOUDBASE_ENV_ID;
  const secretId = process.env.CLOUDBASE_SECRET_ID;
  const secretKey = process.env.CLOUDBASE_SECRET_KEY;

  if (!envId || !secretId || !secretKey) {
    console.error('❌ 环境变量未配置！');
    console.error('   请检查 .env.local 文件中的以下变量：');
    console.error('   - CLOUDBASE_ENV_ID');
    console.error('   - CLOUDBASE_SECRET_ID');
    console.error('   - CLOUDBASE_SECRET_KEY');
    process.exit(1);
  }

  console.log(`环境 ID: ${envId}`);
  console.log(`Secret ID: ${secretId.substring(0, 8)}...`);
  console.log('');

  // 初始化 CloudBase
  let app, db;
  try {
    app = cloudbase.init({
      env: envId,
      secretId: secretId,
      secretKey: secretKey
    });
    db = app.database();
    console.log('✓ CloudBase 客户端初始化成功');
  } catch (error) {
    console.error('❌ CloudBase 初始化失败:', error.message);
    process.exit(1);
  }
  console.log('');

  // 创建 users 集合
  console.log('正在创建 users 集合...');
  try {
    // 方法：插入一条测试数据，如果集合不存在会自动创建
    const testData = {
      id: 'temp-' + Date.now(),
      email: 'temp@example.com',
      username: 'temp',
      full_name: 'Temporary User',
      name: 'Temporary User',
      status: 'offline',
      region: 'cn',
      country: 'CN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await db.collection('users').add(testData);
    const docId = result.id || result._id;

    if (docId) {
      console.log(`✓ users 集合创建成功（文档 ID: ${docId}）`);
      
      // 立即删除测试数据
      try {
        await db.collection('users').doc(docId).remove();
        console.log('✓ 测试数据已清理');
      } catch (removeError) {
        console.log('⚠️  测试数据清理失败（不影响使用）:', removeError.message);
      }
    } else {
      console.error('❌ 集合创建失败：没有返回文档 ID');
      console.error('返回结果:', result);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ 创建 users 集合时出错:', error.message);
    console.error('错误详情:', error);
    console.error('');
    console.error('可能的原因：');
    console.error('1. 数据库实例未创建或未启用');
    console.error('2. Secret ID/Key 没有数据库权限');
    console.error('3. 网络连接问题');
    console.error('');
    console.error('解决方案：');
    console.error('1. 登录 CloudBase 控制台: https://console.cloud.tencent.com/tcb');
    console.error(`2. 选择环境: ${envId}`);
    console.error('3. 进入"数据库" → 确认数据库实例已创建');
    console.error('4. 如果数据库未创建，点击"新建"创建数据库实例');
    console.error('5. 确认 Secret ID/Key 有数据库读写权限');
    process.exit(1);
  }

  // 验证集合是否存在
  console.log('');
  console.log('正在验证集合...');
  try {
    const verifyResult = await db.collection('users').limit(1).get();
    console.log('✓ users 集合验证成功');
    console.log(`✓ 集合中有 ${verifyResult.data.length} 条数据（仅查询了1条）`);
  } catch (error) {
    console.error('⚠️  集合验证失败:', error.message);
    console.error('   但集合可能已经创建，请手动在控制台检查');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('完成！');
  console.log('='.repeat(60));
  console.log('');
  console.log('下一步：');
  console.log('1. 现在可以重新尝试注册用户');
  console.log('2. 如果还有问题，请在 CloudBase 控制台手动检查 users 集合');
  console.log('');
}

// 运行
createUsersCollection()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });



































































