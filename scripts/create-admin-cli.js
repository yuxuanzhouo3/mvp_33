/**
 * 命令行方式创建管理员账户
 * 用法: node create-admin-cli.js <username> <password>
 */

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.error('用法: node create-admin-cli.js <username> <password>');
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('错误: 缺少 Supabase 配置');
    console.error('请确保 .env.local 文件中包含:');
    console.error('- NEXT_PUBLIC_SUPABASE_URL');
    console.error('- SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    // 检查用户是否已存在
    const { data: existing } = await supabase
      .from('admins')
      .select('id')
      .eq('username', username)
      .single();

    if (existing) {
      // 更新现有用户
      const { error } = await supabase
        .from('admins')
        .update({
          password_hash: passwordHash,
          updated_at: now,
        })
        .eq('username', username);

      if (error) throw error;
      console.log('✓ 管理员密码已更新');
      console.log(`用户名: ${username}`);
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
      console.log('✓ 管理员账号创建成功');
      console.log(`用户名: ${username}`);
      console.log(`ID: ${data.id}`);
    }
  } catch (error) {
    console.error('错误:', error.message);
    process.exit(1);
  }
}

main();
