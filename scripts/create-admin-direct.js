/**
 * 直接通过 Supabase 创建管理员账户
 */

// 加载环境变量
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function main() {
  console.log('=== 创建初始管理员账号 ===\n');

  const username = await question('请输入管理员用户名: ');
  const password = await question('请输入管理员密码: ');

  if (!username || !password) {
    console.error('用户名和密码不能为空');
    process.exit(1);
  }

  // 从环境变量读取 Supabase 配置
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('缺少 Supabase 配置，请检查环境变量');
    process.exit(1);
  }

  // 创建 Supabase 客户端
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 哈希密码
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    // 检查用户是否已存在
    const { data: existing } = await supabase
      .from('admins')
      .select('id')
      .eq('username', username)
      .single();

    if (existing) {
      // 更新现有用户的密码
      const { error } = await supabase
        .from('admins')
        .update({
          password_hash: passwordHash,
          updated_at: now,
        })
        .eq('username', username);

      if (error) throw error;
      console.log(`\n✓ 管理员密码已更新!`);
    } else {
      // 创建新用户
      const { data, error } = await supabase
        .from('admins')
        .insert({
          username,
          password_hash: passwordHash,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (error) throw error;
      console.log(`\n✓ 管理员账号创建成功!`);
      console.log(`用户名: ${username}`);
      console.log(`ID: ${data.id}`);
    }
  } catch (error) {
    console.error('操作失败:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
