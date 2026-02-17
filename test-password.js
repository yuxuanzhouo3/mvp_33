const bcrypt = require('bcrypt');

// 从数据库中获取的密码哈希
const storedHash = '$2b$10$dO0LOsXx1o11JKtPdJMhn.7bXYhaMktk1G36Yg7iTStogzuTtsy8S';

// 用户确认的注册密码
const userPassword = 'Aa123456';

// 测试不同的密码
const testPasswords = [
  '12345678',
  '123456789',
  'password123',
  'Aa123456',
  'Aa123456 ', // 带尾部空格
  ' Aa123456', // 带前导空格
];

console.log('测试密码验证...\n');

testPasswords.forEach(async (password) => {
  try {
    const isValid = await bcrypt.compare(password, storedHash);
    console.log(`密码 "${password}": ${isValid ? '✓ 匹配' : '✗ 不匹配'}`);
  } catch (error) {
    console.error(`密码 "${password}": 错误 -`, error.message);
  }
});

// 也测试一下生成新的哈希
console.log('\n生成新的密码哈希测试:');
bcrypt.hash('12345678', 10).then(hash => {
  console.log('新哈希:', hash);
  bcrypt.compare('12345678', hash).then(result => {
    console.log('新哈希验证:', result ? '✓ 成功' : '✗ 失败');
  });
});
