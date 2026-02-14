/**
 * 验证工具函数
 */

/**
 * 验证支付统计数据是否有效
 */
export function isValidPaymentStats(stats: any): boolean {
  if (!stats || typeof stats !== "object") {
    return false;
  }

  // 检查必需的字段是否存在
  return (
    typeof stats.total === "number" &&
    typeof stats.thisMonth === "number" &&
    typeof stats.today === "number" &&
    typeof stats.totalRevenue === "number"
  );
}

/**
 * 验证用户统计数据是否有效
 */
export function isValidUserStats(stats: any): boolean {
  if (!stats || typeof stats !== "object") {
    return false;
  }

  return (
    typeof stats.total === "number" &&
    typeof stats.active === "number"
  );
}
