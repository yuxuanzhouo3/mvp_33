const bcrypt = require('bcrypt');

// 用户确认的注册密码
const userPassword = 'Aa123456';

// 数据库中存储的哈希
const storedHash = '$2b$10$dO0LOsXx1o11JKtPdJMhn.7bXYhaMktk1G36Yg7iTStogzuTtsy8S';

console.log('=== 密码哈希测试 ===\n');
console.log('用户密码:', userPassword);
console.log('数据库哈希:', storedHash);
console.log('');

// 测试1: 验证用户密码是否匹配数据库哈希
bcrypt.compare(userPassword, storedHash).then(isMatch => {
  console.log('测试1 - 密码验证结果:', isMatch ? '✓ 匹配' : '✗ 不匹配');

  // 测试2: 生成新的哈希并验证
  console.log('\n测试2 - 生成新哈希:');
  return bcrypt.hash(userPassword, 10);
}).then(newHash => {
  console.log('新生成的哈希:', newHash);

  // 验证新哈希
  return bcrypt.compare(userPassword, newHash).then(isMatch => {
    console.log('新哈希验证结果:', isMatch ? '✓ 匹配' : '✗ 不匹配');

    // 测试3: 尝试反向工程 - 测试各种可能的密码
    console.log('\n测试3 - 尝试常见密码变体:');
    const variants = [
      'Aa123456',
      'aa123456',
      'AA123456',
      'Aa123456!',
      'Aa@123456',
      'aA123456',
    ];

    return Promise.all(variants.map(pwd =>
      bcrypt.compare(pwd, storedHash).then(match => ({
        password: pwd,
        match: match
      }))
    ));
  });
}).then(results => {
  results.forEach(result => {
    console.log(`  "${result.password}": ${result.match ? '✓ 匹配' : '✗ 不匹配'}`);
  });

  console.log('\n=== 结论 ===');
  console.log('如果所有测试都显示"不匹配"，说明数据库中的哈希可能是用不同的密码生成的。');
}).catch(error => {
  console.error('错误:', error);
});
