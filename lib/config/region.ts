/**
 * 区域配置
 */

/**
 * 判断是否是中国区域
 */
export function isChinaRegion(): boolean {
  return process.env.FORCE_GLOBAL_DATABASE !== "true";
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
