/**
 * 管理后台系统类型定义
 *
 * 统一定义管理员用户、会话、日志、配置等核心数据结构
 * 兼容 CloudBase (MongoDB) 和 Supabase (PostgreSQL)
 */

// ==================== 管理员用户 ====================

/**
 * 管理员角色
 */
export type AdminRole = "admin" | "super_admin";

/**
 * 管理员状态
 */
export type AdminStatus = "active" | "disabled";

/**
 * 管理员用户
 *
 * 统一使用 id 字段（兼容 MongoDB 的 _id 和 PostgreSQL 的 id）
 * 日期字段使用 ISO 8601 字符串格式
 */
export interface AdminUser {
  id: string;
  username: string;
  role: AdminRole;
  status: AdminStatus;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
  created_by?: string; // 创建者 ID
}

/**
 * 创建管理员数据
 */
export interface CreateAdminData {
  username: string;
  password: string;
  role?: AdminRole;
  created_by?: string;
}

/**
 * 更新管理员数据
 */
export interface UpdateAdminData {
  username?: string;
  password?: string;
  role?: AdminRole;
  status?: AdminStatus;
}

/**
 * 管理员列表过滤条件
 */
export interface AdminFilters {
  status?: AdminStatus;
  role?: AdminRole;
  search?: string; // 搜索用户名
  limit?: number;
  offset?: number;
}

// ==================== 管理员会话 ====================

/**
 * 管理员会话
 *
 * 存储在 Cookie 中的会话数据（Base64 编码）
 */
export interface AdminSession {
  adminId: string;
  username: string;
  role: AdminRole;
  createdAt: number; // Unix 时间戳（秒）
  expiresAt: number; // Unix 时间戳（秒）
}

/**
 * 会话验证结果
 */
export interface SessionValidationResult {
  valid: boolean;
  session?: AdminSession;
  error?: string;
}

// ==================== 操作日志 ====================

/**
 * 操作状态
 */
export type LogStatus = "success" | "failure";

/**
 * 操作资源类型
 */
export type LogResourceType =
  | "admin"
  | "user"
  | "assessment"
  | "payment"
  | "ad"
  | "social_link"
  | "file"
  | "release"
  | "config"
  | "system";

/**
 * 操作类型
 */
export type LogAction =
  // 管理员操作
  | "admin.login"
  | "admin.logout"
  | "admin.create"
  | "admin.update"
  | "admin.delete"
  // 用户操作
  | "user.view"
  | "user.update"
  | "user.disable"
  | "user.enable"
  // 评估操作
  | "assessment.view"
  | "assessment.delete"
  // 支付操作
  | "payment.view"
  | "payment.refund"
  // 内容操作
  | "ad.create"
  | "ad.update"
  | "ad.delete"
  | "social_link.create"
  | "social_link.update"
  | "social_link.delete"
  | "file.upload"
  | "file.delete"
  | "file.rename"
  | "release.create"
  | "release.update"
  | "release.rollback"
  // 系统操作
  | "config.update"
  | "system.backup"
  | "system.restore";

/**
 * 系统操作日志
 */
export interface SystemLog {
  id: string;
  admin_id: string;
  admin_username: string;
  action: LogAction;
  resource_type?: LogResourceType;
  resource_id?: string;
  details: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  status: LogStatus;
  error_message?: string;
  created_at: string;
}

/**
 * 创建日志数据
 */
export interface CreateLogData {
  admin_id: string;
  admin_username: string;
  action: LogAction;
  resource_type?: LogResourceType;
  resource_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  status?: LogStatus;
  error_message?: string;
}

/**
 * 日志过滤条件
 */
export interface LogFilters {
  admin_id?: string;
  action?: LogAction;
  resource_type?: LogResourceType;
  status?: LogStatus;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

// ==================== 系统配置 ====================

/**
 * 配置分类
 */
export type ConfigCategory =
  | "general"
  | "payment"
  | "ai"
  | "storage"
  | "security"
  | "notification";

/**
 * 系统配置
 */
export interface SystemConfig {
  id: string;
  key: string;
  value: any;
  description?: string;
  category: ConfigCategory;
  updated_at: string;
}

/**
 * 更新配置数据
 */
export interface UpdateConfigData {
  key: string;
  value: any;
  description?: string;
  category: ConfigCategory;
}

// ==================== 数据库适配器 ====================

/**
 * 数据库类型
 */
export type DatabaseType = "cloudbase" | "supabase";

/**
 * 数据库适配器接口
 *
 * 定义统一的数据访问层，支持多种数据库实现
 */
export interface AdminDatabaseAdapter {
  // ==================== 管理员操作 ====================
  /**
   * 根据用户名获取管理员
   */
  getAdminByUsername(username: string): Promise<AdminUser | null>;

  /**
   * 根据 ID 获取管理员
   */
  getAdminById(id: string): Promise<AdminUser | null>;

  /**
   * 创建管理员
   * @returns 创建的管理员对象
   */
  createAdmin(data: CreateAdminData): Promise<AdminUser>;

  /**
   * 更新管理员
   * @returns 更新后的管理员对象
   */
  updateAdmin(id: string, data: UpdateAdminData): Promise<AdminUser>;

  /**
   * 删除管理员
   */
  deleteAdmin(id: string): Promise<void>;

  /**
   * 列出所有管理员
   */
  listAdmins(filters?: AdminFilters): Promise<AdminUser[]>;

  /**
   * 统计管理员数量
   */
  countAdmins(filters?: AdminFilters): Promise<number>;

  /**
   * 更新管理员密码
   */
  updateAdminPassword(username: string, hashedPassword: string): Promise<void>;

  // ==================== 日志操作 ====================
  /**
   * 创建操作日志
   */
  createLog(log: CreateLogData): Promise<SystemLog>;

  /**
   * 获取日志列表
   */
  getLogs(filters?: LogFilters): Promise<SystemLog[]>;

  /**
   * 统计日志数量
   */
  countLogs(filters?: LogFilters): Promise<number>;

  // ==================== 用户管理操作 ====================
  /**
   * 根据用户名获取普通用户
   */
  getUserByUsername(username: string): Promise<User | null>;

  /**
   * 根据 ID 获取普通用户
   */
  getUserById(id: string): Promise<User | null>;

  /**
   * 列出普通用户
   */
  listUsers(filters?: UserFilters): Promise<User[]>;

  /**
   * 统计普通用户数量
   */
  countUsers(filters?: UserFilters): Promise<number>;

  /**
   * 更新普通用户
   */
  updateUser(id: string, updates: Partial<User>): Promise<User>;

  /**
   * 删除普通用户
   */
  deleteUser(id: string): Promise<void>;

  // ==================== 评估管理操作 ====================
  /**
   * 根据 ID 获取评估记录
   */
  getAssessmentById(id: string): Promise<Assessment | null>;

  /**
   * 列出评估记录
   */
  listAssessments(filters?: AssessmentFilters): Promise<Assessment[]>;

  /**
   * 统计评估记录数量
   */
  countAssessments(filters?: AssessmentFilters): Promise<number>;

  /**
   * 删除评估记录
   */
  deleteAssessment(id: string): Promise<void>;

  // ==================== 支付管理操作 ====================
  /**
   * 根据 ID 获取支付记录
   */
  getPaymentById(id: string): Promise<Payment | null>;

  /**
   * 列出支付记录
   */
  listPayments(filters?: PaymentFilters): Promise<Payment[]>;

  /**
   * 统计支付记录数量
   */
  countPayments(filters?: PaymentFilters): Promise<number>;

  // ==================== 广告管理操作 ====================
  /**
   * 列出广告
   */
  listAds(filters: { limit?: number; offset?: number }): Promise<{ items: Advertisement[]; total: number }>;

  /**
   * 根据 ID 获取广告
   */
  getAdById(id: string): Promise<Advertisement | null>;

  /**
   * 创建广告
   */
  createAd(data: CreateAdData): Promise<Advertisement>;

  /**
   * 更新广告
   */
  updateAd(id: string, data: Partial<CreateAdData>): Promise<Advertisement>;

  /**
   * 删除广告
   */
  deleteAd(id: string): Promise<void>;

  /**
   * 切换广告状态
   */
  toggleAdStatus(id: string): Promise<Advertisement>;

  /**
   * 获取广告统计
   */
  getAdStats(): Promise<AdStats>;

  // ==================== 社交链接管理操作 ====================
  /**
   * 列出社交链接
   */
  listSocialLinks(): Promise<SocialLink[]>;

  /**
   * 根据 ID 获取社交链接
   */
  getSocialLinkById(id: string): Promise<SocialLink | null>;

  /**
   * 创建社交链接
   */
  createSocialLink(data: CreateSocialLinkData): Promise<SocialLink>;

  /**
   * 更新社交链接
   */
  updateSocialLink(id: string, data: UpdateSocialLinkData): Promise<SocialLink>;

  /**
   * 删除社交链接
   */
  deleteSocialLink(id: string): Promise<void>;

  /**
   * 更新社交链接排序
   */
  updateSocialLinksOrder(updates: Array<{ id: string; order: number }>): Promise<void>;

  // ==================== 版本发布管理操作 ====================
  /**
   * 列出版本发布
   */
  listReleases(): Promise<AppRelease[]>;

  /**
   * 根据 ID 获取版本发布
   */
  getReleaseById(id: string): Promise<AppRelease | null>;

  /**
   * 创建版本发布
   */
  createRelease(data: CreateReleaseData): Promise<AppRelease>;

  /**
   * 更新版本发布
   */
  updateRelease(id: string, data: Partial<CreateReleaseData>): Promise<AppRelease>;

  /**
   * 删除版本发布
   */
  deleteRelease(id: string): Promise<void>;

  /**
   * 切换版本发布状态
   */
  toggleReleaseStatus(id: string, isActive: boolean): Promise<AppRelease>;

  // ==================== 文件管理操作 ====================
  /**
   * 列出存储文件
   */
  listStorageFiles(): Promise<StorageFile[]>;

  /**
   * 删除存储文件
   */
  deleteStorageFile(fileName: string, fileId?: string, adId?: string): Promise<void>;

  /**
   * 重命名存储文件
   */
  renameStorageFile(oldName: string, newName: string): Promise<void>;

  /**
   * 下载存储文件
   */
  downloadStorageFile(fileName: string, fileId?: string): Promise<{ data: string; contentType: string; fileName: string }>;

  // ==================== 配置操作 ====================
  /**
   * 获取配置值
   */
  getConfig(key: string): Promise<any>;

  /**
   * 设置配置值
   */
  setConfig(key: string, value: any, category: ConfigCategory, description?: string): Promise<void>;

  /**
   * 列出所有配置
   */
  listConfigs(category?: ConfigCategory): Promise<SystemConfig[]>;

  /**
   * 删除配置
   */
  deleteConfig(key: string): Promise<void>;

  // ==================== 健康检查 ====================
  /**
   * 检查数据库连接
   */
  healthCheck(): Promise<boolean>;
}

// ==================== API 响应类型 ====================

/**
 * 成功响应
 */
export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

/**
 * 错误响应
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: any;
}

/**
 * API 响应（联合类型）
 */
export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// ==================== 分页类型 ====================

/**
 * 分页参数
 */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 分页选项
 */
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  maxPageSize?: number;
}

// ==================== 登录类型 ====================

/**
 * 登录凭证
 */
export interface LoginCredentials {
  username: string;
  password: string;
}

/**
 * 登录结果
 */
export interface LoginResult {
  success: boolean;
  admin?: AdminUser;
  error?: string;
}

// ==================== 统计数据类型 ====================

/**
 * 用户统计
 */
export interface UserStats {
  total: number;
  free: number;
  pro: number;
  enterprise: number;
  newThisMonth: number;
  activeThisWeek: number;
}

/**
 * 收入统计
 */
export interface RevenueStats {
  total: number;
  thisMonth: number;
  today: number;
  byMethod: {
    wechat: number;
    alipay: number;
    stripe: number;
    paypal: number;
  };
}

/**
 * 评估统计
 */
export interface AssessmentStats {
  total: number;
  thisMonth: number;
  today: number;
  averageScore: number;
}

/**
 * 仪表板数据
 */
export interface DashboardStats {
  users: UserStats;
  revenue: RevenueStats;
  assessments: AssessmentStats;
  systemHealth: {
    database: "healthy" | "degraded" | "down";
    storage: "healthy" | "degraded" | "down";
    api: "healthy" | "degraded" | "down";
  };
}

// ==================== 文件管理类型 ====================

/**
 * 文件类型
 */
export type FileType = "image" | "video" | "document" | "other";

/**
 * 文件信息
 */
export interface FileInfo {
  name: string;
  size: number;
  type: FileType;
  url: string;
  storage: "cloudbase" | "supabase";
  created_at: string;
}

/**
 * 文件类别
 */
export type FileCategory = "ads" | "social-icons" | "releases" | "documents";

// ==================== 广告类型 ====================

/**
 * 广告位置
 */
export type AdPosition =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "bottom-left"
  | "bottom-right"
  | "sidebar";

/**
 * 广告类型
 */
export type AdType = "image" | "video";

/**
 * 广告状态
 */
export type AdStatus = "active" | "inactive";

/**
 * 广告数据
 */
export interface Advertisement {
  id: string;
  title: string;
  type: AdType;
  position: AdPosition;
  fileUrl: string;
  fileUrlCn?: string; // 国内版本文件 URL（保留字段，暂时不使用）
  fileUrlIntl?: string; // 国际版本文件 URL（保留字段，暂时不使用）
  linkUrl?: string;
  priority: number;
  status: AdStatus;
  startDate?: string; // 保留字段，暂时不使用
  endDate?: string; // 保留字段，暂时不使用
  created_at: string;
  updated_at: string;
  file_size?: number; // 文件大小（字节）
}

/**
 * 创建广告数据
 */
export interface CreateAdData {
  title: string;
  type: AdType;
  position: AdPosition;
  fileUrl: string;
  fileUrlCn?: string; // 保留字段，暂时不使用
  fileUrlIntl?: string; // 保留字段，暂时不使用
  linkUrl?: string;
  priority?: number;
  status?: AdStatus;
  startDate?: string; // 保留字段，暂时不使用
  endDate?: string; // 保留字段，暂时不使用
  fileSize?: number; // 文件大小（字节）
}

/**
 * 更新广告数据
 */
export interface UpdateAdData {
  title?: string;
  type?: AdType;
  position?: AdPosition;
  fileUrl?: string;
  fileUrlCn?: string;
  fileUrlIntl?: string;
  linkUrl?: string;
  priority?: number;
  status?: AdStatus;
  startDate?: string;
  endDate?: string;
}

/**
 * 广告过滤条件
 */
export interface AdFilters {
  status?: AdStatus;
  type?: AdType;
  position?: AdPosition;
  search?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

// ==================== 社交链接类型 ====================

/**
 * 社交链接
 */
export interface SocialLink {
  id: string;
  icon: string;
  title: string;
  description?: string;
  url: string;
  order: number;
  created_at: string;
  updated_at: string;
}

/**
 * 创建社交链接数据
 */
export interface CreateSocialLinkData {
  icon: string;
  title: string;
  description?: string;
  url: string;
  order?: number;
}

/**
 * 更新社交链接数据
 */
export interface UpdateSocialLinkData {
  icon?: string;
  title?: string;
  description?: string;
  url?: string;
  order?: number;
}

// ==================== 版本发布类型 ====================

/**
 * 版本状态
 */
export type ReleaseStatus = "draft" | "published" | "archived";

/**
 * 版本发布
 */
export interface Release {
  id: string;
  version: string;
  title: string;
  description?: string;
  status: ReleaseStatus;
  releaseNotes?: string;
  fileUrl?: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
}

/**
 * 创建版本发布数据
 */
export interface CreateReleaseData {
  version: string;
  title: string;
  description?: string;
  status?: ReleaseStatus;
  releaseNotes?: string;
  fileUrl?: string;
}

/**
 * 更新版本发布数据
 */
export interface UpdateReleaseData {
  version?: string;
  title?: string;
  description?: string;
  status?: ReleaseStatus;
  releaseNotes?: string;
  fileUrl?: string;
  published_at?: string;
}

/**
 * 版本发布过滤条件
 */
export interface ReleaseFilters {
  status?: ReleaseStatus;
  search?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

// ==================== 用户管理类型 ====================

/**
 * 普通用户角色
 */
export type UserRole = "free" | "pro" | "enterprise";

/**
 * 用户状态
 */
export type UserStatus = "active" | "disabled" | "banned";

/**
 * 普通用户（用于管理后台查看）
 */
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  subscription_plan: UserRole;
  region: string;
  status: UserStatus;
  created_at: string;
  last_login_at?: string;
  pro_expires_at?: string;
}

/**
 * 用户过滤条件
 */
export interface UserFilters {
  status?: UserStatus;
  role?: UserRole;
  subscription_plan?: UserRole;
  region?: string;
  search?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

// ==================== 支付记录类型 ====================

/**
 * 支付方式
 */
export type PaymentMethod = "wechat" | "alipay" | "stripe" | "paypal";

/**
 * 支付状态
 */
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

/**
 * 支付类型
 */
export type PaymentType = "subscription" | "tokens" | "pro";

/**
 * 支付记录
 */
export interface Payment {
  id: string;
  order_id?: string;
  user_id: string;
  user_email?: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  type: PaymentType;
  product_id?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

/**
 * 支付过滤条件
 */
export interface PaymentFilters {
  status?: PaymentStatus;
  method?: PaymentMethod;
  type?: PaymentType;
  user_id?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

// ==================== 评估记录类型 ====================

/**
 * 评估记录
 */
export interface Assessment {
  id: string;
  user_id: string;
  user_email?: string;
  type: string;
  score?: number;
  status: "completed" | "in_progress" | "abandoned";
  answers?: Record<string, any>;
  feedback?: string;
  created_at: string;
  completed_at?: string;
}

/**
 * 评估过滤条件
 */
export interface AssessmentFilters {
  user_id?: string;
  type?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

// ==================== 广告统计 ====================

export interface AdStats {
  total: number;
  active: number;
  inactive: number;
  byType: {
    image: number;
    video: number;
  };
}

// ==================== 应用发布版本管理 ====================

export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'linux';
export type Variant = 'x64' | 'x86' | 'arm64' | 'intel' | 'm' | 'deb' | 'rpm' | 'appimage' | 'snap' | 'flatpak' | 'aur';

export interface AppRelease {
  id: string;
  version: string;
  platform: Platform;
  variant?: Variant;
  file_url: string;
  file_name: string;
  file_size: number;
  release_notes?: string;
  is_active: boolean;
  is_mandatory: boolean;
  created_at: string;
}

export interface CreateReleaseData {
  version: string;
  platform: Platform;
  variant?: Variant;
  file_url: string;
  file_name: string;
  file_size: number;
  release_notes?: string;
  is_active: boolean;
  is_mandatory: boolean;
}

// ==================== 文件存储管理 ====================

export interface StorageFile {
  name: string;
  url: string;
  size?: number;
  lastModified?: string;
  source: 'cloudbase' | 'supabase';
  fileId?: string;
  adId?: string;
}

export interface ReleaseFile extends StorageFile {
  platform?: Platform;
  version?: string;
  releaseId?: string;
}

export interface SocialLinkFile extends StorageFile {
  linkId?: string;
}
