/**
 * Supabase 数据库适配器
 *
 * 实现 PostgreSQL 数据库的管理后台操作
 * 用于国际版（INTL）部署环境
 *
 * 表命名：
 * - admin_users: 管理员用户
 * - system_logs: 系统操作日志
 * - system_config: 系统配置
 */

import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "@/lib/integrations/supabase-admin";
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
  User,
  UserFilters,
  Assessment,
  AssessmentFilters,
  Payment,
  PaymentFilters,
  Advertisement,
  AdFilters,
  CreateAdData,
  UpdateAdData,
  AdStats,
  SocialLink,
  CreateSocialLinkData,
  UpdateSocialLinkData,
  Release,
  ReleaseFilters,
  CreateReleaseData,
  UpdateReleaseData,
} from "./types";
import { handleDatabaseError, toISOString } from "./database";

// ==================== Supabase 适配器类 ====================

/**
 * Supabase 管理后台数据库适配器
 */
export class SupabaseAdminAdapter implements AdminDatabaseAdapter {
  private supabase: any;

  constructor() {
    this.supabase = getSupabaseAdmin();
  }

  /**
   * 测试数据库连接
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('[Supabase] 测试数据库连接...');
      const { error } = await this.supabase.from('admin_users').select('id').limit(1);
      if (error) throw error;
      console.log('[Supabase] 连接测试成功');
      return true;
    } catch (error) {
      console.error('[Supabase] 连接测试失败:', error);
      return false;
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 转换 AdminUser 为数据库格式
   */
  private adminUserToDb(user: Partial<AdminUser>): any {
    const data: any = {
      updated_at: toISOString(new Date()),
    };

    if (user.username !== undefined) data.username = user.username;
    if (user.role !== undefined) data.role = user.role;
    if (user.status !== undefined) data.status = user.status;
    if (user.last_login_at !== undefined) data.last_login_at = user.last_login_at;
    if (user.created_by !== undefined) data.created_by = user.created_by;

    return data;
  }

  /**
   * 从数据库格式转换为 AdminUser
   */
  private dbToAdminUser(doc: any): AdminUser {
    return {
      id: doc.id,
      username: doc.username,
      password_hash: doc.password_hash,
      role: doc.role,
      status: doc.status,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      last_login_at: doc.last_login_at,
      created_by: doc.created_by,
    };
  }

  /**
   * 从数据库格式转换为 SystemLog
   */
  private dbToSystemLog(doc: any): SystemLog {
    return {
      id: doc.id,
      admin_id: doc.admin_id,
      admin_username: doc.admin_username,
      action: doc.action,
      resource_type: doc.resource_type,
      resource_id: doc.resource_id,
      details: doc.details || {},
      ip_address: doc.ip_address,
      user_agent: doc.user_agent,
      status: doc.status,
      error_message: doc.error_message,
      created_at: doc.created_at,
    };
  }

  /**
   * 从数据库格式转换为 SystemConfig
   */
  private dbToSystemConfig(doc: any): SystemConfig {
    return {
      id: doc.id,
      key: doc.key,
      value: doc.value,
      description: doc.description,
      category: doc.category,
      updated_at: doc.updated_at,
    };
  }

  /**
   * 处理 Supabase 查询结果
   */
  private handleQueryResult(result: any, errorMessage: string) {
    if (result.error) {
      console.error(errorMessage, result.error);
      throw handleDatabaseError({
        code: result.error.code,
        message: result.error.message,
      });
    }
    return result.data;
  }

  // ==================== 管理员操作 ====================

  /**
   * 根据用户名获取管理员
   */
  async getAdminByUsername(username: string): Promise<AdminUser | null> {
    const result = await this.supabase
      .from("admin_users")
      .select("*")
      .eq("username", username)
      .single();

    if (result.error) {
      // 记录不存在
      if (result.error.code === "PGRST116") {
        return null;
      }
      throw handleDatabaseError(result.error);
    }

    if (!result.data) {
      return null;
    }

    return this.dbToAdminUser(result.data);
  }

  /**
   * 根据 ID 获取管理员
   */
  async getAdminById(id: string): Promise<AdminUser | null> {
    const result = await this.supabase
      .from("admin_users")
      .select("*")
      .eq("id", id)
      .single();

    if (result.error) {
      if (result.error.code === "PGRST116") {
        return null;
      }
      throw handleDatabaseError(result.error);
    }

    if (!result.data) {
      return null;
    }

    return this.dbToAdminUser(result.data);
  }

  /**
   * 创建管理员
   */
  async createAdmin(data: CreateAdminData): Promise<AdminUser> {
    const now = toISOString(new Date());

    // 哈希密码
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const doc = {
      username: data.username,
      password_hash: hashedPassword,
      role: data.role || "admin",
      status: "active",
      created_at: now,
      updated_at: now,
      created_by: data.created_by,
    };

    const result = await this.supabase
      .from("admin_users")
      .insert(doc)
      .select()
      .single();

    if (result.error) {
      // 检查唯一约束冲突
      if (result.error.code === "23505") {
        throw handleDatabaseError({
          code: "DUPLICATE_KEY",
          message: "用户名已存在",
          details: result.error,
        });
      }
      throw handleDatabaseError(result.error);
    }

    return this.dbToAdminUser(result.data);
  }

  /**
   * 更新管理员
   */
  async updateAdmin(id: string, data: UpdateAdminData): Promise<AdminUser> {
    const updates: any = this.adminUserToDb(data);

    // 如果需要更新密码，先哈希
    if (data.password) {
      updates.password_hash = await bcrypt.hash(data.password, 10);
    }

    const result = await this.supabase
      .from("admin_users")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (result.error) {
      throw handleDatabaseError(result.error);
    }

    return this.dbToAdminUser(result.data);
  }

  /**
   * 删除管理员
   */
  async deleteAdmin(id: string): Promise<void> {
    const result = await this.supabase
      .from("admin_users")
      .delete()
      .eq("id", id);

    if (result.error) {
      throw handleDatabaseError(result.error);
    }
  }

  /**
   * 列出所有管理员
   */
  async listAdmins(filters?: AdminFilters): Promise<AdminUser[]> {
    let query = this.supabase.from("admin_users").select("*");

    // 添加过滤条件
    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.role) {
      query = query.eq("role", filters.role);
    }

    if (filters?.search) {
      // PostgreSQL 的 ILIKE 进行不区分大小写的模糊搜索
      query = query.ilike("username", `%${filters.search}%`);
    }

    // 排序
    query = query.order("created_at", { ascending: false });

    // 分页
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const result = await query;

    if (result.error) {
      throw handleDatabaseError(result.error);
    }

    return result.data.map((doc: any) => this.dbToAdminUser(doc));
  }

  /**
   * 统计管理员数量
   */
  async countAdmins(filters?: AdminFilters): Promise<number> {
    let query = this.supabase.from("admin_users").select("*", { count: "exact", head: true });

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.role) {
      query = query.eq("role", filters.role);
    }

    if (filters?.search) {
      query = query.ilike("username", `%${filters.search}%`);
    }

    const result = await query;

    if (result.error) {
      throw handleDatabaseError(result.error);
    }

    return result.count || 0;
  }

  /**
   * 更新管理员密码
   */
  async updateAdminPassword(username: string, hashedPassword: string): Promise<void> {
    const admin = await this.getAdminByUsername(username);

    if (!admin) {
      // 如果管理员不存在，创建新管理员
      const now = toISOString(new Date());
      const result = await this.supabase
        .from("admin_users")
        .insert({
          username,
          password_hash: hashedPassword,
          role: "super_admin",
          status: "active",
          created_at: now,
          updated_at: now,
        });

      if (result.error) {
        throw handleDatabaseError(result.error);
      }
    } else {
      // 如果管理员存在，更新密码
      const result = await this.supabase
        .from("admin_users")
        .update({
          password_hash: hashedPassword,
          updated_at: toISOString(new Date()),
        })
        .eq("id", admin.id);

      if (result.error) {
        throw handleDatabaseError(result.error);
      }
    }
  }

  // ==================== 日志操作 ====================

  /**
   * 创建操作日志
   */
  async createLog(log: CreateLogData): Promise<SystemLog> {
    const now = toISOString(new Date());

    const doc = {
      admin_id: log.admin_id,
      admin_username: log.admin_username,
      action: log.action,
      resource_type: log.resource_type,
      resource_id: log.resource_id,
      details: log.details || {},
      ip_address: log.ip_address,
      user_agent: log.user_agent,
      status: log.status || "success",
      error_message: log.error_message,
      created_at: now,
    };

    const result = await this.supabase
      .from("system_logs")
      .insert(doc)
      .select()
      .single();

    if (result.error) {
      throw handleDatabaseError(result.error);
    }

    return this.dbToSystemLog(result.data);
  }

  /**
   * 获取日志列表
   */
  async getLogs(filters?: LogFilters): Promise<SystemLog[]> {
    let query = this.supabase.from("system_logs").select("*");

    // 添加过滤条件
    if (filters?.admin_id) {
      query = query.eq("admin_id", filters.admin_id);
    }

    if (filters?.action) {
      query = query.eq("action", filters.action);
    }

    if (filters?.resource_type) {
      query = query.eq("resource_type", filters.resource_type);
    }

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    // 日期范围过滤
    if (filters?.start_date) {
      query = query.gte("created_at", filters.start_date);
    }
    if (filters?.end_date) {
      query = query.lte("created_at", filters.end_date);
    }

    // 排序：最新的在前
    query = query.order("created_at", { ascending: false });

    // 分页
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const result = await query;

    if (result.error) {
      throw handleDatabaseError(result.error);
    }

    return result.data.map((doc: any) => this.dbToSystemLog(doc));
  }

  /**
   * 统计日志数量
   */
  async countLogs(filters?: LogFilters): Promise<number> {
    let query = this.supabase.from("system_logs").select("*", { count: "exact", head: true });

    if (filters?.admin_id) {
      query = query.eq("admin_id", filters.admin_id);
    }

    if (filters?.action) {
      query = query.eq("action", filters.action);
    }

    if (filters?.resource_type) {
      query = query.eq("resource_type", filters.resource_type);
    }

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.start_date) {
      query = query.gte("created_at", filters.start_date);
    }
    if (filters?.end_date) {
      query = query.lte("created_at", filters.end_date);
    }

    const result = await query;

    if (result.error) {
      throw handleDatabaseError(result.error);
    }

    return result.count || 0;
  }

  // ==================== 配置操作 ====================

  /**
   * 获取配置值
   */
  async getConfig(key: string): Promise<any> {
    const result = await this.supabase
      .from("system_config")
      .select("value")
      .eq("key", key)
      .single();

    if (result.error) {
      if (result.error.code === "PGRST116") {
        return null;
      }
      throw handleDatabaseError(result.error);
    }

    if (!result.data) {
      return null;
    }

    return result.data.value;
  }

  /**
   * 设置配置值
   */
  async setConfig(
    key: string,
    value: any,
    category: ConfigCategory,
    description?: string
  ): Promise<void> {
    const now = toISOString(new Date());

    // 检查是否已存在
    const existing = await this.supabase
      .from("system_config")
      .select("id")
      .eq("key", key)
      .single();

    if (existing.data && !existing.error) {
      // 更新
      const result = await this.supabase
        .from("system_config")
        .update({
          value,
          description,
          category,
          updated_at: now,
        })
        .eq("key", key);

      if (result.error) {
        throw handleDatabaseError(result.error);
      }
    } else {
      // 新增
      const result = await this.supabase
        .from("system_config")
        .insert({
          key,
          value,
          description,
          category,
          updated_at: now,
        });

      if (result.error) {
        throw handleDatabaseError(result.error);
      }
    }
  }

  /**
   * 列出所有配置
   */
  async listConfigs(category?: ConfigCategory): Promise<SystemConfig[]> {
    let query = this.supabase.from("system_config").select("*");

    if (category) {
      query = query.eq("category", category);
    }

    const result = await query;

    if (result.error) {
      throw handleDatabaseError(result.error);
    }

    return result.data.map((doc: any) => this.dbToSystemConfig(doc));
  }

  /**
   * 删除配置
   */
  async deleteConfig(key: string): Promise<void> {
    const result = await this.supabase
      .from("system_config")
      .delete()
      .eq("key", key);

    if (result.error) {
      throw handleDatabaseError(result.error);
    }
  }

  // ==================== 用户管理操作 ====================

  /**
   * 根据用户名获取普通用户
   */
  async getUserByUsername(username: string): Promise<User | null> {
    // Supabase 用户在 auth.users 表中，这里我们查询扩展的用户信息表
    // users 表使用 email 作为主要标识
    const result = await this.supabase
      .from("users")
      .select("*")
      .eq("email", username)
      .single();

    if (result.error || !result.data) {
      return null;
    }

    return this.dbToUser(result.data);
  }

  /**
   * 根据 ID 获取普通用户
   */
  async getUserById(id: string): Promise<User | null> {
    const result = await this.supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (result.error || !result.data) {
      return null;
    }

    return this.dbToUser(result.data);
  }

  /**
   * 列出普通用户
   */
  async listUsers(filters?: UserFilters): Promise<User[]> {
    let query = this.supabase.from("users").select("*");

    if (filters?.status) {
      // users 表可能没有 status 字段，暂时跳过
      // query = query.eq("status", filters.status);
    }

    if (filters?.subscription_plan) {
      // users 表可能没有 subscription_plan 字段，暂时跳过
      // query = query.eq("subscription_plan", filters.subscription_plan);
    }

    if (filters?.search) {
      // 使用 email 或 name 进行搜索
      query = query.or(`email.ilike.%${filters.search}%,name.ilike.%${filters.search}%`);
    }

    if (filters?.start_date) {
      query = query.gte("created_at", filters.start_date);
    }
    if (filters?.end_date) {
      query = query.lte("created_at", filters.end_date);
    }

    query = query.order("created_at", { ascending: false });

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const result = await query;

    if (result.error) {
      throw handleDatabaseError(result.error);
    }

    // 获取所有用户的 auth metadata 来读取真实的订阅信息
    const { data: authUsers, error: authError } = await this.supabase.auth.admin.listUsers();

    if (authError) {
      console.error('Failed to fetch auth users:', authError);
      // 如果获取失败，仍然返回 users 数据，但订阅信息会是默认值
      return result.data.map((doc: any) => this.dbToUser(doc));
    }

    // 创建一个 userId -> user_metadata 的映射
    const authMetadataMap = new Map();
    authUsers.users.forEach((authUser: any) => {
      authMetadataMap.set(authUser.id, authUser.user_metadata || {});
    });

    // 合并 users 数据和 auth metadata
    return result.data.map((doc: any) => this.dbToUser(doc, authMetadataMap.get(doc.id)));
  }

  /**
   * 统计普通用户数量
   */
  async countUsers(filters?: UserFilters): Promise<number> {
    let query = this.supabase.from("users").select("*", { count: "exact", head: true });

    if (filters?.status) {
      // users 表可能没有 status 字段，暂时跳过
      // query = query.eq("status", filters.status);
    }

    if (filters?.subscription_plan) {
      // users 表可能没有 subscription_plan 字段，暂时跳过
      // query = query.eq("subscription_plan", filters.subscription_plan);
    }

    if (filters?.search) {
      query = query.or(`email.ilike.%${filters.search}%,name.ilike.%${filters.search}%`);
    }

    if (filters?.start_date) {
      query = query.gte("created_at", filters.start_date);
    }
    if (filters?.end_date) {
      query = query.lte("created_at", filters.end_date);
    }

    const result = await query;

    if (result.error) {
      throw handleDatabaseError(result.error);
    }

    return result.count || 0;
  }

  /**
   * 更新普通用户
   */
  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const data: any = {
      updated_at: new Date().toISOString(),
    };

    // 只更新 users 表中实际存在的字段
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.email !== undefined) data.email = updates.email;
    if (updates.avatar !== undefined) data.avatar = updates.avatar;
    if (updates.region !== undefined) data.region = updates.region;

    // 注意: subscription_plan, pro_expires_at, status 等字段不在 users 表中
    // 这些字段在 dbToUser() 中使用默认值

    const result = await this.supabase
      .from("users")
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (result.error) {
      throw handleDatabaseError(result.error);
    }

    return this.dbToUser(result.data);
  }

  /**
   * 删除普通用户
   */
  async deleteUser(id: string): Promise<void> {
    const result = await this.supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (result.error) {
      throw handleDatabaseError(result.error);
    }
  }

  /**
   * 辅助方法：从数据库格式转换为 User
   */
  private dbToUser(doc: any, authMetadata?: any): User {
    return {
      id: doc.id,
      email: doc.email || "",
      name: doc.name || "",
      avatar: doc.avatar,
      role: "free", // users 表默认没有 role 字段
      subscription_plan: authMetadata?.subscription_plan || "free", // 从 auth metadata 读取订阅信息
      region: doc.region || "US",
      status: "active", // users 表默认没有 status 字段
      created_at: doc.created_at,
      last_login_at: doc.last_login_at,
      pro_expires_at: doc.plan_exp || doc.pro_expires_at,
    };
  }

  // ==================== 评估管理操作 ====================

  /**
   * 根据 ID 获取评估记录
   */
  async getAssessmentById(id: string): Promise<Assessment | null> {
    const result = await this.supabase
      .from("assessments")
      .select("*")
      .eq("id", id)
      .single();

    if (result.error || !result.data) {
      return null;
    }

    return this.dbToAssessment(result.data);
  }

  /**
   * 列出评估记录
   */
  async listAssessments(filters?: AssessmentFilters): Promise<Assessment[]> {
    let query = this.supabase.from("assessments").select("*");

    if (filters?.user_id) {
      query = query.eq("user_id", filters.user_id);
    }

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.start_date) {
      query = query.gte("created_at", filters.start_date);
    }
    if (filters?.end_date) {
      query = query.lte("created_at", filters.end_date);
    }

    query = query.order("created_at", { ascending: false });

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const result = await query;

    if (result.error) {
      throw handleDatabaseError(result.error);
    }

    return result.data.map((doc: any) => this.dbToAssessment(doc));
  }

  /**
   * 统计评估记录数量
   */
  async countAssessments(filters?: AssessmentFilters): Promise<number> {
    let query = this.supabase.from("assessments").select("*", { count: "exact", head: true });

    if (filters?.user_id) {
      query = query.eq("user_id", filters.user_id);
    }

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.start_date) {
      query = query.gte("created_at", filters.start_date);
    }
    if (filters?.end_date) {
      query = query.lte("created_at", filters.end_date);
    }

    const result = await query;

    if (result.error) {
      throw handleDatabaseError(result.error);
    }

    return result.count || 0;
  }

  /**
   * 删除评估记录
   */
  async deleteAssessment(id: string): Promise<void> {
    const result = await this.supabase
      .from("assessments")
      .delete()
      .eq("id", id);

    if (result.error) {
      throw handleDatabaseError(result.error);
    }
  }

  /**
   * 辅助方法：从数据库格式转换为 Assessment
   */
  private dbToAssessment(doc: any): Assessment {
    return {
      id: doc.id,
      user_id: doc.user_id,
      user_email: doc.user_email,
      type: doc.type || "assessment",
      score: doc.score,
      status: doc.status || "completed",
      answers: doc.answers || {},
      feedback: doc.feedback,
      created_at: doc.created_at,
      completed_at: doc.completed_at,
    };
  }

  // ==================== 支付管理操作 ====================

  /**
   * 根据 ID 获取支付记录
   */
  async getPaymentById(id: string): Promise<Payment | null> {
    const result = await this.supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (result.error || !result.data) {
      return null;
    }

    return this.dbToPayment(result.data);
  }

  /**
   * 列出支付记录
   */
  async listPayments(filters?: PaymentFilters): Promise<Payment[]> {
    let query = this.supabase.from("orders").select("*");

    // 国际版只查询 stripe 和 paypal
    query = query.in("payment_method", ["stripe", "paypal"]);

    if (filters?.user_id) {
      query = query.eq("user_id", filters.user_id);
    }

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.method) {
      query = query.eq("payment_method", filters.method);
    }

    if (filters?.type) {
      query = query.eq("product_type", filters.type);
    }

    if (filters?.start_date) {
      query = query.gte("created_at", filters.start_date);
    }
    if (filters?.end_date) {
      query = query.lte("created_at", filters.end_date);
    }

    query = query.order("created_at", { ascending: false });

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const result = await query;

    if (result.error) {
      throw handleDatabaseError(result.error);
    }

    return result.data.map((doc: any) => this.dbToPayment(doc));
  }

  /**
   * 统计支付记录数量
   */
  async countPayments(filters?: PaymentFilters): Promise<number> {
    let query = this.supabase.from("orders").select("*", { count: "exact", head: true });

    // 国际版只查询 stripe 和 paypal
    query = query.in("payment_method", ["stripe", "paypal"]);

    if (filters?.user_id) {
      query = query.eq("user_id", filters.user_id);
    }

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.method) {
      query = query.eq("payment_method", filters.method);
    }

    if (filters?.type) {
      query = query.eq("product_type", filters.type);
    }

    if (filters?.start_date) {
      query = query.gte("created_at", filters.start_date);
    }
    if (filters?.end_date) {
      query = query.lte("created_at", filters.end_date);
    }

    const result = await query;

    if (result.error) {
      throw handleDatabaseError(result.error);
    }

    return result.count || 0;
  }

  /**
   * 辅助方法：从数据库格式转换为 Payment
   */
  private dbToPayment(doc: any): Payment {
    return {
      id: doc.id,
      user_id: doc.user_id,
      user_email: doc.user_email,
      amount: doc.amount || 0,
      currency: doc.currency || "USD",
      method: doc.payment_method || doc.provider || doc.method || "stripe", // 优先从 payment_method 字段读取
      status: doc.status || "pending",
      type: doc.product_type || "subscription",
      product_id: doc.product_id,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      completed_at: doc.completed_at,
    };
  }

  // ==================== 广告管理操作 ====================

  /**
   * 获取广告列表，支持分页
   */
  async listAds(filters: { limit?: number; offset?: number }): Promise<{ items: Advertisement[]; total: number }> {
    console.log('[SupabaseAdapter] 获取广告列表:', filters);

    let query = this.supabase
      .from('advertisements')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[SupabaseAdapter] 获取广告列表失败:', error);
      throw new Error(`获取广告列表失败: ${error.message}`);
    }

    console.log('[SupabaseAdapter] 获取到', data?.length || 0, '个广告，总数:', count);
    return { items: data || [], total: count || 0 };
  }

  /**
   * 根据ID获取广告
   */
  async getAdById(id: string): Promise<Advertisement | null> {
    const { data, error } = await this.supabase
      .from('advertisements')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`获取广告失败: ${error.message}`);
    }

    return data;
  }

  /**
   * 创建新广告
   */
  async createAd(data: CreateAdData): Promise<Advertisement> {
    console.log('[SupabaseAdapter] 创建广告:', data.title);

    const { data: result, error } = await this.supabase
      .from('advertisements')
      .insert({
        title: data.title,
        type: data.type,
        position: data.position,
        file_url: data.fileUrl,
        file_url_cn: data.fileUrlCn,
        file_url_intl: data.fileUrlIntl,
        link_url: data.linkUrl,
        priority: data.priority,
        status: data.status,
        file_size: data.file_size,
        start_date: data.startDate,
        end_date: data.endDate,
      })
      .select()
      .single();

    if (error) {
      console.error('[SupabaseAdapter] 创建广告失败:', error);
      throw new Error(`创建广告失败: ${error.message}`);
    }

    console.log('[SupabaseAdapter] 广告创建成功:', result.id);
    return result;
  }

  /**
   * 更新广告
   */
  async updateAd(id: string, data: Partial<CreateAdData>): Promise<Advertisement> {
    console.log('[SupabaseAdapter] 更新广告:', id);

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.position !== undefined) updateData.position = data.position;
    if (data.linkUrl !== undefined) updateData.link_url = data.linkUrl;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.startDate !== undefined) updateData.start_date = data.startDate;
    if (data.endDate !== undefined) updateData.end_date = data.endDate;

    const { data: result, error } = await this.supabase
      .from('advertisements')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[SupabaseAdapter] 更新广告失败:', error);
      throw new Error(`更新广告失败: ${error.message}`);
    }

    console.log('[SupabaseAdapter] 广告更新成功');
    return result;
  }

  /**
   * 删除广告
   */
  async deleteAd(id: string): Promise<void> {
    console.log('[SupabaseAdapter] 删除广告:', id);

    const { error } = await this.supabase
      .from('advertisements')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[SupabaseAdapter] 删除广告失败:', error);
      throw new Error(`删除广告失败: ${error.message}`);
    }

    console.log('[SupabaseAdapter] 广告删除成功');
  }

  /**
   * 切换广告状态
   */
  async toggleAdStatus(id: string): Promise<Advertisement> {
    console.log('[SupabaseAdapter] 切换广告状态:', id);

    const ad = await this.getAdById(id);
    if (!ad) {
      throw new Error('广告不存在');
    }

    const newStatus = ad.status === 'active' ? 'inactive' : 'active';
    return this.updateAd(id, { status: newStatus });
  }

  /**
   * 获取广告统计
   */
  async getAdStats(): Promise<AdStats> {
    console.log('[SupabaseAdapter] 获取广告统计');

    const { data, error } = await this.supabase
      .from('advertisements')
      .select('status, type');

    if (error) {
      console.error('[SupabaseAdapter] 获取广告统计失败:', error);
      throw new Error(`获取广告统计失败: ${error.message}`);
    }

    const stats: AdStats = {
      total: data?.length || 0,
      active: data?.filter(ad => ad.status === 'active').length || 0,
      inactive: data?.filter(ad => ad.status === 'inactive').length || 0,
      byType: {
        image: data?.filter(ad => ad.type === 'image').length || 0,
        video: data?.filter(ad => ad.type === 'video').length || 0,
      },
    };

    console.log('[SupabaseAdapter] 广告统计:', stats);
    return stats;
  }

  // ==================== 社交链接管理操作 ====================

  /**
   * 列出社交链接
   */
  async listSocialLinks(): Promise<SocialLink[]> {
    console.log('[SupabaseAdapter] 获取社交链接列表');

    const { data, error } = await this.supabase
      .from('social_links')
      .select('*')
      .order('order', { ascending: true });

    if (error) {
      console.error('[SupabaseAdapter] 获取社交链接失败:', error);
      throw new Error(`获取社交链接失败: ${error.message}`);
    }

    console.log('[SupabaseAdapter] 获取到', data?.length || 0, '个社交链接');
    return data || [];
  }

  /**
   * 根据 ID 获取社交链接
   */
  async getSocialLinkById(id: string): Promise<SocialLink | null> {
    console.log('[SupabaseAdapter] 获取社交链接:', id);

    const { data, error } = await this.supabase
      .from('social_links')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log('[SupabaseAdapter] 社交链接不存在:', id);
        return null;
      }
      console.error('[SupabaseAdapter] 获取社交链接失败:', error);
      throw new Error(`获取社交链接失败: ${error.message}`);
    }

    return data;
  }

  /**
   * 创建社交链接
   */
  async createSocialLink(data: CreateSocialLinkData): Promise<SocialLink> {
    console.log('[SupabaseAdapter] 创建社交链接:', data);

    const { data: result, error } = await this.supabase
      .from('social_links')
      .insert({
        icon: data.icon,
        title: data.title,
        description: data.description,
        url: data.url,
        order: data.order,
      })
      .select()
      .single();

    if (error) {
      console.error('[SupabaseAdapter] 创建社交链接失败:', error);
      throw new Error(`创建社交链接失败: ${error.message}`);
    }

    console.log('[SupabaseAdapter] 社交链接创建成功:', result.id);
    return result;
  }

  /**
   * 更新社交链接
   */
  async updateSocialLink(id: string, data: UpdateSocialLinkData): Promise<SocialLink> {
    console.log('[SupabaseAdapter] 更新社交链接:', id, data);

    const { data: result, error } = await this.supabase
      .from('social_links')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[SupabaseAdapter] 更新社交链接失败:', error);
      throw new Error(`更新社交链接失败: ${error.message}`);
    }

    console.log('[SupabaseAdapter] 社交链接更新成功');
    return result;
  }

  /**
   * 删除社交链接
   */
  async deleteSocialLink(id: string): Promise<void> {
    console.log('[SupabaseAdapter] 删除社交链接:', id);

    const { error } = await this.supabase
      .from('social_links')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[SupabaseAdapter] 删除社交链接失败:', error);
      throw new Error(`删除社交链接失败: ${error.message}`);
    }

    console.log('[SupabaseAdapter] 社交链接删除成功');
  }

  /**
   * 批量更新社交链接排序
   */
  async updateSocialLinksOrder(updates: Array<{ id: string; order: number }>): Promise<void> {
    console.log('[SupabaseAdapter] 更新社交链接排序:', updates.length, '个');

    for (const update of updates) {
      const { error } = await this.supabase
        .from('social_links')
        .update({ order: update.order })
        .eq('id', update.id);

      if (error) {
        console.error('[SupabaseAdapter] 更新排序失败:', error);
        throw new Error(`更新排序失败: ${error.message}`);
      }
    }

    console.log('[SupabaseAdapter] 排序更新成功');
  }

  // ==================== 版本发布管理操作 ====================

  /**
   * 根据 ID 获取版本发布
   */
  async getReleaseById(id: string): Promise<Release | null> {
    try {
      const result = await this.supabase
        .from("releases")
        .select("*")
        .eq("id", id)
        .single();

      if (result.error || !result.data) {
        return null;
      }
      return this.dbToRelease(result.data);
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 列出版本发布
   */
  async listReleases(filters?: ReleaseFilters): Promise<Release[]> {
    let query = this.supabase
      .from("releases")
      .select("*");

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.search) {
      query = query.or(`title.ilike.%${filters.search}%,version.ilike.%${filters.search}%`);
    }

    if (filters?.start_date) {
      query = query.gte("created_at", filters.start_date);
    }

    if (filters?.end_date) {
      query = query.lte("created_at", filters.end_date);
    }

    query = query.order("created_at", { ascending: false });

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.range(filters.offset, (filters.offset || 0) + (filters.limit || 50) - 1);
    }

    try {
      const result = await query;
      if (result.error) throw result.error;
      return (result.data || []).map((doc: any) => this.dbToRelease(doc));
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 统计版本发布数量
   */
  async countReleases(filters?: ReleaseFilters): Promise<number> {
    let query = this.supabase
      .from("releases")
      .select("*", { count: "exact", head: true });

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.search) {
      query = query.or(`title.ilike.%${filters.search}%,version.ilike.%${filters.search}%`);
    }

    if (filters?.start_date) {
      query = query.gte("created_at", filters.start_date);
    }

    if (filters?.end_date) {
      query = query.lte("created_at", filters.end_date);
    }

    try {
      const result = await query;
      if (result.error) throw result.error;
      return result.count || 0;
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 创建版本发布
   */
  async createRelease(data: CreateReleaseData): Promise<Release> {
    const now = new Date().toISOString();

    const doc: any = {
      version: data.version,
      title: data.title,
      description: data.description,
      status: data.status ?? "draft",
      releaseNotes: data.releaseNotes,
      fileUrl: data.fileUrl,
      created_at: now,
      updated_at: now,
    };

    if (data.status === "published") {
      doc.published_at = now;
    }

    try {
      const result = await this.supabase
        .from("releases")
        .insert(doc)
        .select()
        .single();

      if (result.error) throw result.error;
      return this.dbToRelease(result.data);
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 更新版本发布
   */
  async updateRelease(id: string, data: UpdateReleaseData): Promise<Release> {
    const update: any = {
      updated_at: new Date().toISOString(),
    };

    if (data.version !== undefined) update.version = data.version;
    if (data.title !== undefined) update.title = data.title;
    if (data.description !== undefined) update.description = data.description;
    if (data.status !== undefined) {
      update.status = data.status;
      // 如果状态从未发布变为已发布，设置发布时间
      if (data.status === "published") {
        update.published_at = new Date().toISOString();
      }
    }
    if (data.releaseNotes !== undefined) update.releaseNotes = data.releaseNotes;
    if (data.fileUrl !== undefined) update.fileUrl = data.fileUrl;
    if (data.published_at !== undefined) update.published_at = data.published_at;

    try {
      const result = await this.supabase
        .from("releases")
        .update(update)
        .eq("id", id)
        .select()
        .single();

      if (result.error) throw result.error;
      return this.dbToRelease(result.data);
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 删除版本发布
   */
  async deleteRelease(id: string): Promise<void> {
    try {
      const result = await this.supabase
        .from("releases")
        .delete()
        .eq("id", id);

      if (result.error) throw result.error;
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 辅助方法：从数据库格式转换为 Release
   */
  private dbToRelease(doc: any): Release {
    return {
      id: doc.id,
      version: doc.version,
      title: doc.title,
      description: doc.description,
      status: doc.status || "draft",
      releaseNotes: doc.releaseNotes,
      fileUrl: doc.fileUrl,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      published_at: doc.published_at,
    };
  }

  // ==================== 健康检查 ====================

  /**
   * 检查数据库连接
   */
  async healthCheck(): Promise<boolean> {
    try {
      // 尝试执行一个简单的查询
      const result = await this.supabase
        .from("admin_users")
        .select("*", { count: "exact", head: true });

      return !result.error;
    } catch (error) {
      console.error("Supabase 健康检查失败:", error);
      return false;
    }
  }
}
