/**
 * 管理员初始化脚本
 *
 * 用于在数据库中创建初始管理员账号
 * 使用方法:
 *   npx tsx scripts/init-admin.ts                    # 使用 .env.local
 *   npx tsx scripts/init-admin.ts .env.cloudbase     # 使用 .env.cloudbase
 */

import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { resolve } from "path";
import { getDatabaseAdapter } from "@/lib/admin/database";

// 加载环境变量
const envFile = process.argv[2] || ".env.local";
const envPath = resolve(process.cwd(), envFile);
console.log("========== 加载环境变量 ==========");
console.log("环境变量文件:", envPath);
const result = config({ path: envPath });
if (result.error) {
  console.error("❌ 加载环境变量失败:", result.error.message);
  console.log("提示: 请确保文件存在，或指定正确的环境变量文件");
  console.log("用法: npx tsx scripts/init-admin.ts .env.cloudbase");
  process.exit(1);
}
console.log("✅ 环境变量加载成功");
console.log("- DEPLOYMENT_REGION:", process.env.DEPLOYMENT_REGION);
console.log("- CLOUDBASE_ENV_ID:", process.env.CLOUDBASE_ENV_ID ? "已设置" : "未设置");
console.log("- NEXT_PUBLIC_SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "已设置" : "未设置");

async function initAdmin() {
  console.log("\n========== 管理员初始化脚本 ==========");
  console.log("开始时间:", new Date().toISOString());

  try {
    // 获取数据库适配器
    console.log("\n[1/4] 获取数据库适配器...");
    const db = await getDatabaseAdapter();
    console.log("✅ 数据库适配器类型:", db.constructor.name);

    // 测试数据库连接
    console.log("\n[2/4] 测试数据库连接...");
    const isConnected = await db.testConnection();
    if (!isConnected) {
      throw new Error("数据库连接失败");
    }
    console.log("✅ 数据库连接成功");

    // 检查管理员是否已存在
    console.log("\n[3/4] 检查管理员账号...");
    const username = "admin";
    const existingAdmin = await db.getAdminByUsername(username);

    if (existingAdmin) {
      console.log("⚠️  管理员账号已存在:");
      console.log("   - ID:", existingAdmin.id);
      console.log("   - 用户名:", existingAdmin.username);
      console.log("   - 角色:", existingAdmin.role);
      console.log("   - 状态:", existingAdmin.status);
      console.log("   - 创建时间:", existingAdmin.created_at);

      // 更新密码
      console.log("\n[4/4] 更新管理员密码...");
      const password = "admin123456";
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.updateAdminPassword(username, hashedPassword);
      console.log("✅ 密码已更新");
      console.log("\n登录信息:");
      console.log("   用户名: admin");
      console.log("   密码: admin123456");
    } else {
      console.log("ℹ️  管理员账号不存在，开始创建...");

      // 创建管理员
      console.log("\n[4/4] 创建管理员账号...");
      const password = "admin123456";
      const hashedPassword = await bcrypt.hash(password, 10);

      const admin = await db.createAdmin({
        username: "admin",
        password: password,
        role: "super_admin",
        created_by: "system",
      });

      console.log("✅ 管理员账号创建成功:");
      console.log("   - ID:", admin.id);
      console.log("   - 用户名:", admin.username);
      console.log("   - 角色:", admin.role);
      console.log("   - 状态:", admin.status);
      console.log("\n登录信息:");
      console.log("   用户名: admin");
      console.log("   密码: admin123456");
    }

    console.log("\n========== 初始化完成 ==========");
    console.log("结束时间:", new Date().toISOString());
    console.log("\n现在可以使用以下信息登录管理后台:");
    console.log("   URL: http://localhost:3000/admin/login");
    console.log("   用户名: admin");
    console.log("   密码: admin123456");

  } catch (error: any) {
    console.error("\n========== 初始化失败 ==========");
    console.error("错误类型:", error?.constructor?.name);
    console.error("错误消息:", error?.message);
    console.error("错误代码:", error?.code);
    console.error("错误堆栈:", error?.stack);
    console.error("\n完整错误对象:", JSON.stringify(error, null, 2));
    process.exit(1);
  }
}

// 运行初始化
initAdmin();
