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
  AppRelease,
  CreateReleaseData,
  AiProjectAnalysis,
  AiAnalysisFilters,
  CreateAiProjectAnalysisData,
  AiCreativeBrief,
  CreateAiCreativeBriefData,
  AiGenerationJob,
  CreateAiGenerationJobData,
  UpdateAiGenerationJobData,
  AiJobFilters,
  AiAsset,
  CreateAiAssetData,
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
  private aiCollectionsReady: boolean = false;

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

  private async ensureAiCollections(): Promise<void> {
    if (this.aiCollectionsReady) return;
    await this.ensureInitialized();
    const collections = [
      "ai_project_analyses",
      "ai_creative_briefs",
      "ai_generation_jobs",
      "ai_assets",
    ];

    for (const name of collections) {
      try {
        await this.db.collection(name).limit(1).get();
      } catch (error: any) {
        const message = String(error?.message || "");
        const code = String(error?.code || "");
        const missing =
          message.includes("Db or Table not exist") ||
          message.includes("DATABASE_COLLECTION_NOT_EXIST") ||
          code.includes("DATABASE_COLLECTION_NOT_EXIST");

        if (!missing) {
          console.warn(`[CloudBaseAdapter] ensure AI collection failed: ${name}`, {
            code: error?.code,
            message: error?.message,
          });
          throw handleDatabaseError(error);
        }

        try {
          await this.db.createCollection(name);
          console.log(`[CloudBaseAdapter] ensured AI collection: ${name}`);
        } catch (createError: any) {
          console.warn(`[CloudBaseAdapter] create AI collection failed: ${name}`, {
            code: createError?.code,
            message: createError?.message,
          });
          throw handleDatabaseError(createError);
        }
      }
    }

    this.aiCollectionsReady = true;
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
    const results = await this.executeQuery("users", async (collection) => {
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
    await this.ensureInitialized();

    try {
      // 先按文档 _id 查询（管理后台通常返回此 ID）
      const result = await this.db.collection("users").doc(id).get();
      if (!result.data || result.data.length === 0) {
        // 回退按业务 ID 字段查询（users.id）
        const fallback = await this.db.collection("users").where({ id }).limit(1).get();
        if (!fallback.data || fallback.data.length === 0) {
          return null;
        }
        return this.dbToUser(fallback.data[0]);
      }
      return this.dbToUser(result.data[0]);
    } catch (error: any) {
      if (error.code === "DOC_NOT_FOUND") {
        // 回退按业务 ID 字段查询（users.id）
        try {
          const fallback = await this.db.collection("users").where({ id }).limit(1).get();
          if (!fallback.data || fallback.data.length === 0) {
            return null;
          }
          return this.dbToUser(fallback.data[0]);
        } catch (fallbackError: any) {
          throw handleDatabaseError(fallbackError);
        }
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

    let query = this.db.collection("users");

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
      const result = await this.db.collection("users").where(where).count();
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
      await this.db.collection("users").doc(id).update(data);
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
      await this.db.collection("users").doc(id).remove();
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  // 辅助方法：从数据库格式转换为 User
  private dbToUser(doc: any): User {
    return {
      id: doc._id || doc.id,
      email: doc.email,
      name: doc.name || doc.full_name || doc.username || doc.email || "",
      avatar: doc.avatar || doc.avatar_url,
      role: doc.role || "free",
      subscription_plan: doc.subscription_plan || "free",
      region: doc.region ?? "",
      status: doc.status || "active",
      created_at: doc.created_at,
      last_login_at: doc.last_login_at || doc.last_seen_at,
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
      const result = await this.db.collection("orders").doc(id).get();
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

    let query = this.db.collection("orders");

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
      const result = await this.db.collection("orders").where(where).count();
      return result.total;
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 辅助方法：从数据库格式转换为 Payment
   */
  private dbToPayment(doc: any): Payment {
    return {
      id: doc._id || doc.id,
      order_id: doc.order_id,
      user_id: doc.user_id,
      user_email: doc.user_email || doc.email,
      amount: doc.amount || 0,
      currency: doc.currency || "CNY",
      method: doc.method || doc.payment_method || "wechat",
      status: doc.status || "pending",
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
      file_url: data.fileUrl,
      fileUrlCn: data.fileUrlCn,
      fileUrlIntl: data.fileUrlIntl,
      linkUrl: data.linkUrl,
      link_url: data.linkUrl,
      priority: data.priority ?? 0,
      status: data.status ?? "active",
      startDate: data.startDate,
      start_date: data.startDate,
      endDate: data.endDate,
      end_date: data.endDate,
      file_size: data.fileSize ?? data.file_size ?? 0,
      impression_count: data.impression_count ?? 0,
      click_count: data.click_count ?? 0,
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
    if (data.fileUrl !== undefined) {
      update.fileUrl = data.fileUrl;
      update.file_url = data.fileUrl;
    }
    if (data.fileUrlCn !== undefined) update.fileUrlCn = data.fileUrlCn;
    if (data.fileUrlIntl !== undefined) update.fileUrlIntl = data.fileUrlIntl;
    if (data.linkUrl !== undefined) {
      update.linkUrl = data.linkUrl;
      update.link_url = data.linkUrl;
    }
    if (data.priority !== undefined) update.priority = data.priority;
    if (data.status !== undefined) update.status = data.status;
    if (data.startDate !== undefined) {
      update.startDate = data.startDate;
      update.start_date = data.startDate;
    }
    if (data.endDate !== undefined) {
      update.endDate = data.endDate;
      update.end_date = data.endDate;
    }
    if (data.fileSize !== undefined || data.file_size !== undefined) {
      update.file_size = data.fileSize ?? data.file_size;
    }
    if (data.impression_count !== undefined) update.impression_count = data.impression_count;
    if (data.click_count !== undefined) update.click_count = data.click_count;

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
    console.log('[CloudBaseAdapter] 删除广告:', id);
    try {
      await this.ensureInitialized();
      await this.db.collection("advertisements").doc(id).remove();
      console.log('[CloudBaseAdapter] 广告删除成功');
    } catch (error: any) {
      console.error('[CloudBaseAdapter] 删除广告失败:', error);
      throw handleDatabaseError(error);
    }
  }

  /**
   * 切换广告状态
   */
  async toggleAdStatus(id: string): Promise<Advertisement> {
    console.log('[CloudBaseAdapter] 切换广告状态:', id);
    try {
      await this.ensureInitialized();
      const ad = await this.getAdById(id);
      if (!ad) {
        throw new Error('广告不存在');
      }
      const newStatus = ad.status === 'active' ? 'inactive' : 'active';
      return this.updateAd(id, { status: newStatus });
    } catch (error: any) {
      console.error('[CloudBaseAdapter] 切换广告状态失败:', error);
      throw handleDatabaseError(error);
    }
  }

  /**
   * 获取广告统计
   */
  async getAdStats(): Promise<{ total: number; active: number; inactive: number; byType: { image: number; video: number } }> {
    console.log('[CloudBaseAdapter] 获取广告统计');
    try {
      await this.ensureInitialized();
      const result = await this.db.collection("advertisements").get();
      const data = result.data || [];

      const stats = {
        total: data.length,
        active: data.filter((ad: any) => ad.status === 'active').length,
        inactive: data.filter((ad: any) => ad.status === 'inactive').length,
        byType: {
          image: data.filter((ad: any) => ad.type === 'image').length,
          video: data.filter((ad: any) => ad.type === 'video').length,
        },
      };

      console.log('[CloudBaseAdapter] 广告统计:', stats);
      return stats;
    } catch (error: any) {
      console.error('[CloudBaseAdapter] 获取广告统计失败:', error);
      throw handleDatabaseError(error);
    }
  }

  /**
   * 辅助方法：从数据库格式转换为 Advertisement
   */
  private dbToAd(doc: any): Advertisement {
    const createdAt = doc.created_at || doc.createdAt || new Date().toISOString();
    return {
      id: doc._id || doc.id,
      title: doc.title,
      type: doc.type || "image",
      position: doc.position || "bottom",
      fileUrl: doc.fileUrl || doc.file_url || doc.image_url || "", // 兼容驼峰和蛇形式
      fileUrlCn: doc.fileUrlCn || doc.file_url_cn,
      fileUrlIntl: doc.fileUrlIntl || doc.file_url_intl,
      linkUrl: doc.linkUrl || doc.link_url || doc.redirect_url, // 兼容多种字段名
      priority: doc.priority ?? 0,
      status: doc.status ?? "active",
      startDate: doc.startDate || doc.start_date,
      endDate: doc.endDate || doc.end_date,
      created_at: createdAt,
      updated_at: doc.updated_at || createdAt,
      file_size: doc.file_size ?? doc.fileSize, // 添加文件大小字段
      impression_count: doc.impression_count ?? 0,
      click_count: doc.click_count ?? 0,
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
    console.log('[CloudBaseAdapter] 获取社交链接列表');
    try {
      await this.ensureInitialized();
      const result = await this.db
        .collection("social_links")
        .orderBy("order", "asc")
        .get();

      console.log('[CloudBaseAdapter] 获取到', result.data?.length || 0, '个社交链接');
      return result.data.map((doc: any) => this.dbToSocialLink(doc));
    } catch (error: any) {
      console.error('[CloudBaseAdapter] 获取社交链接失败:', error);
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
    console.log('[CloudBaseAdapter] 删除社交链接:', id);
    try {
      await this.ensureInitialized();
      await this.db.collection("social_links").doc(id).remove();
      console.log('[CloudBaseAdapter] 社交链接删除成功');
    } catch (error: any) {
      console.error('[CloudBaseAdapter] 删除社交链接失败:', error);
      throw handleDatabaseError(error);
    }
  }

  /**
   * 批量更新社交链接排序
   */
  async updateSocialLinksOrder(updates: Array<{ id: string; order: number }>): Promise<void> {
    console.log('[CloudBaseAdapter] 更新社交链接排序:', updates.length, '个');
    try {
      await this.ensureInitialized();
      for (const update of updates) {
        await this.db
          .collection("social_links")
          .doc(update.id)
          .update({ order: update.order, updated_at: new Date().toISOString() });
      }
      console.log('[CloudBaseAdapter] 排序更新成功');
    } catch (error: any) {
      console.error('[CloudBaseAdapter] 更新排序失败:', error);
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
  async getReleaseById(id: string): Promise<AppRelease | null> {
    await this.ensureInitialized();
    try {
      console.log(`[getReleaseById] 查询版本 ID: ${id}`);
      const result = await this.db.collection("releases").doc(id).get();

      console.log(`[getReleaseById] 查询结果:`, {
        hasData: Boolean(result.data),
        dataLength: result.data?.length,
        requestId: result.requestId,
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
  async listReleases(): Promise<AppRelease[]> {
    await this.ensureInitialized();
    try {
      const result = await this.db
        .collection("releases")
        .orderBy("created_at", "desc")
        .get();

      return result.data.map((doc: any) => this.dbToRelease(doc));
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 统计版本发布数量
   */
  async countReleases(): Promise<number> {
    await this.ensureInitialized();
    try {
      const result = await this.db.collection("releases").count();
      return result.total;
    } catch (error: any) {
      throw handleDatabaseError(error);
    }
  }

  /**
   * 创建版本发布
   */
  async createRelease(data: CreateReleaseData): Promise<AppRelease> {
    await this.ensureInitialized();
    const now = toISOString(new Date());

    const doc: any = {
      version: data.version,
      platform: data.platform,
      variant: data.variant,
      file_url: data.file_url,
      file_name: data.file_name,
      file_size: data.file_size,
      release_notes: data.release_notes,
      is_active: data.is_active,
      is_mandatory: data.is_mandatory,
      created_at: now,
      updated_at: now,
    };

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

      return this.dbToRelease({ _id: insertedId, ...doc });
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
  async updateRelease(id: string, data: Partial<CreateReleaseData>): Promise<AppRelease> {
    await this.ensureInitialized();
    const update: any = {
      updated_at: toISOString(new Date()),
    };

    if (data.version !== undefined) update.version = data.version;
    if (data.platform !== undefined) update.platform = data.platform;
    if (data.variant !== undefined) update.variant = data.variant;
    if (data.file_url !== undefined) update.file_url = data.file_url;
    if (data.file_name !== undefined) update.file_name = data.file_name;
    if (data.file_size !== undefined) update.file_size = data.file_size;
    if (data.release_notes !== undefined) update.release_notes = data.release_notes;
    if (data.is_active !== undefined) update.is_active = data.is_active;
    if (data.is_mandatory !== undefined) update.is_mandatory = data.is_mandatory;

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
    console.log('[CloudBaseAdapter] 删除版本发布:', id);
    await this.ensureInitialized();
    try {
      const existing = await this.db.collection("releases").doc(id).get();
      if (!existing.data || existing.data.length === 0) {
        console.warn('[CloudBaseAdapter] 版本不存在:', id);
        throw new Error(`版本不存在: ${id}`);
      }

      await this.db.collection("releases").doc(id).remove();
      console.log('[CloudBaseAdapter] 版本发布删除成功');
    } catch (error: any) {
      console.error('[CloudBaseAdapter] 删除版本发布失败:', error);
      throw handleDatabaseError(error);
    }
  }

  /**
   * 切换发布版本状态
   */
  async toggleReleaseStatus(id: string, isActive: boolean): Promise<AppRelease> {
    console.log('[CloudBaseAdapter] 切换发布版本状态:', id, isActive);
    return this.updateRelease(id, { is_active: isActive });
  }

  /**
   * 辅助方法：从数据库格式转换为 Release
   */
  private dbToRelease(doc: any): AppRelease {
    const createdAt = doc.created_at || doc.createdAt || new Date().toISOString();
    const fileSize =
      typeof doc.file_size === "number"
        ? doc.file_size
        : typeof doc.fileSize === "number"
          ? doc.fileSize
          : 0;
    const isActive =
      doc.is_active !== undefined
        ? doc.is_active
        : doc.isActive !== undefined
          ? doc.isActive
          : true;
    const isMandatory =
      doc.is_mandatory !== undefined
        ? doc.is_mandatory
        : doc.isMandatory !== undefined
          ? doc.isMandatory
          : false;

    return {
      id: doc._id || doc.id,
      version: doc.version,
      platform: doc.platform,
      variant: doc.variant,
      file_url: doc.file_url || doc.fileUrl || doc.fileURL || doc.fileId || "",
      file_name: doc.file_name || doc.fileName || "",
      file_size: fileSize,
      release_notes: doc.release_notes || doc.releaseNotes,
      is_active: isActive,
      is_mandatory: isMandatory,
      created_at: createdAt,
    };
  }

  private getCloudBaseInsertedId(result: any): string {
    if (result?.id) {
      return result.id;
    }
    if (Array.isArray(result?.ids) && result.ids.length > 0) {
      return result.ids[0];
    }
    throw new Error("CloudBase 插入成功但未返回文档 ID");
  }

  private dbToAiProjectAnalysis(doc: any): AiProjectAnalysis {
    return {
      id: doc._id || doc.id,
      region: doc.region,
      language: doc.language,
      repo_scope: doc.repo_scope || [],
      repo_digest: doc.repo_digest,
      analysis_payload: doc.analysis_payload,
      summary_text: doc.summary_text,
      created_by: doc.created_by,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }

  private dbToAiCreativeBrief(doc: any): AiCreativeBrief {
    return {
      id: doc._id || doc.id,
      analysis_id: doc.analysis_id,
      region: doc.region,
      language: doc.language,
      audience: doc.audience,
      core_selling_points: doc.core_selling_points || [],
      brand_tone: doc.brand_tone,
      must_include: doc.must_include || [],
      must_avoid: doc.must_avoid || [],
      cta: doc.cta,
      poster_goal: doc.poster_goal,
      style_preset: doc.style_preset,
      extra_notes: doc.extra_notes,
      created_by: doc.created_by,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }

  private dbToAiGenerationJob(doc: any): AiGenerationJob {
    return {
      id: doc._id || doc.id,
      analysis_id: doc.analysis_id,
      brief_id: doc.brief_id,
      region: doc.region,
      language: doc.language,
      job_type: doc.job_type,
      provider: doc.provider,
      provider_model: doc.provider_model,
      status: doc.status,
      progress: doc.progress ?? 0,
      input_payload: doc.input_payload || {},
      output_payload: doc.output_payload,
      error_message: doc.error_message,
      external_task_id: doc.external_task_id,
      created_by: doc.created_by,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      completed_at: doc.completed_at,
    };
  }

  private dbToAiAsset(doc: any): AiAsset {
    return {
      id: doc._id || doc.id,
      job_id: doc.job_id,
      asset_type: doc.asset_type,
      storage_provider: doc.storage_provider,
      storage_path: doc.storage_path,
      public_url: doc.public_url,
      mime_type: doc.mime_type,
      size: doc.size ?? 0,
      metadata: doc.metadata,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }

  // ==================== AI 创意中心操作 ====================

  async createAiProjectAnalysis(data: CreateAiProjectAnalysisData): Promise<AiProjectAnalysis> {
    await this.ensureAiCollections();
    const now = toISOString(new Date());
    const doc = {
      ...data,
      created_at: now,
      updated_at: now,
    };

    const result = await this.db.collection("ai_project_analyses").add(doc);
    return this.dbToAiProjectAnalysis({ _id: this.getCloudBaseInsertedId(result), ...doc });
  }

  async getAiProjectAnalysisById(id: string): Promise<AiProjectAnalysis | null> {
    await this.ensureAiCollections();
    const result = await this.db.collection("ai_project_analyses").doc(id).get();
    if (!result.data || result.data.length === 0) {
      return null;
    }
    return this.dbToAiProjectAnalysis(result.data[0]);
  }

  async listAiProjectAnalyses(filters?: AiAnalysisFilters): Promise<AiProjectAnalysis[]> {
    await this.ensureAiCollections();
    const where: any = {};
    if (filters?.region) where.region = filters.region;
    if (filters?.language) where.language = filters.language;
    if (filters?.created_by) where.created_by = filters.created_by;

    let query = this.db.collection("ai_project_analyses");
    if (Object.keys(where).length > 0) {
      query = query.where(where);
    }

    query = query.orderBy("updated_at", "desc");
    if (filters?.offset) query = query.skip(filters.offset);
    if (filters?.limit) query = query.limit(filters.limit);

    const result = await query.get();
    return (result.data || []).map((doc: any) => this.dbToAiProjectAnalysis(doc));
  }

  async createAiCreativeBrief(data: CreateAiCreativeBriefData): Promise<AiCreativeBrief> {
    await this.ensureAiCollections();
    const now = toISOString(new Date());
    const doc = {
      ...data,
      created_at: now,
      updated_at: now,
    };

    const result = await this.db.collection("ai_creative_briefs").add(doc);
    return this.dbToAiCreativeBrief({ _id: this.getCloudBaseInsertedId(result), ...doc });
  }

  async getAiCreativeBriefById(id: string): Promise<AiCreativeBrief | null> {
    await this.ensureAiCollections();
    const result = await this.db.collection("ai_creative_briefs").doc(id).get();
    if (!result.data || result.data.length === 0) {
      return null;
    }
    return this.dbToAiCreativeBrief(result.data[0]);
  }

  async createAiGenerationJob(data: CreateAiGenerationJobData): Promise<AiGenerationJob> {
    await this.ensureAiCollections();
    const now = toISOString(new Date());
    const doc = {
      ...data,
      status: data.status ?? "queued",
      progress: data.progress ?? 0,
      created_at: now,
      updated_at: now,
    };

    const result = await this.db.collection("ai_generation_jobs").add(doc);
    return this.dbToAiGenerationJob({ _id: this.getCloudBaseInsertedId(result), ...doc });
  }

  async updateAiGenerationJob(id: string, data: UpdateAiGenerationJobData): Promise<AiGenerationJob> {
    await this.ensureAiCollections();
    await this.db.collection("ai_generation_jobs").doc(id).update({
      ...data,
      updated_at: toISOString(new Date()),
    });

    const updated = await this.getAiGenerationJobById(id);
    if (!updated) {
      throw new Error(`AI 任务不存在: ${id}`);
    }
    return updated;
  }

  async getAiGenerationJobById(id: string): Promise<AiGenerationJob | null> {
    await this.ensureAiCollections();
    const result = await this.db.collection("ai_generation_jobs").doc(id).get();
    if (!result.data || result.data.length === 0) {
      return null;
    }
    return this.dbToAiGenerationJob(result.data[0]);
  }

  async listAiGenerationJobs(filters?: AiJobFilters): Promise<AiGenerationJob[]> {
    await this.ensureAiCollections();
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.job_type) where.job_type = filters.job_type;
    if (filters?.region) where.region = filters.region;
    if (filters?.language) where.language = filters.language;

    let query = this.db.collection("ai_generation_jobs");
    if (Object.keys(where).length > 0) {
      query = query.where(where);
    }

    query = query.orderBy("created_at", "desc");
    if (filters?.offset) query = query.skip(filters.offset);
    if (filters?.limit) query = query.limit(filters.limit);

    const result = await query.get();
    return (result.data || []).map((doc: any) => this.dbToAiGenerationJob(doc));
  }

  async createAiAsset(data: CreateAiAssetData): Promise<AiAsset> {
    await this.ensureAiCollections();
    const now = toISOString(new Date());
    const doc = {
      ...data,
      created_at: now,
      updated_at: now,
    };

    const result = await this.db.collection("ai_assets").add(doc);
    return this.dbToAiAsset({ _id: this.getCloudBaseInsertedId(result), ...doc });
  }

  async listAiAssetsByJobId(jobId: string): Promise<AiAsset[]> {
    await this.ensureAiCollections();
    const result = await this.db
      .collection("ai_assets")
      .where({ job_id: jobId })
      .orderBy("created_at", "asc")
      .get();

    return (result.data || []).map((doc: any) => this.dbToAiAsset(doc));
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

  // ==================== 文件管理操作 ====================

  /**
   * 获取存储文件列表
   */
  async listStorageFiles(): Promise<Array<{ name: string; url: string; size?: number; lastModified?: string; source: string }>> {
    console.log('[CloudBaseAdapter] 获取存储文件列表 - 开始');
    try {
      await this.ensureInitialized();
      console.log('[CloudBaseAdapter] 已初始化');
      const app = this.connector.getApp();
      console.log('[CloudBaseAdapter] app:', app?.constructor?.name);

      // CloudBase Storage API 列出文件
      let files: Array<{ name: string; url: string; size?: number; lastModified?: string; source: string }> = [];
      try {
        console.log('[CloudBaseAdapter] 开始调用 listFiles API');
        const result = await app.listFiles({
          prefix: '',
          maxKeys: 1000,
        });
        console.log('[CloudBaseAdapter] listFiles 返回结果:', {
          hasResult: !!result,
          resultKeys: result ? Object.keys(result) : [],
          fileListLength: result?.fileList?.length
        });

        files = (result.fileList || []).map((file: any) => ({
          name: file.Key,
          url: file.DownloadUrl || '',
          size: file.Size,
          lastModified: file.LastModified,
          source: 'cloudbase' as const,
        }));

        console.log('[CloudBaseAdapter] 获取到', files.length, '个文件');
      } catch (storageErr: any) {
        // CloudBase Storage 可能未配置或没有权限，返回空数组
        console.error('[CloudBaseAdapter] CloudBase Storage 列出文件失败:', {
          message: storageErr?.message,
          code: storageErr?.code,
          error: storageErr
        });
        files = [];
      }

      return files;
    } catch (error: any) {
      console.error('[CloudBaseAdapter] 获取文件列表失败:', error);
      throw handleDatabaseError(error);
    }
  }

  /**
   * 删除存储文件
   */
  async deleteStorageFile(fileName: string, fileId?: string, adId?: string): Promise<void> {
    console.log('[CloudBaseAdapter] 删除存储文件:', fileName, { fileId, adId });
    try {
      await this.ensureInitialized();
      const app = this.connector.getApp();

      // 删除文件
      await app.deleteFile({
        fileList: [fileId || fileName],
      });

      // 如果提供了 adId，同时删除广告记录
      if (adId) {
        await this.deleteAd(adId);
        console.log('[CloudBaseAdapter] 已删除关联的广告记录:', adId);
      }

      console.log('[CloudBaseAdapter] 文件删除成功');
    } catch (error: any) {
      console.error('[CloudBaseAdapter] 删除文件失败:', error);
      throw handleDatabaseError(error);
    }
  }

  /**
   * 重命名存储文件
   */
  async renameStorageFile(oldName: string, newName: string): Promise<void> {
    console.log('[CloudBaseAdapter] 重命名文件:', oldName, '->', newName);
    try {
      await this.ensureInitialized();
      const app = this.connector.getApp();

      // CloudBase 不支持直接重命名，需要下载后重新上传
      // 1. 下载文件
      const downloadResult = await this.downloadStorageFile(oldName);

      // 2. 上传新文件
      const buffer = Buffer.from(downloadResult.data, 'base64');
      await app.uploadFile({
        cloudPath: newName,
        fileContent: buffer,
      });

      // 3. 删除旧文件
      await app.deleteFile({
        fileList: [oldName],
      });

      console.log('[CloudBaseAdapter] 文件重命名成功');
    } catch (error: any) {
      console.error('[CloudBaseAdapter] 重命名文件失败:', error);
      throw handleDatabaseError(error);
    }
  }

  /**
   * 下载存储文件
   */
  async downloadStorageFile(fileName: string, fileId?: string): Promise<{ data: string; contentType: string; fileName: string }> {
    console.log('[CloudBaseAdapter] 下载文件:', fileName);
    try {
      await this.ensureInitialized();
      const app = this.connector.getApp();

      // 获取临时下载链接
      const result = await app.getTempFileURL({
        fileList: [fileId || fileName],
      });

      if (!result.fileList || result.fileList.length === 0) {
        throw new Error('获取文件下载链接失败');
      }

      const downloadUrl = result.fileList[0].tempFileURL;

      // 下载文件内容
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`下载文件失败: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      console.log('[CloudBaseAdapter] 文件下载成功');
      return {
        data: base64,
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        fileName: fileName,
      };
    } catch (error: any) {
      console.error('[CloudBaseAdapter] 下载文件失败:', error);
      throw handleDatabaseError(error);
    }
  }
}




















