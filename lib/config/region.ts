/**
 * 区域配置
 */

/**
 * 判断是否是中国区域
 * 与 config/index.ts 中的 IS_DOMESTIC_VERSION 逻辑保持一致
 */
export function isChinaRegion(): boolean {
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
