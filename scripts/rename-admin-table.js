/**
 * 重命名 admins 表为 admin_users
 *
 * 使用方法：
 * node scripts/rename-admin-table.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function renameAdminTable() {
  console.log('========== 开始重命名管理员表 ==========');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ 缺少 Supabase 配置');
    console.error('请确保 .env.local 中设置了:');
    console.error('- NEXT_PUBLIC_SUPABASE_URL');
    console.error('- SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log('✓ Supabase URL:', supabaseUrl);
  console.log('✓ Service Key 已设置');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 执行重命名操作
    console.log('\n步骤 1: 重命名 admins 表为 admin_users...');
    const { error: renameError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE admins RENAME TO admin_users;'
    });

    if (renameError) {
      console.error('❌ 重命名表失败:', renameError);
      throw renameError;
    }
    console.log('✓ 表重命名成功');

    // 更新外键约束
    console.log('\n步骤 2: 更新 admin_sessions 表的外键约束...');
    const { error: fkError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE admin_sessions DROP CONSTRAINT IF EXISTS admin_sessions_admin_id_fkey;
        ALTER TABLE admin_sessions ADD CONSTRAINT admin_sessions_admin_id_fkey
          FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE;
      `
    });

    if (fkError) {
      console.error('❌ 更新外键失败:', fkError);
      throw fkError;
    }
    console.log('✓ 外键约束更新成功');

    // 验证表已成功重命名
    console.log('\n步骤 3: 验证表已成功重命名...');
    const { data, error: verifyError } = await supabase
      .from('admin_users')
      .select('id, username, role, status')
      .limit(5);

    if (verifyError) {
      console.error('❌ 验证失败:', verifyError);
      throw verifyError;
    }

    console.log('✓ 验证成功！找到', data.length, '个管理员账号');
    console.log('\n管理员列表:');
    data.forEach(admin => {
      console.log(`  - ${admin.username} (${admin.role}, ${admin.status})`);
    });

    console.log('\n========== 表重命名完成 ==========');
    console.log('✓ admins 表已成功重命名为 admin_users');
    console.log('✓ 现在可以使用管理员账号登录后台了');

  } catch (error) {
    console.error('\n========== 操作失败 ==========');
    console.error('错误详情:', error);
    process.exit(1);
  }
}

renameAdminTable();
