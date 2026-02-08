项目架构文档生成计划

通过代码探索和数据库查询，我已经收集了以下关键信息：

这是一个基于 Next.js 16 + React 19 的企业级聊天应用
采用双数据库架构：Supabase（国际版）+ CloudBase（国内版）
支持多地区访问控制和支付集成
包含实时通讯、文件上传、视频通话等功能
Implementation Plan（实施计划）
1. 文档结构设计
包含以下章节：

1.1 项目概述
项目名称和定位
核心功能特性
目标用户群体
技术亮点
1.2 技术栈分析
前端技术栈：

框架：Next.js 16.0.7 (App Router) + React 19.2.0
语言：TypeScript 5.9.3
UI 组件库：Radix UI (shadcn/ui) - 80+ 组件
样式方案：Tailwind CSS 4.1.9 + PostCSS
状态管理：React Context API (SettingsContext, RegionContext)
表单处理：React Hook Form + Zod 验证
图标库：Lucide React
其他库：Recharts（图表）、Sonner（通知）、Embla Carousel（轮播）
后端技术栈：

数据库：
Supabase (PostgreSQL) - 国际版
CloudBase (NoSQL) - 国内版
认证：Supabase Auth + OAuth (Google, WeChat)
支付集成：Stripe、PayPal、微信支付、支付宝
实时通讯：Agora RTC SDK（音视频通话）
文件存储：云存储集成
开发工具：

包管理器：npm
代码规范：ESLint
部署：Docker (standalone 模式)
1.3 目录结构说明

mvp33/
├── app/                          # Next.js App Router
│   ├── api/                      # API 路由
│   │   ├── auth/                 # 认证相关 API
│   │   ├── messages/             # 消息相关 API
│   │   ├── conversations/        # 会话相关 API
│   │   ├── contacts/             # 联系人相关 API
│   │   ├── payment/              # 支付相关 API
│   │   └── agora/                # Agora 音视频 API
│   ├── chat/                     # 聊天界面
│   ├── channels/                 # 频道管理
│   ├── contacts/                 # 联系人管理
│   ├── login/                    # 登录页面
│   ├── payment/                  # 支付/订阅页面
│   ├── settings/                 # 设置页面
│   ├── layout.tsx                # 根布局
│   └── page.tsx                  # 首页
│
├── components/                   # React 组件
│   ├── ui/                       # shadcn/ui 基础组件
│   ├── auth/                     # 认证组件
│   ├── chat/                     # 聊天组件
│   ├── channels/                 # 频道组件
│   ├── contacts/                 # 联系人组件
│   ├── payment/                  # 支付组件
│   └── settings/                 # 设置组件
│
├── lib/                          # 工具函数和服务
│   ├── supabase/                 # Supabase 客户端
│   ├── cloudbase/                # CloudBase 集成
│   ├── database/                 # 数据库工具
│   ├── auth/                     # 认证工具
│   ├── payment/                  # 支付处理
│   ├── agora/                    # Agora 集成
│   ├── core/                     # 核心工具（地理路由）
│   ├── types.ts                  # TypeScript 类型定义
│   ├── i18n.ts                   # 国际化
│   ├── settings-context.tsx      # 设置状态管理
│   ├── region-context.tsx        # 地区检测状态
│   └── database-router.ts        # 数据库路由
│
├── hooks/                        # 自定义 React Hooks
├── config/                       # 配置文件
├── public/                       # 静态资源
├── scripts/                      # 数据库脚本
├── middleware.ts                 # Next.js 中间件
├── next.config.mjs               # Next.js 配置
├── package.json                  # 依赖配置
└── tsconfig.json                 # TypeScript 配置
1.4 数据库架构
Supabase 数据库（PostgreSQL - 国际版）

数据库连接信息：

URL: https://kradpewmiizgughuxveg.supabase.co
地区: AWS ap-south-1 (印度)
核心数据表（12 张表）：

users - 用户表

字段：id (UUID), email, username, full_name, avatar_url, phone, department, title, status, region, subscription_type, subscription_expires_at
状态：online, offline, away, busy
地区：cn (中国), global (国际)

workspaces - 工作空间表
字段：id, name, logo_url, domain, owner_id, settings (JSONB)
支持多租户架构
workspace_members - 工作空间成员表

字段：id, workspace_id, user_id, role
角色：owner, admin, member, guest
conversations - 会话表

字段：id, workspace_id, type, name, description, avatar_url, created_by, is_private, last_message_at
类型：direct (私聊), group (群聊), channel (频道)
conversation_members - 会话成员表
字段：id, conversation_id, user_id, role, last_read_at, notification_setting
通知设置：all, mentions, none
messages - 消息表
字段：id, conversation_id, sender_id, content, type, metadata (JSONB), reply_to, reactions (JSONB), is_edited, is_deleted, is_recalled
消息类型：text, image, file, video, audio, code, system
支持消息回复、表情反应、编辑、删除、撤回
contacts - 联系人表
字段：id, user_id, contact_user_id, nickname, tags, is_favorite, is_blocked
contact_requests - 好友请求表
字段：id, from_user_id, to_user_id, status, message
hidden_messages - 隐藏消息表

字段：id, user_id, message_id
用于用户级别的消息隐藏
orders - 订单表

字段：id, user_id, amount, currency, status, payment_method, subscription_type
departments - 部门表

字段：id, name, parent_id, workspace_id
user_profiles - 用户扩展信息表

字段：id, user_id, preferences (JSONB)

CloudBase 数据库（NoSQL - 国内版）

环境信息：
环境 ID: cloud1-3giwb8x723267ff3
地区：中国
数据集合（3 个集合）：

ai_bot_chat_history_5hobd2b

文档数：56
大小：503KB
用途：AI 机器人聊天历史记录
orbitchat_access_logs

文档数：36
大小：17KB
用途：访问日志记录
orbitchat_user_feedback

文档数：5
大小：2.4KB
用途：用户反馈收集
数据库路由策略：

根据环境变量 NEXT_PUBLIC_DEFAULT_LANGUAGE 自动选择数据库
zh → CloudBase (国内版)
en → Supabase (国际版)
实现文件：lib/database-router.ts

1.5 核心功能模块
1. 认证系统

邮箱密码登录
OAuth 登录（Google、微信）
邮箱确认流程
会话管理（Supabase SSR）
地区感知认证
2. 消息系统

实时消息发送/接收
多种消息类型（文本、图片、文件、视频、音频、代码）
消息回复和引用
表情反应
消息编辑和撤回
消息隐藏（用户级别）
3. 会话管理

私聊（Direct Message）
群聊（Group）
频道（Channel）
会话置顶和隐藏
未读消息计数
通知设置
4. 联系人管理

添加/删除联系人
好友请求
联系人备注
联系人标签
收藏和屏蔽
5. 音视频通话

集成 Agora RTC SDK
视频通话
语音通话
语音消息录制
6. 文件管理

文件上传（最大 500MB）
云存储集成
文件预览
文件下载
7. 支付订阅

多支付方式：Stripe、PayPal、微信支付、支付宝
地区感知支付方式
订阅管理
使用量跟踪
8. 多地区支持

IP 地理位置检测
地区访问控制（屏蔽欧洲）
地区感知数据库路由
地区感知支付方式
地区感知认证方式
9. 国际化

中英文支持
语言切换
本地化存储
10. 主题系统

6 种主题：Light, Dark, Monokai, Solarized Dark, Light Purple, Light Yellow
OKLch 色彩空间
CSS 变量主题系统
1.6 中间件架构
文件：middleware.ts

功能：

Supabase 会话管理

自动刷新用户会话
Cookie 管理
IP 地理位置检测

使用 ipapi.co API
支持调试模式（开发环境）
检测失败策略（fail-closed/fail-open）
地区访问控制

屏蔽欧洲 IP 访问
地区信息注入响应头
支持调试参数（?debug=cn/us/eu/in/sg）
静态资源优化

跳过 _next/ 和静态文件
1.7 API 路由架构
认证 API：

POST /api/auth/login - 登录
POST /api/auth/register - 注册
POST /api/auth/logout - 登出
GET/POST /api/auth/oauth/google - Google OAuth
GET/POST /api/auth/oauth/wechat - 微信 OAuth
消息 API：

GET /api/messages - 获取消息列表
POST /api/messages - 发送消息
POST /api/messages/upload - 上传文件
POST /api/messages/[messageId]/reactions - 添加表情反应
会话 API：

GET /api/conversations - 获取会话列表
POST /api/conversations - 创建会话
GET /api/conversations/[conversationId] - 获取会话详情
POST /api/conversations/fix-members - 修复会话成员
联系人 API：

GET/POST /api/contacts - 联系人管理
GET/POST /api/contact-requests - 好友请求
支付 API：

POST /api/payment/create - 创建支付
POST /api/payment/confirm - 确认支付
POST /api/payment/stripe/create-intent - Stripe 支付
POST /api/payment/paypal/create-order - PayPal 支付
POST /api/payment/wechat/create-order - 微信支付
POST /api/payment/alipay/create-order - 支付宝支付
其他 API：

POST /api/subscription - 订阅管理
GET /api/usage - 使用量查询
POST /api/agora/token - Agora Token 生成
1.8 配置文件说明
环境变量（.env.local）：


# 应用配置
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
NEXT_PUBLIC_DEFAULT_LANGUAGE=zh  # zh=国内版, en=国际版

# IP 地理检测
IP_API_URL=https://ipapi.co/json/
GEO_FAIL_CLOSED=false

# Supabase 配置（国际版）
NEXT_PUBLIC_SUPABASE_URL=https://kradpewmiizgughuxveg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# CloudBase 配置（国内版）
CLOUDBASE_ENV_ID=cloud1-3giwb8x723267ff3
CLOUDBASE_SECRET_ID=...
CLOUDBASE_SECRET_KEY=...

# Stripe 配置
STRIPE_SECRET_KEY=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...

# PayPal 配置
NEXT_PUBLIC_PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_MODE=sandbox

# Agora 配置
NEXT_PUBLIC_AGORA_APP_ID=...
AGORA_APP_CERTIFICATE=...
Next.js 配置（next.config.mjs）：

TypeScript 构建错误忽略
图片优化禁用
Standalone 输出模式（Docker 部署）
生产环境移除 console
请求体大小限制：500MB（支持大文件上传）
1.9 部署架构
开发环境：

运行命令：npm run dev
端口：3000
热重载支持
生产环境：

构建命令：npm run build
启动命令：npm start
Docker 支持（standalone 模式）
数据库部署：

Supabase：云托管 PostgreSQL
CloudBase：腾讯云托管 NoSQL
静态资源：

Next.js 自动优化
CDN 支持
2. 关键文件路径
需要引用的关键文件：

mvp33/package.json - 依赖配置
mvp33/config/index.ts - 应用配置
mvp33/middleware.ts - 中间件逻辑
mvp33/lib/database-router.ts - 数据库路由
mvp33/lib/types.ts - 类型定义
mvp33/scripts/001_create_schema.sql - 数据库 Schema
mvp33/next.config.mjs - Next.js 配置
