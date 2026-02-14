# 管理后台附加功能设计文档

## 概述

为管理后台添加5个完整功能模块:社交链接管理、广告管理、文件管理、发布版本管理、系统设置。完全支持双数据库架构(CloudBase + Supabase)。

## 设计方案

### 1. 架构概述

**整体架构:**

这5个新功能模块将完全遵循现有的双数据库架构模式:

1. **数据库适配器层** - 在`lib/admin/`中扩展现有的适配器接口,添加新功能的方法:
   - `cloudbase-adapter.ts` - 实现CloudBase版本
   - `supabase-adapter.ts` - 实现Supabase版本
   - `types.ts` - 添加新的类型定义

2. **Server Actions层** - 在`actions/`中创建新的action文件:
   - `admin-social-links.ts` - 社交链接管理
   - `admin-ads.ts` - 广告管理
   - `admin-releases.ts` - 发布版本管理
   - `admin-files.ts` - 文件管理(查询现有文件)

3. **前端页面层** - 在`app/admin/`中创建页面组件:
   - 直接复制模板项目的页面代码
   - 保持UI完全一致

4. **文件存储** - 使用各自的云存储:
   - CloudBase: 使用CloudBase Storage
   - Supabase: 使用Supabase Storage

### 2. 数据库表结构

**需要创建的新表:**

#### social_links (社交链接)
- id, icon, title, description, url, order, created_at, updated_at
- 支持拖拽排序,预览链接

#### advertisements (广告)
- id, title, type(image/video), position, file_url, file_url_cn, file_url_intl, link_url, priority, status, file_size, start_date, end_date, created_at
- 需要文件上传功能(CloudBase Storage / Supabase Storage)
- 支持统计(总数、激活数、按类型统计)

#### releases (发布版本)
- id, version, platform(ios/android/windows/macos/linux), variant, file_url, file_name, file_size, release_notes, is_active, is_mandatory, created_at
- 需要文件上传功能(支持APK、IPA、EXE、DMG等)
- 支持多平台和架构变体

#### 文件管理
- 不需要新表
- 直接查询CloudBase Storage和Supabase Storage的文件列表
- 显示广告文件、发布版本文件、社交链接图标文件

**两个数据库的表结构会略有不同:**
- Supabase使用PostgreSQL(UUID主键、TIMESTAMPTZ)
- CloudBase使用NoSQL(字符串_id、Date类型)

### 3. 实施步骤

**阶段1: 基础设施**
1. 扩展`lib/admin/types.ts` - 添加新功能的类型定义(SocialLink, Advertisement, AppRelease等)
2. 扩展数据库适配器接口 - 在`AdminDatabaseAdapter`接口中添加新方法
3. ��现Supabase适配器 - 在`supabase-adapter.ts`中实现新方法
4. 实现CloudBase适配器 - 在`cloudbase-adapter.ts`中实现新方法

**阶段2: Server Actions**
5. 创建`actions/admin-social-links.ts` - 社交链接CRUD操作
6. 创建`actions/admin-ads.ts` - 广告管理和文件上传
7. 创建`actions/admin-releases.ts` - 发布版本管理和文件上传
8. 扩展现有actions - 添加文件管理相关功能

**阶段3: 前端页面**
9. 复制并适配5个页面组件(直接从模板项目复制)
10. 确保所有UI组件已安装(shadcn/ui)

**阶段4: 数据库初始化**
11. 创建Supabase表创建脚本
12. 创建CloudBase集合创建脚本

### 4. 测试和调试策略

**测试策略:**

1. **功能测试** - 每完成一个模块后立即测试:
   - 创建测试数据
   - 测试CRUD操作(创建、读取、更新、删除)
   - 测试文件上传功能
   - 测试双数据库切换(修改`NEXT_PUBLIC_DEFAULT_LANGUAGE`环境变量)

2. **调试日志** - 在关键位置添加日志:
   - 数据库适配器方法入口/出口
   - 文件上传前后
   - 错误捕获点
   - 使用`console.log('[ModuleName] 操作描述:', 数据)`格式

3. **错误处理** - 统一的错误处理:
   - 所有Server Actions返回`{success: boolean, data?: any, error?: string}`格式
   - 前端显示友好的错误提示
   - 后端记录详细的错误日志

**测试检查清单:**
- ✅ 国内版(zh)能正常使用所有功能
- ✅ 国际版(en)能正常使用所有功能
- ✅ 文件上传到正确的存储(CloudBase/Supabase)
- ✅ 数据存储到正确的数据库
- ✅ 所有CRUD操作正常工作

## 功能模块详情

### 1. 社交链接管理 (social-links)
- 完整的CRUD功能
- 支持拖拽排序(上移/下移)
- 支持预览链接
- 图标选择(GitHub, Twitter, LinkedIn等)

### 2. 广告管理 (ads)
- 广告列表展示(支持分页)
- 创建/编辑/删除广告
- 切换广告状态(上架/下架)
- 支持图片和视频广告
- 文件上传到云存储
- 广告统计(总数、激活数、按类型统计)

### 3. 文件管理 (files)
- 查看云存储文件列表
- 支持预览(图片/视频)
- 支持下载文件
- 支持重命名文件
- 支持删除文件
- 分类显示(广告文件、应用文件、图标文件)

### 4. 发布版本管理 (releases)
- 管理应用发布版本
- 支持多平台(iOS、Android、Windows、macOS、Linux)
- 支持架构变体(x64、ARM64、Intel、M系列等)
- 文件上传(APK、IPA、EXE、DMG等)
- 版本启用/禁用
- 强制更新标记

### 5. 系统设置 (settings)
- 修改管理员密码
- 显示系统信息
- 关于页面

## 技术要点

### 文件上传
- CloudBase: 使用`@cloudbase/node-sdk`的`uploadFile`方法
- Supabase: 使用`supabase.storage.from().upload()`方法
- 文件命名规则: `{type}-{timestamp}-{originalName}`

### 数据库适配
- 统一的接口定义
- 两个适配器实现相同的方法
- 通过环境变量切换数据库

### 错误处理
- 统一的错误返回格式
- 友好的错误提示
- 详细的日志记录

## 参考项目

模板项目路径: `D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main`

主要参考文件:
- `app/admin/social-links/page.tsx` - 社交链接管理页面
- `app/admin/ads/page.tsx` - 广告管理页面
- `app/admin/files/page.tsx` - 文件管理页面
- `app/admin/releases/page.tsx` - 发布版本管理页面
- `app/admin/settings/page.tsx` - 系统设置页面
- `actions/admin-social-links.ts` - 社交链接actions
- `actions/admin-ads.ts` - 广告管理actions
- `actions/admin-releases.ts` - 发布版本actions
