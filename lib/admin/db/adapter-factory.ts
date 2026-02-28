/**
 * 数据库适配器工厂
 * 根据环境变量自动选择 CloudBase 或 Supabase 适配器
 */

import { CloudBaseAdminAdapter } from "../cloudbase-adapter";
import { SupabaseAdminAdapter } from "../supabase-adapter";
import type { AdminDatabaseAdapter } from "../types";
import { getDeploymentRegion } from "@/config";

/**
 * 获取管理后台数据库适配器
 */
export function getAdminAdapter(): AdminDatabaseAdapter {
  const isDomestic = getDeploymentRegion() === "CN";
  if (!isDomestic) {
    console.log("[AdapterFactory] 使用 Supabase 适配器（INTL）");
    return new SupabaseAdminAdapter();
  }

  console.log("[AdapterFactory] 使用 CloudBase 适配器（CN）");
  return new CloudBaseAdminAdapter();
}
