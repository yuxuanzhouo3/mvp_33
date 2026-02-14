/**
 * CloudBase 数据库适配器
 *
 * 实现 MongoDB 数据库的管理后台操作
 * 用于国内版（CN）部署环境
 *
 * 集合命名：
 * - admin_users: 管理员用户
 * - system_logs: 系统操作日志
 * - system_config: 系统配置
 */

import bcrypt from "bcryptjs";
import { CloudBaseConnector } from "@/lib/cloudbase/connector";
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
  SocialLink,
  CreateSocialLinkData,
  UpdateSocialLinkData,
  Release,
  ReleaseFilters,
  CreateReleaseData,
  UpdateReleaseData,
} from "./types";
import { handleDatabaseError, toISOString } from "./database";

// ==================== CloudBase 适配器类 ====================

/**
 * CloudBase 管理后台数据库适配器
 */
export class CloudBaseAdminAdapter implements AdminDatabaseAdapter {
  private db: any;
  private connector: CloudBaseConnector;
  private initialized: boolean = false;

  constructor() {
    this.connector = new CloudBaseConnector();
  }

  /**
   * 确保 CloudBase 已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.connector.initialize();
      this.db = this.connector.getClient();
      this.initialized = true;
    }
  }

  /**
   * 测试数据库连接
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('[CloudBase] 测试数据库连接...');
      await this.ensureInitialized();
      const result = await this.db.collection('admin_users').limit(1).get();
      console.log('[CloudBase] 连接测试成功');
      return true;
    } catch (error) {
      console.error('[CloudBase] 连接测试失败:', error);
      return false;
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 执行查询并处理结果
   */
  private async executeQuery(
    collectionName: string,
    queryFn: (collection: any) => Promise<any>
  ) {
    try {
      await this.ensureInitialized();
      const collection = this.db.collection(collectionName);
      const result = await queryFn(collection);

      // CloudBase 查询结果格式：{ data: [], requestId: "" }
      return result.data || [];
    } catch (error: any) {
      console.error(`CloudBase 查询失败 [${collectionName}]:`, error);
      throw handleDatabaseError(error);
    }
  }

  /**
   * 生成唯一 ID（CloudBase 的 ObjectId）
   */
  private generateId(): string {
    // CloudBase 会自动生成 _id，这里返回占位符
    return "";
  }

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
      id: doc._id || doc.id,
      username: doc.username,
      password_hash: doc.password_hash || doc.password, // 兼容旧字段名
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
      id: doc._id || doc.id,
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
      id: doc._id || doc.id,
      key: doc.key,
      value: doc.value,
      description: doc.description,
      category: doc.category,
      updated_at: doc.updated_at,
    };
  }

  // ==================== 管理员操作 ====================

  /**
   * 根据用户名获取管理员
   */
  async getAdminByUsername(username: string): Promise<AdminUser | null> {
    console.log("[CloudBaseAdapter] 查询管理员, username:", username);
    const results = await this.executeQuery("admin_users", async (collection) => {
      return collection.where({ username }).get();
    });

    console.log("[CloudBaseAdapter] 查询结果数量:", results.length);
    if (results.length > 0) {
      console.log("[CloudBaseAdapter] 原始数据库记录:", {
        _id: results[0]._id,
        username: results[0].username,
        role: results[0].role,
        status: results[0].status,
        hasPassword: !!results[0].password,
        hasPasswordHash: !!results[0].password_hash,
        allFields: Object.keys(results[0])
      });
    }

    if (results.length === 0) {
      return null;
    }

    return this.dbToAdminUser(results[0]);
  }

  /**
   * 根据 ID 获取管理员
   */
  async getAdminById(id: string): Promise<AdminUser | null> {
    try {
      const result = await this.db.collection("admin_users").doc(id).get();
      if (!result.data || result.data.length === 0) {
        return null;
      }
      return this.dbToAdminUser(result.data[0]);
    } catch (error: any) {
      // 文档不存在
      if (error.code === "DOC_NOT_FOUND") {
        return null;
      }
      throw handleDatabaseError(error);
    }
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
      status: "active" as const,
      created_at: now,
      updated_at: now,
      created_by: data.created_by,
    };

    try {
      const result = await this.db.collection("admin_users").add(doc);

      // 返回完整的用户对象
      return {
        id: result.id,
        username: doc.username,
        role: doc.role,
        status: doc.status,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        created_by: doc.created_by,
      };
    } catch (error: any) {
      // 检查是否是用户名重复
      if (error.code === "DATABASE_DUPLICATE_KEY") {
        throw handleDatabaseError({
          code: "DUPLICATE_KEY",
          message: "用户名已存在",
        });
      }
      throw handleDatabaseError(error);
    }
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

    try {
      await this.db.collection("admin_users").doc(id).update(updates);

      // 返回更新后的用户
      const updated = await this.getAdminById(id);
      if (!updated) {
        throw new Error("更新后找不到用户");
      }
      return updated;
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 删除管理员
   */
  async deleteAdmin(id: string): Promise<void> {
    try {
      await this.db.collection("admin_users").doc(id).remove();
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 列出所有管理员
   */
  async listAdmins(filters?: AdminFilters): Promise<AdminUser[]> {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.role) {
      where.role = filters.role;
    }

    if (filters?.search) {
      // CloudBase 支持正则查询
      where.username = new RegExp(filters.search, "i");
    }

    let query = this.db.collection("admin_users");

    // 添加过滤条件
    if (Object.keys(where).length > 0) {
      query = query.where(where);
    }

    // 排序
    query = query.orderBy("created_at", "desc");

    // 分页
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.skip(filters.offset);
    }

    try {
      const result = await query.get();
      return result.data.map((doc: any) => this.dbToAdminUser(doc));
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 统计管理员数量
   */
  async countAdmins(filters?: AdminFilters): Promise<number> {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.role) {
      where.role = filters.role;
    }

    if (filters?.search) {
      where.username = new RegExp(filters.search, "i");
    }

    try {
      const result = await this.db
        .collection("admin_users")
        .where(where)
        .count();
      return result.total;
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 更新管理员密码
   */
  async updateAdminPassword(username: string, hashedPassword: string): Promise<void> {
    await this.ensureInitialized();

    const admin = await this.getAdminByUsername(username);

    if (!admin) {
      // 如果管理员不存在，创建新管理员
      const now = toISOString(new Date());
      await this.db.collection("admin_users").add({
        username,
        password_hash: hashedPassword,
        role: "super_admin",
        status: "active",
        created_at: now,
        updated_at: now,
      });
    } else {
      // 如果管理员存在，更新密码
      try {
        await this.db.collection("admin_users").doc(admin.id).update({
          password_hash: hashedPassword,
          updated_at: toISOString(new Date()),
        });
      } catch (error: any) {
        throw handleDatabaseError(error);
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

    try {
      const result = await this.db.collection("system_logs").add(doc);

      return {
        id: result.id,
        ...doc,
      } as SystemLog;
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 获取日志列表
   */
  async getLogs(filters?: LogFilters): Promise<SystemLog[]> {
    const where: any = {};

    if (filters?.admin_id) {
      where.admin_id = filters.admin_id;
    }

    if (filters?.action) {
      where.action = filters.action;
    }

    if (filters?.resource_type) {
      where.resource_type = filters.resource_type;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    // 日期范围过滤
    if (filters?.start_date || filters?.end_date) {
      where.created_at = {};
      if (filters.start_date) {
        where.created_at.$gte = filters.start_date;
      }
      if (filters.end_date) {
        where.created_at.$lte = filters.end_date;
      }
    }

    let query = this.db.collection("system_logs");

    if (Object.keys(where).length > 0) {
      query = query.where(where);
    }

    // 排序：最新的在前
    query = query.orderBy("created_at", "desc");

    // 分页
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.skip(filters.offset);
    }

    try {
      const result = await query.get();
      return result.data.map((doc: any) => this.dbToSystemLog(doc));
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 统计日志数量
   */
  async countLogs(filters?: LogFilters): Promise<number> {
    const where: any = {};

    if (filters?.admin_id) {
      where.admin_id = filters.admin_id;
    }

    if (filters?.action) {
      where.action = filters.action;
    }

    if (filters?.resource_type) {
      where.resource_type = filters.resource_type;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.start_date || filters?.end_date) {
      where.created_at = {};
      if (filters.start_date) {
        where.created_at.$gte = filters.start_date;
      }
      if (filters.end_date) {
        where.created_at.$lte = filters.end_date;
      }
    }

    try {
      const result = await this.db.collection("system_logs").where(where).count();
      return result.total;
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  // ==================== 配置操作 ====================

  /**
   * 获取配置值
   */
  async getConfig(key: string): Promise<any> {
    try {
      const result = await this.db
        .collection("system_config")
        .where({ key })
        .get();

      if (result.data.length === 0) {
        return null;
      }

      return result.data[0].value;
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
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

    try {
      // 检查是否已存在
      const existing = await this.db.collection("system_config").where({ key }).get();

      if (existing.data.length > 0) {
        // 更新
        await this.db
          .collection("system_config")
          .doc(existing.data[0]._id)
          .update({
            value,
            description,
            category,
            updated_at: now,
          });
      } else {
        // 新增
        await this.db.collection("system_config").add({
          key,
          value,
          description,
          category,
          updated_at: now,
        });
      }
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 列出所有配置
   */
  async listConfigs(category?: ConfigCategory): Promise<SystemConfig[]> {
    const where: any = {};
    if (category) {
      where.category = category;
    }

    try {
      const result = await this.db
        .collection("system_config")
        .where(where)
        .get();

      return result.data.map((doc: any) => this.dbToSystemConfig(doc));
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 删除配置
   */
  async deleteConfig(key: string): Promise<void> {
    try {
      const existing = await this.db.collection("system_config").where({ key }).get();

      if (existing.data.length > 0) {
        await this.db
          .collection("system_config")
          .doc(existing.data[0]._id)
          .remove();
      }
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  // ==================== 用户管理操作 ====================

  /**
   * 根据用户名获取普通用户
   */
  async getUserByUsername(username: string): Promise<User | null> {
    const results = await this.executeQuery("web_users", async (collection) => {
      return collection.where({ username }).get();
    });

    if (results.length === 0) {
      return null;
    }

    return this.dbToUser(results[0]);
  }

  /**
   * 根据 ID 获取普通用户
   */
  async getUserById(id: string): Promise<User | null> {
    try {
      const result = await this.db.collection("web_users").doc(id).get();
      if (!result.data || result.data.length === 0) {
        return null;
      }
      return this.dbToUser(result.data[0]);
    } catch (error: any) {
      if (error.code === "DOC_NOT_FOUND") {
        return null;
      }
      throw handleDatabaseError(error);
    }
  }

  /**
   * 列出普通用户
   */
  async listUsers(filters?: UserFilters): Promise<User[]> {
    await this.ensureInitialized();

    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.subscription_plan) {
      where.subscription_plan = filters.subscription_plan;
    }

    if (filters?.search) {
      where.username = new RegExp(filters.search, "i");
    }

    // 日期范围过滤
    if (filters?.start_date || filters?.end_date) {
      where.created_at = {};
      if (filters.start_date) {
        where.created_at.$gte = filters.start_date;
      }
      if (filters.end_date) {
        where.created_at.$lte = filters.end_date;
      }
    }

    let query = this.db.collection("web_users");

    if (Object.keys(where).length > 0) {
      query = query.where(where);
    }

    query = query.orderBy("created_at", "desc");

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.skip(filters.offset);
    }

    try {
      const result = await query.get();
      return result.data.map((doc: any) => this.dbToUser(doc));
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 统计普通用户数量
   */
  async countUsers(filters?: UserFilters): Promise<number> {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.subscription_plan) {
      where.subscription_plan = filters.subscription_plan;
    }

    if (filters?.search) {
      where.username = new RegExp(filters.search, "i");
    }

    if (filters?.start_date || filters?.end_date) {
      where.created_at = {};
      if (filters.start_date) {
        where.created_at.$gte = filters.start_date;
      }
      if (filters.end_date) {
        where.created_at.$lte = filters.end_date;
      }
    }

    try {
      const result = await this.db.collection("web_users").where(where).count();
      return result.total;
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 更新普通用户
   */
  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const data: any = {
      updated_at: toISOString(new Date()),
    };

    if (updates.name !== undefined) data.name = updates.name;
    if (updates.subscription_plan !== undefined) data.subscription_plan = updates.subscription_plan;
    if (updates.pro_expires_at !== undefined) data.pro_expires_at = updates.pro_expires_at;
    if (updates.status !== undefined) data.status = updates.status;

    try {
      await this.db.collection("web_users").doc(id).update(data);
      const updated = await this.getUserById(id);
      if (!updated) {
        throw new Error("更新后找不到用户");
      }
      return updated;
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 删除普通用户
   */
  async deleteUser(id: string): Promise<void> {
    try {
      await this.db.collection("web_users").doc(id).remove();
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  // 辅助方法：从数据库格式转换为 User
  private dbToUser(doc: any): User {
    return {
      id: doc._id || doc.id,
      email: doc.email,
      name: doc.name,
      avatar: doc.avatar,
      role: doc.role || "free",
      subscription_plan: doc.subscription_plan || "free",
      region: doc.region || "CN",
      status: doc.status || "active",
      created_at: doc.created_at,
      last_login_at: doc.last_login_at,
      pro_expires_at: doc.pro_expires_at,
    };
  }

  // ==================== 评估管理操作 ====================

  /**
   * 根据 ID 获取评估记录
   */
  async getAssessmentById(id: string): Promise<Assessment | null> {
    try {
      const result = await this.db.collection("assessments").doc(id).get();
      if (!result.data || result.data.length === 0) {
        return null;
      }
      return this.dbToAssessment(result.data[0]);
    } catch (error: any) {
      if (error.code === "DOC_NOT_FOUND") {
        return null;
      }
      throw handleDatabaseError(error);
    }
  }

  /**
   * 列出评估记录
   */
  async listAssessments(filters?: AssessmentFilters): Promise<Assessment[]> {
    const where: any = {};

    if (filters?.user_id) {
      where.user_id = filters.user_id;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.start_date || filters?.end_date) {
      where.created_at = {};
      if (filters.start_date) {
        where.created_at.$gte = filters.start_date;
      }
      if (filters.end_date) {
        where.created_at.$lte = filters.end_date;
      }
    }

    let query = this.db.collection("assessments");

    if (Object.keys(where).length > 0) {
      query = query.where(where);
    }

    query = query.orderBy("created_at", "desc");

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.skip(filters.offset);
    }

    try {
      const result = await query.get();
      return result.data.map((doc: any) => this.dbToAssessment(doc));
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 统计评估记录数量
   */
  async countAssessments(filters?: AssessmentFilters): Promise<number> {
    const where: any = {};

    if (filters?.user_id) {
      where.user_id = filters.user_id;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.start_date || filters?.end_date) {
      where.created_at = {};
      if (filters.start_date) {
        where.created_at.$gte = filters.start_date;
      }
      if (filters.end_date) {
        where.created_at.$lte = filters.end_date;
      }
    }

    try {
      const result = await this.db.collection("assessments").where(where).count();
      return result.total;
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 删除评估记录
   */
  async deleteAssessment(id: string): Promise<void> {
    try {
      await this.db.collection("assessments").doc(id).remove();
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 辅助方法：从数据库格式转换为 Assessment
   */
  private dbToAssessment(doc: any): Assessment {
    return {
      id: doc._id || doc.id,
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
    await this.ensureInitialized();
    try {
      const result = await this.db.collection("payments").doc(id).get();
      if (!result.data || result.data.length === 0) {
        return null;
      }
      return this.dbToPayment(result.data[0]);
    } catch (error: any) {
      if (error.code === "DOC_NOT_FOUND") {
        return null;
      }
      throw handleDatabaseError(error);
    }
  }

  /**
   * 列出支付记录
   */
  async listPayments(filters?: PaymentFilters): Promise<Payment[]> {
    await this.ensureInitialized();
    const where: any = {};

    // 国内版只查询 wechat 和 alipay
    where.payment_method = this.db.command.in(["wechat", "alipay"]);

    if (filters?.user_id) {
      where.user_id = filters.user_id;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.method) {
      where.payment_method = filters.method;
    }

    if (filters?.type) {
      where.product_type = filters.type;
    }

    if (filters?.start_date || filters?.end_date) {
      where.created_at = {};
      if (filters.start_date) {
        where.created_at.$gte = filters.start_date;
      }
      if (filters.end_date) {
        where.created_at.$lte = filters.end_date;
      }
    }

    let query = this.db.collection("payments");

    if (Object.keys(where).length > 0) {
      query = query.where(where);
    }

    query = query.orderBy("created_at", "desc");

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.skip(filters.offset);
    }

    try {
      const result = await query.get();
      return result.data.map((doc: any) => this.dbToPayment(doc));
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 统计支付记录数量
   */
  async countPayments(filters?: PaymentFilters): Promise<number> {
    await this.ensureInitialized();
    const where: any = {};

    // 国内版只查询 wechat 和 alipay
    where.payment_method = this.db.command.in(["wechat", "alipay"]);

    if (filters?.user_id) {
      where.user_id = filters.user_id;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.method) {
      where.payment_method = filters.method;
    }

    if (filters?.type) {
      where.product_type = filters.type;
    }

    if (filters?.start_date || filters?.end_date) {
      where.created_at = {};
      if (filters.start_date) {
        where.created_at.$gte = filters.start_date;
      }
      if (filters.end_date) {
        where.created_at.$lte = filters.end_date;
      }
    }

    try {
      const result = await this.db.collection("payments").where(where).count();
      return result.total;
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 辅助方法：从数据库格式转换为 Payment
   */
  private dbToPayment(doc: any): Payment {
    // Map CloudBase payment fields to admin Payment interface
    // CloudBase uses: method, status (with "completed"), billing_cycle
    // Admin expects: method, status (with "paid"), type

    let status = doc.status || "pending";
    // Convert CloudBase "completed" status to admin "paid" status
    if (status === "completed") {
      status = "paid";
    }

    return {
      id: doc._id || doc.id,
      order_id: doc.order_id,
      user_id: doc.user_id,
      user_email: doc.user_email || doc.email,
      amount: doc.amount || 0,
      currency: doc.currency || "CNY",
      method: doc.method || doc.payment_method || "wechat",
      status: status,
      type: doc.product_type || doc.billing_cycle || "subscription",
      product_id: doc.product_id,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      completed_at: doc.completed_at || doc.paid_at,
    };
  }

  // ==================== 广告管理操作 ====================

  /**
   * 根据 ID 获取广告
   */
  async getAdById(id: string): Promise<Advertisement | null> {
    try {
      await this.ensureInitialized();
      const result = await this.db.collection("advertisements").doc(id).get();
      if (!result.data || result.data.length === 0) {
        return null;
      }
      return this.dbToAd(result.data[0]);
    } catch (error: any) {
      if (error.code === "DOC_NOT_FOUND") {
        return null;
      }
      throw handleDatabaseError(error);
    }
  }

  /**
   * 列出广告
   */
  async listAds(filters?: AdFilters): Promise<Advertisement[]> {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.type) {
      where.type = filters.type;
    }

    if (filters?.position) {
      where.position = filters.position;
    }

    if (filters?.search) {
      where.title = new RegExp(filters.search, "i");
    }

    if (filters?.start_date || filters?.end_date) {
      where.created_at = {};
      if (filters.start_date) {
        where.created_at.$gte = filters.start_date;
      }
      if (filters.end_date) {
        where.created_at.$lte = filters.end_date;
      }
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    try {
      await this.ensureInitialized();
      const result = await this.db
        .collection("advertisements")
        .where(where)
        .orderBy("priority", "desc")
        .orderBy("created_at", "desc")
        .skip(offset)
        .limit(limit)
        .get();

      return result.data.map((doc: any) => this.dbToAd(doc));
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 统计广告数量
   */
  async countAds(filters?: AdFilters): Promise<number> {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.type) {
      where.type = filters.type;
    }

    if (filters?.position) {
      where.position = filters.position;
    }

    if (filters?.search) {
      where.title = new RegExp(filters.search, "i");
    }

    if (filters?.start_date || filters?.end_date) {
      where.created_at = {};
      if (filters.start_date) {
        where.created_at.$gte = filters.start_date;
      }
      if (filters.end_date) {
        where.created_at.$lte = filters.end_date;
      }
    }

    try {
      await this.ensureInitialized();
      const result = await this.db.collection("advertisements").where(where).count();
      return result.total;
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 创建广告
   */
  async createAd(data: CreateAdData): Promise<Advertisement> {
    const now = new Date().toISOString();

    const doc: any = {
      title: data.title,
      type: data.type,
      position: data.position,
      fileUrl: data.fileUrl,
      fileUrlCn: data.fileUrlCn,
      fileUrlIntl: data.fileUrlIntl,
      linkUrl: data.linkUrl,
      priority: data.priority ?? 0,
      status: data.status ?? "active",
      startDate: data.startDate,
      endDate: data.endDate,
      file_size: data.fileSize || data.file_size || 0,
      created_at: now,
      updated_at: now,
    };

    try {
      await this.ensureInitialized();
      const result = await this.db.collection("advertisements").add(doc);
      const created = await this.db.collection("advertisements").doc(result.id).get();
      return this.dbToAd(created.data[0]);
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 更新广告
   */
  async updateAd(id: string, data: UpdateAdData): Promise<Advertisement> {
    const update: any = {
      updated_at: new Date().toISOString(),
    };

    if (data.title !== undefined) update.title = data.title;
    if (data.type !== undefined) update.type = data.type;
    if (data.position !== undefined) update.position = data.position;
    if (data.fileUrl !== undefined) update.fileUrl = data.fileUrl;
    if (data.fileUrlCn !== undefined) update.fileUrlCn = data.fileUrlCn;
    if (data.fileUrlIntl !== undefined) update.fileUrlIntl = data.fileUrlIntl;
    if (data.linkUrl !== undefined) update.linkUrl = data.linkUrl;
    if (data.priority !== undefined) update.priority = data.priority;
    if (data.status !== undefined) update.status = data.status;
    if (data.startDate !== undefined) update.startDate = data.startDate;
    if (data.endDate !== undefined) update.endDate = data.endDate;
    if (data.fileSize !== undefined || data.file_size !== undefined) update.file_size = data.fileSize || data.file_size;

    try {
      await this.ensureInitialized();
      await this.db.collection("advertisements").doc(id).update(update);
      const result = await this.db.collection("advertisements").doc(id).get();
      return this.dbToAd(result.data[0]);
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 删除广告
   */
  async deleteAd(id: string): Promise<void> {
    try {
      await this.ensureInitialized();
      await this.db.collection("advertisements").doc(id).remove();
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 辅助方法：从数据库格式转换为 Advertisement
   */
  private dbToAd(doc: any): Advertisement {
    return {
      id: doc._id || doc.id,
      title: doc.title,
      type: doc.type || "image",
      position: doc.position || "bottom",
      fileUrl: doc.fileUrl || doc.file_url, // 兼容驼峰和蛇形式
      fileUrlCn: doc.fileUrlCn || doc.file_url_cn,
      fileUrlIntl: doc.fileUrlIntl || doc.file_url_intl,
      linkUrl: doc.linkUrl || doc.link_url || doc.redirect_url, // 兼容多种字段名
      priority: doc.priority ?? 0,
      status: doc.status ?? "active",
      startDate: doc.startDate || doc.start_date,
      endDate: doc.endDate || doc.end_date,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      file_size: doc.file_size || doc.fileSize, // 添加文件大小字段
    };
  }

  // ==================== 社交链接管理操作 ====================

  /**
   * 根据 ID 获取社交链接
   */
  async getSocialLinkById(id: string): Promise<SocialLink | null> {
    try {
      const result = await this.db.collection("social_links").doc(id).get();
      if (!result.data || result.data.length === 0) {
        return null;
      }
      return this.dbToSocialLink(result.data[0]);
    } catch (error: any) {
      if (error.code === "DOC_NOT_FOUND") {
        return null;
      }
      throw handleDatabaseError(error);
    }
  }

  /**
   * 列出社交链接
   */
  async listSocialLinks(): Promise<SocialLink[]> {
    try {
      const result = await this.db
        .collection("social_links")
        .orderBy("order", "asc")
        .get();

      return result.data.map((doc: any) => this.dbToSocialLink(doc));
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 创建社交链接
   */
  async createSocialLink(data: CreateSocialLinkData): Promise<SocialLink> {
    const now = new Date().toISOString();

    // 获取当前最大 order 值
    const existing = await this.listSocialLinks();
    const maxOrder = existing.length > 0
      ? Math.max(...existing.map((link) => link.order))
      : 0;

    const doc: any = {
      icon: data.icon,
      title: data.title,
      description: data.description,
      url: data.url,
      order: data.order ?? maxOrder + 1,
      created_at: now,
      updated_at: now,
    };

    try {
      const result = await this.db.collection("social_links").add(doc);
      const created = await this.db.collection("social_links").doc(result.id).get();
      return this.dbToSocialLink(created.data[0]);
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 更新社交链接
   */
  async updateSocialLink(id: string, data: UpdateSocialLinkData): Promise<SocialLink> {
    const update: any = {
      updated_at: new Date().toISOString(),
    };

    if (data.icon !== undefined) update.icon = data.icon;
    if (data.title !== undefined) update.title = data.title;
    if (data.description !== undefined) update.description = data.description;
    if (data.url !== undefined) update.url = data.url;
    if (data.order !== undefined) update.order = data.order;

    try {
      await this.db.collection("social_links").doc(id).update(update);
      const result = await this.db.collection("social_links").doc(id).get();
      return this.dbToSocialLink(result.data[0]);
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 删除社交链接
   */
  async deleteSocialLink(id: string): Promise<void> {
    try {
      await this.db.collection("social_links").doc(id).remove();
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 辅助方法：从数据库格式转换为 SocialLink
   */
  private dbToSocialLink(doc: any): SocialLink {
    return {
      id: doc._id || doc.id,
      icon: doc.icon,
      title: doc.title,
      description: doc.description,
      url: doc.url,
      order: doc.order ?? 0,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }

  // ==================== 版本发布管理操作 ====================

  /**
   * 根据 ID 获取版本发布
   */
  async getReleaseById(id: string): Promise<Release | null> {
    await this.ensureInitialized();
    try {
      console.log(`[getReleaseById] 查询版本 ID: ${id}`);
      const result = await this.db.collection("releases").doc(id).get();

      console.log(`[getReleaseById] 查询结果:`, {
        hasData: !!result.data,
        dataLength: result.data?.length,
        requestId: result.requestId
      });

      if (!result.data || result.data.length === 0) {
        console.warn(`[getReleaseById] 未找到版本: ${id}`);
        return null;
      }

      const release = this.dbToRelease(result.data[0]);
      console.log(`[getReleaseById] 成功获取版本:`, { id: release.id, version: release.version });
      return release;
    } catch (error: any) {
      console.error(`[getReleaseById] 查询版本失败:`, { id, error: error.message, code: error.code });

      if (error.code === "DOC_NOT_FOUND") {
        return null;
      }

      // 对于其他错误，也返回 null 而不是抛出异常
      // 这样可以让调用方处理"未找到"的情况
      console.warn(`[getReleaseById] 返回 null 而不是抛出异常`);
      return null;
    }
  }

  /**
   * 列出版本发布
   */
  async listReleases(filters?: ReleaseFilters): Promise<Release[]> {
    await this.ensureInitialized();
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.search) {
      where.$or = [
        { title: new RegExp(filters.search, "i") },
        { version: new RegExp(filters.search, "i") },
      ];
    }

    if (filters?.start_date || filters?.end_date) {
      where.created_at = {};
      if (filters.start_date) {
        where.created_at.$gte = filters.start_date;
      }
      if (filters.end_date) {
        where.created_at.$lte = filters.end_date;
      }
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    try {
      const result = await this.db
        .collection("releases")
        .where(where)
        .orderBy("created_at", "desc")
        .skip(offset)
        .limit(limit)
        .get();

      return result.data.map((doc: any) => this.dbToRelease(doc));
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 统计版本发布数量
   */
  async countReleases(filters?: ReleaseFilters): Promise<number> {
    await this.ensureInitialized();
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.search) {
      where.$or = [
        { title: new RegExp(filters.search, "i") },
        { version: new RegExp(filters.search, "i") },
      ];
    }

    if (filters?.start_date || filters?.end_date) {
      where.created_at = {};
      if (filters.start_date) {
        where.created_at.$gte = filters.start_date;
      }
      if (filters.end_date) {
        where.created_at.$lte = filters.end_date;
      }
    }

    try {
      const result = await this.db.collection("releases").where(where).count();
      return result.total;
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 创建版本发布
   */
  async createRelease(data: CreateReleaseData): Promise<Release> {
    await this.ensureInitialized();
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
      // 使用 add() 方法，CloudBase Node SDK 会自动生成 ID
      const result = await this.db.collection("releases").add(doc);

      console.log("[createRelease] CloudBase add() 返回结果:", result);

      // 获取插入的文档 ID
      let insertedId: string | undefined;
      if (result && result.id) {
        insertedId = result.id;
      } else if (result && result.ids && result.ids.length > 0) {
        insertedId = result.ids[0];
      }

      if (!insertedId) {
        console.error("[createRelease] 无法获取插入的文档 ID:", result);
        throw new DatabaseError("创建版本失败：无法获取文档 ID", "INSERT_FAILED");
      }

      console.log("[createRelease] 成功创建版本:", { insertedId, version: data.version });

      // 返回完整的版本对象
      return {
        id: insertedId,
        ...doc,
      };
    } catch (error: any) {
      console.error("[createRelease] 创建版本失败 - 详细错误信息:", {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack,
        fullError: error,
        docData: doc,
      });
      throw handleDatabaseError(error);
    }
  }

  /**
   * 更新版本发布
   */
  async updateRelease(id: string, data: UpdateReleaseData): Promise<Release> {
    await this.ensureInitialized();
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
      await this.db.collection("releases").doc(id).update(update);
      const result = await this.db.collection("releases").doc(id).get();
      return this.dbToRelease(result.data[0]);
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 删除版本发布
   */
  async deleteRelease(id: string): Promise<void> {
    await this.ensureInitialized();
    try {
      console.log(`[deleteRelease] 删除版本 ID: ${id}`);

      // 先验证文档是否存在
      const existing = await this.db.collection("releases").doc(id).get();
      if (!existing.data || existing.data.length === 0) {
        console.warn(`[deleteRelease] 版本不存在: ${id}`);
        throw new DatabaseError(`版本不存在: ${id}`, "DOC_NOT_FOUND");
      }

      // 删除文档
      const result = await this.db.collection("releases").doc(id).remove();

      console.log(`[deleteRelease] 删除结果:`, {
        id,
        requestId: result.requestId,
        removed: result.removed
      });

      // 验证删除是否成功
      const verify = await this.db.collection("releases").doc(id).get();
      if (verify.data && verify.data.length > 0) {
        console.error(`[deleteRelease] 删除后验证失败，文档仍存在: ${id}`);
        throw new DatabaseError("删除失败：文档仍然存在", "DELETE_FAILED");
      }

      console.log(`[deleteRelease] 成功删除版本: ${id}`);
    } catch (error: any) {
      console.error(`[deleteRelease] 删除版本失败:`, { id, error: error.message, code: error.code });
      throw handleDatabaseError(error);
    }
  }

  /**
   * 辅助方法：从数据库格式转换为 Release
   */
  private dbToRelease(doc: any): Release {
    return {
      id: doc._id || doc.id,
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
      await this.db.collection("admin_users").limit(1).get();
      return true;
    } catch (error) {
      console.error("CloudBase 健康检查失败:", error);
      return false;
    }
  }
}
