/**
 * GeoRouter - IP 地理位置检测核心类
 *
 * 功能：
 * 1. 多服务降级检测（ipapi.co -> ip-api.com -> ipinfo.io）
 * 2. 请求缓存和去重
 * 3. 重试机制
 * 4. Fail-closed 安全策略
 */

import {
  RegionType,
  GeoResult,
  getRegionFromCountryCode,
  getCurrencyByRegion,
  getPaymentMethodsByRegion,
  getAuthMethodsByRegion,
} from "../utils/ip-detection";

export class GeoRouter {
  private cache = new Map<string, { result: GeoResult; timestamp: number }>();
  private pendingRequests = new Map<string, Promise<GeoResult>>();
  private readonly CACHE_TTL = 1000 * 60 * 60; // 1小时缓存
  private readonly MAX_CACHE_SIZE = 10000; // 最大缓存条目数
  private readonly REQUEST_TIMEOUT = 5000; // 5秒超时
  private readonly MAX_RETRIES = 2;
  private readonly FAIL_CLOSED =
    (process.env.GEO_FAIL_CLOSED || "true").toLowerCase() === "true";

  /**
   * 检测IP并返回完整的地理路由配置
   */
  async detect(ip: string): Promise<GeoResult> {
    // 检查缓存
    const cached = this.cache.get(ip);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result;
    }

    // 检查是否有正在进行的请求（去重）
    const pending = this.pendingRequests.get(ip);
    if (pending) {
      return pending;
    }

    // 创建新的请求
    const requestPromise = this.performDetection(ip);
    this.pendingRequests.set(ip, requestPromise);

    try {
      const result = await requestPromise;
      // 缓存大小限制：超过阈值时清理过期条目
      if (this.cache.size >= this.MAX_CACHE_SIZE) {
        this.pruneExpiredCache();
      }
      this.cache.set(ip, { result, timestamp: Date.now() });
      return result;
    } catch (error) {
      console.error("[GeoRouter] Detection failed with all fallbacks:", error);

      if (this.FAIL_CLOSED) {
        throw new Error("Geo detection failed (fail-closed)");
      }

      // 返回默认配置作为最后的降级
      const defaultResult = this.getDefaultGeoResult();
      this.cache.set(ip, { result: defaultResult, timestamp: Date.now() });
      return defaultResult;
    } finally {
      this.pendingRequests.delete(ip);
    }
  }

  private async performDetection(ip: string): Promise<GeoResult> {
    const services = [
      { name: "ipapi.co", fn: () => this.detectWithPrimaryService(ip) },
      { name: "ip-api.com", fn: () => this.detectWithFallbackService(ip) },
      { name: "ipinfo.io", fn: () => this.detectWithThirdFallback(ip) },
    ];

    for (const service of services) {
      try {
        console.info(`[GeoRouter] Trying ${service.name}...`);
        return await this.withRetry(service.fn, this.MAX_RETRIES);
      } catch (error) {
        console.warn(`[GeoRouter] ${service.name} failed:`, error);
      }
    }

    // 所有服务都失败，使用本地检测
    console.info("[GeoRouter] All services failed, using local detection");
    return this.detectLocally(ip);
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number
  ): Promise<T> {
    let lastError: Error = new Error("Unknown error");

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          const delay = 1000 * (attempt + 1);
          console.info(`[GeoRouter] Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private buildIpapiUrl(ip?: string): string {
    const base = process.env.IP_API_URL || "https://ipapi.co";
    const trimmed = base.replace(/\/json\/?$/, "").replace(/\/$/, "");
    if (ip) {
      return `${trimmed}/${ip}/json/`;
    }
    return `${trimmed}/json/`;
  }

  /**
   * 主检测服务 - ipapi.co
   */
  private async detectWithPrimaryService(ip: string): Promise<GeoResult> {
    if (!ip || ip === "" || ip === "::1" || ip === "127.0.0.1") {
      return this.detectLocally(ip);
    }

    const url = this.buildIpapiUrl(ip);
    const response = await this.fetchWithTimeout(url, this.REQUEST_TIMEOUT);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`API error: ${data.reason || data.error}`);
    }

    if (!data.country_code) {
      throw new Error("Invalid response: missing country_code");
    }

    return this.buildGeoResult(data.country_code);
  }

  /**
   * 备用检测服务 - ip-api.com
   */
  private async detectWithFallbackService(ip: string): Promise<GeoResult> {
    if (!ip || ip === "" || ip === "::1" || ip === "127.0.0.1") {
      return this.detectLocally(ip);
    }

    const response = await this.fetchWithTimeout(
      `http://ip-api.com/json/${ip}`,
      this.REQUEST_TIMEOUT
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.status === "fail") {
      throw new Error(`API error: ${data.message}`);
    }

    if (!data.countryCode) {
      throw new Error("Invalid response: missing countryCode");
    }

    return this.buildGeoResult(data.countryCode);
  }

  /**
   * 第三备用服务 - ipinfo.io
   */
  private async detectWithThirdFallback(ip: string): Promise<GeoResult> {
    if (!ip || ip === "" || ip === "::1" || ip === "127.0.0.1") {
      return this.detectLocally(ip);
    }

    const response = await this.fetchWithTimeout(
      `https://ipinfo.io/${ip}/json`,
      this.REQUEST_TIMEOUT
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const countryCode = data.country;

    if (!countryCode) {
      throw new Error("Invalid response: missing country");
    }

    return this.buildGeoResult(countryCode);
  }

  /**
   * 本地检测（最后的降级策略）
   */
  private detectLocally(ip: string): GeoResult {
    if (this.isPrivateIP(ip)) {
      // 内网IP，默认为中国（开发环境）
      return this.buildGeoResult("CN");
    }
    // 默认海外
    return this.buildGeoResult("US");
  }

  /**
   * 构建地理结果
   */
  private buildGeoResult(countryCode: string): GeoResult {
    const code = (countryCode || "").toUpperCase();
    const region = getRegionFromCountryCode(code);

    return {
      region,
      countryCode: code,
      currency: getCurrencyByRegion(region),
      paymentMethods: getPaymentMethodsByRegion(region),
      authMethods: getAuthMethodsByRegion(region),
    };
  }

  /**
   * 检查是否为私有IP
   */
  private isPrivateIP(ip: string): boolean {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4) return false;

    return (
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    );
  }

  /**
   * 获取默认地理结果（海外）
   */
  private getDefaultGeoResult(): GeoResult {
    return {
      region: RegionType.USA,
      countryCode: "US",
      currency: "USD",
      paymentMethods: ["stripe", "paypal"],
      authMethods: ["google", "email"],
    };
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 清理过期缓存条目
   */
  private pruneExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache) {
      if (now - value.timestamp >= this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }
    // 如果清理后仍超过限制，删除最旧的条目
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toDelete = entries.slice(0, Math.floor(this.MAX_CACHE_SIZE * 0.2));
      toDelete.forEach(([key]) => this.cache.delete(key));
    }
  }
}

// 导出单例实例
export const geoRouter = new GeoRouter();
