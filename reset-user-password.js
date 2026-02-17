/**
 * 重置用户密码脚本
 * 使用方法: node reset-user-password.js <email> <new-password>
 */

const bcrypt = require('bcrypt');

// 从命令行参数获取邮箱和新密码
const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('使用方法: node reset-user-password.js <email> <new-password>');
  console.error('示例: node reset-user-password.js 1524389441@qq.com Aa123456');
  process.exit(1);
}

console.log('=== 密码重置工具 ===\n');
console.log('邮箱:', email);
console.log('新密码:', newPassword);
console.log('');

// 生成新的密码哈希
bcrypt.hash(newPassword, 10).then(newHash => {
  console.log('✓ 新密码哈希已生成:');
  console.log(newHash);
  console.log('');
  console.log('请使用 CloudBase MCP 工具执行以下更新操作:');
  console.log('');
  console.log('工具: mcp__cloudbase__writeNoSqlDatabaseContent');
  console.log('参数:');
  console.log(JSON.stringify({
    action: 'update',
    collectionName: 'users',
    query: { email: email },
    update: { $set: { password_hash: newHash } }
  }, null, 2));
  console.log('');
  console.log('或者复制以下 JSON 格式:');
  console.log('');
  console.log('{');
  console.log('  "action": "update",');
  console.log('  "collectionName": "users",');
  console.log('  "query": {"email": "' + email + '"},');
  console.log('  "update": {"$set": {"password_hash": "' + newHash + '"}}');
  console.log('}');
}).catch(error => {
  console.error('错误:', error);
  process.exit(1);
});
