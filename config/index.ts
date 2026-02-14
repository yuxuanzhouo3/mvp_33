// 读取和规范化环境变量
const envDefaultLang = (process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE || "en").toLowerCase();
export const DEFAULT_LANGUAGE: string = envDefaultLang === "zh" ? "zh" : "en";

// 版本标识
// 优先检查 FORCE_GLOBAL_DATABASE，如果设置为 true，则强制使用国际版（Supabase）
export const IS_DOMESTIC_VERSION = process.env.FORCE_GLOBAL_DATABASE === "true"
  ? false
  : DEFAULT_LANGUAGE === "zh";

// 地区标识 (兼容现有代码)
export const DEFAULT_REGION: 'cn' | 'global' = IS_DOMESTIC_VERSION ? 'cn' : 'global';

// 应用配置
export const APP_CONFIG = {
  name: "Enterprise Chat",
  description: IS_DOMESTIC_VERSION
    ? "企业级通讯平台"
    : "Enterprise Communication Platform",
};

// 数据库配置
export const DATABASE_CONFIG = {
  domestic: {
    provider: "cloudbase",
    region: "cn" as const,
  },
  international: {
    provider: "supabase",
    region: "global" as const,
  },
};

// 获取当前数据库配置
export const getCurrentDatabaseConfig = () => {
  return IS_DOMESTIC_VERSION ? DATABASE_CONFIG.domestic : DATABASE_CONFIG.international;
};
