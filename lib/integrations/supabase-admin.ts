/**
 * Supabase Admin 客户端
 * 使用 service role key 进行管理操作
 */

import { createClient } from "@supabase/supabase-js";

let supabaseAdmin: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin() {
  if (supabaseAdmin) {
    console.log('[SupabaseAdmin] 返回已缓存的 Supabase 客户端');
    return supabaseAdmin;
  }

  console.log('[SupabaseAdmin] ========== 初始化 Supabase 客户端 ==========');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('[SupabaseAdmin] NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl);
  console.log('[SupabaseAdmin] SUPABASE_SERVICE_ROLE_KEY 已设置:', !!supabaseServiceKey);
  console.log('[SupabaseAdmin] SUPABASE_SERVICE_ROLE_KEY 长度:', supabaseServiceKey?.length);

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[SupabaseAdmin] ❌ 缺少 Supabase 配置');
    console.error('[SupabaseAdmin] - URL 已设置:', !!supabaseUrl);
    console.error('[SupabaseAdmin] - Service Key 已设置:', !!supabaseServiceKey);
    throw new Error("缺少 Supabase 配置");
  }

  try {
    console.log('[SupabaseAdmin] 创建 Supabase 客户端...');
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    console.log('[SupabaseAdmin] ✓ Supabase 客户端创建成功');
    console.log('[SupabaseAdmin] ========== Supabase 客户端初始化完成 ==========');
    return supabaseAdmin;
  } catch (error: any) {
    console.error('[SupabaseAdmin] ❌ 创建 Supabase 客户端失败:', error);
    console.error('[SupabaseAdmin] 错误消息:', error?.message);
    console.error('[SupabaseAdmin] 错误堆栈:', error?.stack);
    throw error;
  }
}
