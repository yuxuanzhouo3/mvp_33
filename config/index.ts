// 明确的部署区域标识
const DEPLOYMENT_REGION = process.env.NEXT_PUBLIC_DEPLOYMENT_REGION || "INTL";

export const IS_CN_DEPLOYMENT = DEPLOYMENT_REGION === "CN";
export const IS_INTL_DEPLOYMENT = DEPLOYMENT_REGION === "INTL";

// 向后兼容
export const IS_DOMESTIC_VERSION = IS_CN_DEPLOYMENT;
export const DEFAULT_REGION: 'cn' | 'global' = IS_CN_DEPLOYMENT ? 'cn' : 'global';
export const DEFAULT_LANGUAGE = IS_CN_DEPLOYMENT ? 'zh' : 'en';

// 应用配置
export const APP_CONFIG = {
  name: "Enterprise Chat",
  description: IS_CN_DEPLOYMENT ? "企业级通讯平台" : "Enterprise Communication Platform",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
};

// 数据库配置
export const DATABASE_CONFIG = {
  domestic: {
    provider: "cloudbase",
    region: "cn" as const,
    enabled: IS_CN_DEPLOYMENT,
  },
  international: {
    provider: "supabase",
    region: "global" as const,
    enabled: IS_INTL_DEPLOYMENT,
  },
};

// 获取当前数据库配置
export const getCurrentDatabaseConfig = () => {
  return IS_CN_DEPLOYMENT ? DATABASE_CONFIG.domestic : DATABASE_CONFIG.international;
};
