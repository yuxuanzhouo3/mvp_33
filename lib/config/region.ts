/**
 * 区域配置
 */

/**
 * 判断是否是中国区域
 * 优先使用 NEXT_PUBLIC_DEPLOYMENT_REGION 变量
 * 与 config/index.ts 中的 IS_DOMESTIC_VERSION 逻辑保持一致
 */
export function isChinaRegion(): boolean {
  // 优先使用 NEXT_PUBLIC_DEPLOYMENT_REGION 变量（与 config/index.ts 一致）
  const deploymentRegion = process.env.NEXT_PUBLIC_DEPLOYMENT_REGION;
  if (deploymentRegion === "CN") {
    return true;
  }
  if (deploymentRegion === "INTL") {
    return false;
  }

  // 兼容旧的判断逻辑
  const envDefaultLang = (process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE || "en").toLowerCase();
  const defaultLanguage = envDefaultLang === "zh" ? "zh" : "en";
  const isDomestic = process.env.FORCE_GLOBAL_DATABASE === "true" ? false : defaultLanguage === "zh";
  return isDomestic;
}

/**
 * 区域配置对象
 */
export const RegionConfig = {
  payment: {
    methods: isChinaRegion() ? ["wechat", "alipay"] : ["stripe", "paypal"],
    currency: isChinaRegion() ? "CNY" : "USD",
  },
  region: isChinaRegion() ? "CN" : "INTL",
  isDomestic: isChinaRegion(),
};
