/**
 * 测试 CloudBase 数据库连接和数据查询
 * 用于诊断为什么看不到数据
 */

const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
require('dotenv').config({ path: envPath });

const cloudbase = require('@cloudbase/node-sdk');

async function testCloudBaseData() {
  console.log('='.repeat(60));
  console.log('CloudBase 数据诊断工具');
  console.log('='.repeat(60));
  console.log('');

  // 1. 检查环境变量
  console.log('1. 检查环境变量配置...');
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

  console.log(`   ✓ 环境 ID: ${envId}`);
  console.log(`   ✓ Secret ID: ${secretId.substring(0, 8)}...`);
  console.log(`   ✓ Secret Key: ${secretKey.substring(0, 8)}...`);
  console.log('');

  // 2. 初始化 CloudBase
  console.log('2. 初始化 CloudBase 客户端...');
  let app, db;
  try {
    app = cloudbase.init({
      env: envId,
      secretId: secretId,
      secretKey: secretKey
    });
    db = app.database();
    console.log('   ✓ CloudBase 客户端初始化成功');
  } catch (error) {
    console.error('   ❌ CloudBase 初始化失败:', error.message);
    process.exit(1);
  }
  console.log('');

  // 3. 检查 users 集合是否存在
  console.log('3. 检查 users 集合...');
  try {
    const testQuery = await db.collection('users').limit(1).get();
    console.log('   ✓ users 集合存在');
    console.log(`   ✓ 当前集合中有 ${testQuery.data.length} 条数据（仅查询了1条）`);
  } catch (error) {
    if (error.message && (
      error.message.includes('not exist') ||
      error.message.includes('COLLECTION_NOT_EXIST') ||
      error.message.includes('Db or Table not exist') ||
      error.code === 'DATABASE_COLLECTION_NOT_EXIST'
    )) {
      console.error('   ❌ users 集合不存在！');
      console.error('   解决方案：');
      console.error('   1. 登录 CloudBase 控制台: https://console.cloud.tencent.com/tcb');
      console.error(`   2. 选择环境: ${envId}`);
      console.error('   3. 进入"数据库" → "集合管理"');
      console.error('   4. 点击"新建集合"，创建名为 "users" 的集合');
      console.error('   5. 集合创建后，重新运行此脚本');
    } else {
      console.error('   ❌ 查询 users 集合时出错:', error.message);
      console.error('   错误详情:', error);
    }
    process.exit(1);
  }
  console.log('');

  // 4. 查询所有用户数据
  console.log('4. 查询所有用户数据...');
  try {
    const allUsers = await db.collection('users').get();
    console.log(`   ✓ 找到 ${allUsers.data.length} 个用户`);
    
    if (allUsers.data.length === 0) {
      console.log('   ⚠️  集合中没有数据！');
      console.log('');
      console.log('   可能的原因：');
      console.log('   1. 还没有注册过用户');
      console.log('   2. 注册时出错了，但没有抛出错误');
      console.log('   3. 数据写入了其他环境或集合');
      console.log('');
      console.log('   建议：');
      console.log('   1. 检查服务器日志，查找 [CloudBase] 或 [REGISTER] 开头的日志');
      console.log('   2. 尝试注册一个新用户，观察日志输出');
      console.log('   3. 检查注册时是否检测到中国IP（region === "cn"）');
    } else {
      console.log('');
      console.log('   用户列表：');
      allUsers.data.forEach((user, index) => {
        console.log(`   ${index + 1}. ID: ${user.id || user._id}`);
        console.log(`      邮箱: ${user.email}`);
        console.log(`      用户名: ${user.username}`);
        console.log(`      全名: ${user.full_name || user.name}`);
        console.log(`      区域: ${user.region || '未设置'}`);
        console.log(`      国家: ${user.country || '未设置'}`);
        console.log(`      创建时间: ${user.created_at || '未设置'}`);
        console.log('');
      });
    }
  } catch (error) {
    console.error('   ❌ 查询用户数据时出错:', error.message);
    console.error('   错误详情:', error);
  }
  console.log('');

  // 5. 测试写入一条数据
  console.log('5. 测试写入数据...');
  try {
    const testData = {
      id: 'test-' + Date.now(),
      email: 'test@example.com',
      username: 'testuser',
      full_name: 'Test User',
      name: 'Test User',
      status: 'online',
      region: 'cn',
      country: 'CN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log('   正在插入测试数据...');
    const result = await db.collection('users').add(testData);
    const docId = result.id || result._id;

    if (docId) {
      console.log(`   ✓ 测试数据插入成功，文档 ID: ${docId}`);
      
      // 立即查询验证
      const verify = await db.collection('users').where({ id: testData.id }).get();
      if (verify.data && verify.data.length > 0) {
        console.log('   ✓ 数据验证成功，可以正常读写');
        
        // 删除测试数据
        try {
          await db.collection('users').doc(docId).remove();
          console.log('   ✓ 测试数据已清理');
        } catch (removeError) {
          console.log('   ⚠️  测试数据清理失败（不影响使用）:', removeError.message);
        }
      } else {
        console.log('   ⚠️  数据插入成功但查询不到（可能是索引问题）');
      }
    } else {
      console.error('   ❌ 数据插入失败：没有返回文档 ID');
      console.error('   返回结果:', result);
    }
  } catch (error) {
    console.error('   ❌ 写入测试数据时出错:', error.message);
    console.error('   错误详情:', error);
    console.error('');
    console.error('   可能的原因：');
    console.error('   1. Secret ID/Key 没有写入权限');
    console.error('   2. 集合权限设置不正确');
    console.error('   3. 数据库实例未完全启用');
  }
  console.log('');

  // 6. 总结
  console.log('='.repeat(60));
  console.log('诊断完成');
  console.log('='.repeat(60));
  console.log('');
  console.log('如何查看 CloudBase 数据：');
  console.log('1. 登录 CloudBase 控制台: https://console.cloud.tencent.com/tcb');
  console.log(`2. 选择环境: ${envId}`);
  console.log('3. 进入"数据库" → "集合管理"');
  console.log('4. 点击 "users" 集合');
  console.log('5. 在"数据管理"标签页查看数据');
  console.log('');
}

// 运行测试
testCloudBaseData()
  .then(() => {
    console.log('测试完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('测试失败:', error);
    process.exit(1);
  });



































































