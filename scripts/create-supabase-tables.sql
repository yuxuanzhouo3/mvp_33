-- ============================================
-- Supabase 数据库表创建脚本
-- ============================================
-- 使用方法：
-- 1. 登录 Supabase 控制台
-- 2. 进入 SQL Editor
-- 3. 复制并执行此脚本
-- ============================================

-- 创建 users 表（用户表）
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    username TEXT,
    avatar_url TEXT,
    subscription_plan TEXT DEFAULT 'free',
    subscription_status TEXT DEFAULT 'active',
    subscription_expires_at TIMESTAMPTZ,
    tokens_remaining INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    last_login_at TIMESTAMPTZ,
    region TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建 profiles 表（用户配置表，与 users 表关联）
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    username TEXT,
    avatar_url TEXT,
    subscription_plan TEXT DEFAULT 'free',
    subscription_status TEXT DEFAULT 'active',
    subscription_expires_at TIMESTAMPTZ,
    tokens_remaining INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    last_login_at TIMESTAMPTZ,
    region TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建 orders 表（支付订单表）
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    order_id TEXT UNIQUE,
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    method TEXT NOT NULL, -- stripe, paypal, wechat, alipay
    type TEXT NOT NULL, -- subscription, tokens, pro
    status TEXT DEFAULT 'pending', -- pending, completed, failed, refunded
    product_id TEXT,
    metadata JSONB,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建 payments 表（支付记录表，与 orders 表结构相同）
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    order_id TEXT UNIQUE,
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    method TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    product_id TEXT,
    metadata JSONB,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建 admin_users 表（管理员表）
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin', -- admin, super_admin
    status TEXT DEFAULT 'active', -- active, inactive
    last_login_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建 system_logs 表（系统日志表）
CREATE TABLE IF NOT EXISTS public.system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建 system_config 表（系统配置表）
CREATE TABLE IF NOT EXISTS public.system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    category TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建 assessments 表（评估表）
CREATE TABLE IF NOT EXISTS public.assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建 advertisements 表（广告表）
CREATE TABLE IF NOT EXISTS public.advertisements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT,
    image_url TEXT,
    link_url TEXT,
    position TEXT,
    status TEXT DEFAULT 'active',
    priority INTEGER DEFAULT 0,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建 social_links 表（社交链接表）
CREATE TABLE IF NOT EXISTS public.social_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL,
    url TEXT NOT NULL,
    icon TEXT,
    display_order INTEGER DEFAULT 0,
    is_visible BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建 releases 表（版本发布表）
CREATE TABLE IF NOT EXISTS public.releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    release_notes TEXT,
    release_date TIMESTAMPTZ,
    is_published BOOLEAN DEFAULT false,
    download_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 创建索引以提高查询性能
-- ============================================

-- users 表索引
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_subscription_plan ON public.users(subscription_plan);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at);

-- profiles 表索引
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_plan ON public.profiles(subscription_plan);

-- orders 表索引
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_method ON public.orders(method);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);

-- payments 表索引
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_method ON public.payments(method);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at);

-- admin_users 表索引
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON public.admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_status ON public.admin_users(status);

-- system_logs 表索引
CREATE INDEX IF NOT EXISTS idx_system_logs_admin_id ON public.system_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_action ON public.system_logs(action);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at);

-- system_config 表索引
CREATE INDEX IF NOT EXISTS idx_system_config_key ON public.system_config(key);
CREATE INDEX IF NOT EXISTS idx_system_config_category ON public.system_config(category);

-- ============================================
-- 启用行级安全策略（RLS）
-- ============================================

-- 为所有表启用 RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 创建 RLS 策略（允许服务角色完全访问）
-- ============================================

-- users 表策略
CREATE POLICY "允许服务角色完全访问 users" ON public.users
    FOR ALL USING (true) WITH CHECK (true);

-- profiles 表策略
CREATE POLICY "允许服务角色完全访问 profiles" ON public.profiles
    FOR ALL USING (true) WITH CHECK (true);

-- orders 表策略
CREATE POLICY "允许服务角色完全访问 orders" ON public.orders
    FOR ALL USING (true) WITH CHECK (true);

-- payments 表策略
CREATE POLICY "允许服务角色完全访问 payments" ON public.payments
    FOR ALL USING (true) WITH CHECK (true);

-- admin_users 表策略
CREATE POLICY "允许服务角色完全访问 admin_users" ON public.admin_users
    FOR ALL USING (true) WITH CHECK (true);

-- system_logs 表策略
CREATE POLICY "允许服务角色完全访问 system_logs" ON public.system_logs
    FOR ALL USING (true) WITH CHECK (true);

-- system_config 表策略
CREATE POLICY "允许服务角色完全访问 system_config" ON public.system_config
    FOR ALL USING (true) WITH CHECK (true);

-- assessments 表策略
CREATE POLICY "允许服务角色完全访问 assessments" ON public.assessments
    FOR ALL USING (true) WITH CHECK (true);

-- advertisements 表策略
CREATE POLICY "允许服务角色完全访问 advertisements" ON public.advertisements
    FOR ALL USING (true) WITH CHECK (true);

-- social_links 表策略
CREATE POLICY "允许服务角色完全访问 social_links" ON public.social_links
    FOR ALL USING (true) WITH CHECK (true);

-- releases 表策略
CREATE POLICY "允许服务角色完全访问 releases" ON public.releases
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 完成
-- ============================================
-- 所有表创建完成！
-- 现在你可以刷新浏览器页面，管理后台应该能正常显示数据了。
