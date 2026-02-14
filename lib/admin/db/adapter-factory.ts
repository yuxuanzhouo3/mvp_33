/**
 * 数据库适配器工厂
 * 根据环境变量自动选择 CloudBase 或 Supabase 适配器
 */

import { CloudBaseAdminAdapter } from "../cloudbase-adapter";
import { SupabaseAdminAdapter } from "../supabase-adapter";
import type { AdminDatabaseAdapter } from "../types";

/**
 * 获取管理后台数据库适配器
 */
export function getAdminAdapter(): AdminDatabaseAdapter {
  const forceGlobal = process.env.FORCE_GLOBAL_DATABASE === "true";

  if (forceGlobal) {
    console.log("[AdapterFactory] 使用 Supabase 适配器（强制全球数据库）");
    return new SupabaseAdminAdapter();
  }

  // 默认使用 CloudBase
  console.log("[AdapterFactory] 使用 CloudBase 适配器");
  return new CloudBaseAdminAdapter();
}
