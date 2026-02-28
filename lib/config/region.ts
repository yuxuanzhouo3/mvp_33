import { getDeploymentRegion } from '@/config'

/**
 * 区域配置
 */

/**
 * 判断是否是中国区域
 * 仅使用 DEPLOYMENT_REGION（通过 config/index.ts 统一解析）
 */
export function isChinaRegion(): boolean {
  return getDeploymentRegion() === 'CN'
}

/**
 * 区域配置对象
 */
export const RegionConfig = {
  payment: {
    methods: isChinaRegion() ? ['wechat', 'alipay'] : ['stripe', 'paypal'],
    currency: isChinaRegion() ? 'CNY' : 'USD',
  },
  region: isChinaRegion() ? 'CN' : 'INTL',
  isDomestic: isChinaRegion(),
}
