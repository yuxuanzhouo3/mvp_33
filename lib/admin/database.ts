/**
 * 数据库适配器接口定义
 *
 * 定义统一的数据访问层，支持多种数据库实现
 * 实现数据库无关的业务逻辑，便于测试和切换数据库
 */

import type {
  AdminUser,
  CreateAdminData,
  UpdateAdminData,
  AdminFilters,
  SystemLog,
  CreateLogData,
  LogFilters,
  SystemConfig,
  ConfigCategory,
  AdminDatabaseAdapter,
} from "./types";
import { CloudBaseAdminAdapter } from "./cloudbase-adapter";
import { SupabaseAdminAdapter } from "./supabase-adapter";
import { validateEnvironmentConfig } from "../config/validate-env";
import { IS_DOMESTIC_VERSION } from '@/config';

// ==================== 数据库适配器工厂 ====================

/**
 * 获取数据库适配器实例
 *
 * 根据 IS_DOMESTIC_VERSION 环境变量选择对应的数据库适配器
 * 使用单例模式避免重复初始化
 *
 * @returns 数据库适配器实例
 */
let adapterInstance: AdminDatabaseAdapter | null = null;

export function getDatabaseAdapter(): AdminDatabaseAdapter {
  if (adapterInstance) {
    console.log('[Database] 使用缓存的适配器实例');
    return adapterInstance;
  }

  const isDomestic = IS_DOMESTIC_VERSION;
  console.log('[Database] 初始化数据库适配器');
  console.log('[Database] 区域配置:', isDomestic ? 'CN' : 'INTL');
  console.log('[Database] 时间戳:', new Date().toISOString());

  // 验证环境配置
  const validation = validateEnvironmentConfig();
  if (!validation.valid) {
    console.error('[Database] 环境配置验证失败');
    throw new Error(
      `环境配置错误: ${validation.errors.join('; ')}`
    );
  }

  if (isDomestic) {
    console.log('[Database] 创建 CloudBase 适配器');
    adapterInstance = new CloudBaseAdminAdapter();
  } else {
    console.log('[Database] 创建 Supabase 适配器');
    adapterInstance = new SupabaseAdminAdapter();
  }

  console.log('[Database] 适配器类型:', adapterInstance.constructor.name);
  return adapterInstance;
}

/**
 * 重置适配器实例
 * 用于测试或环境切换
 */
export function resetDatabaseAdapter(): void {
  adapterInstance = null;
}

// ==================== 通用错误处理 ====================

/**
 * 数据库错误类
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

/**
 * 处理数据库错误
 * 统一的错误处理逻辑
 */
export function handleDatabaseError(error: any): never {
  console.error('[Database Error] 完整错误详情:', {
    message: error.message,
    code: error.code,
    name: error.name,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    details: error
  });

  // 错误代码映射
  const errorMap: Record<string, string> = {
    'DUPLICATE_KEY': '数据已存在',
    'NOT_FOUND': '数据不存在',
    'INVALID_INPUT': '输入数据无效',
    'PERMISSION_DENIED': '权限不足',
    'CONNECTION_FAILED': '数据库连接失败',
    'TIMEOUT': '数据库操作超时'
  };

  const userMessage = errorMap[error.code] || '数据库操作失败，请稍后重试';
  const errorCode = error.code || 'DATABASE_ERROR';

  throw new DatabaseError(
    `${userMessage} (错误代码: ${errorCode})`,
    errorCode,
    error
  );
}

// ==================== 类型转换工具 ====================

/**
 * 转换日期为 ISO 字符串
 */
export function toISOString(date: Date | string | number): string {
  if (typeof date === "string") {
    return date;
  }
  if (typeof date === "number") {
    return new Date(date).toISOString();
  }
  return date.toISOString();
}

/**
 * 转换数据库字段名
 * 将数据库的 snake_case 转换为 camelCase
 */
export function snakeToCamel<T = any>(obj: any): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(snakeToCamel) as any;
  }

  const result: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) =>
        letter.toUpperCase()
      );
      result[camelKey] = snakeToCamel(obj[key]);
    }
  }
  return result;
}

/**
 * 转换为数据库字段名
 * 将 camelCase 转换为 snake_case
 */
export function camelToSnake(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(camelToSnake);
  }

  const result: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const snakeKey = key.replace(
        /[A-Z]/g,
        (letter) => `_${letter.toLowerCase()}`
      );
      result[snakeKey] = camelToSnake(obj[key]);
    }
  }
  return result;
}
