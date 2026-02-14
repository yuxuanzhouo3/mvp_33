/**
 * 简化版创建初始管理员账号脚本
 * 直接使用 Supabase 适配器
 */

import * as readline from "readline";
import { SupabaseAdminAdapter } from "../lib/admin/supabase-adapter";
import { hashPassword } from "../lib/admin/utils/password";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function main() {
  console.log("=== 创建初始管理员账号 ===\n");

  const username = await question("请输入管理员用户名: ");
  const password = await question("请输入管理员密码: ");

  if (!username || !password) {
    console.error("用户名和密码不能为空");
    process.exit(1);
  }

  const adapter = new SupabaseAdminAdapter();
  const passwordHash = await hashPassword(password);

  try {
    await adapter.updateAdminPassword(username, passwordHash);
    console.log(`\n✓ 管理员账号创建成功!`);
    console.log(`用户名: ${username}`);
  } catch (error) {
    console.error("创建失败:", error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
