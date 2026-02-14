/**
 * 环境变量验证
 */

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 验证环境配置
 */
export function validateEnvironmentConfig(): ValidationResult {
  const errors: string[] = [];

  console.log('[ValidateEnv] ========== 开始环境配置验证 ==========');
  console.log('[ValidateEnv] FORCE_GLOBAL_DATABASE:', process.env.FORCE_GLOBAL_DATABASE);
  console.log('[ValidateEnv] NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '已设置' : '未设置');
  console.log('[ValidateEnv] SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '已设置' : '未设置');
  console.log('[ValidateEnv] CLOUDBASE_ENV_ID:', process.env.CLOUDBASE_ENV_ID ? '已设置' : '未设置');

  // 检查 Supabase 配置
  if (process.env.FORCE_GLOBAL_DATABASE === "true") {
    console.log('[ValidateEnv] 使用 Supabase 数据库模式');
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('[ValidateEnv] 错误: 缺少 NEXT_PUBLIC_SUPABASE_URL');
      errors.push("缺少 NEXT_PUBLIC_SUPABASE_URL");
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[ValidateEnv] 错误: 缺少 SUPABASE_SERVICE_ROLE_KEY');
      errors.push("缺少 SUPABASE_SERVICE_ROLE_KEY");
    }
  } else {
    // 检查 CloudBase 配置
    console.log('[ValidateEnv] 使用 CloudBase 数据库模式');
    if (!process.env.CLOUDBASE_ENV_ID) {
      console.error('[ValidateEnv] 错误: 缺少 CLOUDBASE_ENV_ID');
      errors.push("缺少 CLOUDBASE_ENV_ID");
    }
  }

  console.log('[ValidateEnv] 验证结果:', errors.length === 0 ? '通过' : '失败');
  if (errors.length > 0) {
    console.error('[ValidateEnv] 错误列表:', errors);
  }
  console.log('[ValidateEnv] ========== 环境配置验证结束 ==========');

  return {
    valid: errors.length === 0,
    errors,
  };
}
