/**
 * 环境变量验证
 */
import { getDeploymentRegion, isDomesticDeployment } from '@/config'

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 验证环境配置
 */
export function validateEnvironmentConfig(): ValidationResult {
  const errors: string[] = [];
  const deploymentRegion = getDeploymentRegion();
  const isDomestic = isDomesticDeployment();

  console.log('[ValidateEnv] ========== 开始环境配置验证 ==========');
  console.log('[ValidateEnv] DEPLOYMENT_REGION:', process.env.DEPLOYMENT_REGION || '(未设置)');
  console.log('[ValidateEnv] resolved deployment region:', deploymentRegion);
  console.log('[ValidateEnv] NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '已设置' : '未设置');
  console.log('[ValidateEnv] SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '已设置' : '未设置');
  console.log('[ValidateEnv] CLOUDBASE_ENV_ID:', process.env.CLOUDBASE_ENV_ID ? '已设置' : '未设置');

  console.log('[ValidateEnv] 计算结果 - isDomestic:', isDomestic);

  if (isDomestic) {
    // 使用 CloudBase 数据库
    console.log('[ValidateEnv] 使用 CloudBase 数据库模式');
    if (!process.env.CLOUDBASE_ENV_ID) {
      console.error('[ValidateEnv] 错误: 缺少 CLOUDBASE_ENV_ID');
      errors.push("缺少 CLOUDBASE_ENV_ID");
    }
    if (!process.env.CLOUDBASE_SECRET_ID) {
      console.error('[ValidateEnv] 错误: 缺少 CLOUDBASE_SECRET_ID');
      errors.push("缺少 CLOUDBASE_SECRET_ID");
    }
    if (!process.env.CLOUDBASE_SECRET_KEY) {
      console.error('[ValidateEnv] 错误: 缺少 CLOUDBASE_SECRET_KEY');
      errors.push("缺少 CLOUDBASE_SECRET_KEY");
    }
  } else {
    // 使用 Supabase 数据库
    console.log('[ValidateEnv] 使用 Supabase 数据库模式');
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('[ValidateEnv] 错误: 缺少 NEXT_PUBLIC_SUPABASE_URL');
      errors.push("缺少 NEXT_PUBLIC_SUPABASE_URL");
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[ValidateEnv] 错误: 缺少 SUPABASE_SERVICE_ROLE_KEY');
      errors.push("缺少 SUPABASE_SERVICE_ROLE_KEY");
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
