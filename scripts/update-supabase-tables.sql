-- ============================================
-- Supabase 数据库更新脚本（基于实际数据库结构）
-- ============================================
-- 使用方法：
-- 1. 登录 Supabase 控制台
-- 2. 进入 SQL Editor
-- 3. 复制并执行此脚本
-- ============================================

-- ============================================
-- 1. 更新 orders 表（添加缺失的列）
-- ============================================
DO $$
BEGIN
    -- 添加 type 列（订单类型）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='type') THEN
        ALTER TABLE public.orders ADD COLUMN type TEXT;
    END IF;

    -- 添加 product_id 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='product_id') THEN
        ALTER TABLE public.orders ADD COLUMN product_id TEXT;
    END IF;

    -- 添加 metadata 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='metadata') THEN
        ALTER TABLE public.orders ADD COLUMN metadata JSONB;
    END IF;

    -- 添加 completed_at 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='completed_at') THEN
        ALTER TABLE public.orders ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;
END $$;

-- ============================================
-- 2. 更新 admins 表（添加缺失的列）
-- ============================================
DO $$
BEGIN
    -- 添加 role 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admins' AND column_name='role') THEN
        ALTER TABLE public.admins ADD COLUMN role TEXT DEFAULT 'admin';
    END IF;

    -- 添加 status 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admins' AND column_name='status') THEN
        ALTER TABLE public.admins ADD COLUMN status TEXT DEFAULT 'active';
    END IF;

    -- 添加 last_login_at 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admins' AND column_name='last_login_at') THEN
        ALTER TABLE public.admins ADD COLUMN last_login_at TIMESTAMPTZ;
    END IF;

    -- 添加 created_by 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admins' AND column_name='created_by') THEN
        ALTER TABLE public.admins ADD COLUMN created_by UUID;
    END IF;
END $$;

-- ============================================
-- 3. 更新 users 表（添加缺失的列）
-- ============================================
DO $$
BEGIN
    -- 添加 tokens_remaining 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='tokens_remaining') THEN
        ALTER TABLE public.users ADD COLUMN tokens_remaining INTEGER DEFAULT 0;
    END IF;

    -- 添加 tokens_used 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='tokens_used') THEN
        ALTER TABLE public.users ADD COLUMN tokens_used INTEGER DEFAULT 0;
    END IF;

    -- 添加 last_login_at 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_login_at') THEN
        ALTER TABLE public.users ADD COLUMN last_login_at TIMESTAMPTZ;
    END IF;

    -- 添加 subscription_plan 列（兼容字段）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='subscription_plan') THEN
        ALTER TABLE public.users ADD COLUMN subscription_plan TEXT;
    END IF;

    -- 添加 subscription_status 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='subscription_status') THEN
        ALTER TABLE public.users ADD COLUMN subscription_status TEXT DEFAULT 'active';
    END IF;
END $$;

-- ============================================
-- 4. 创建 payments 表（支付记录表）
-- ============================================
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    order_id TEXT UNIQUE,
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    payment_method TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    product_id TEXT,
    metadata JSONB,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. 创建 system_logs 表（系统日志表）
-- ============================================
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

-- ============================================
-- 6. 创建 system_config 表（系统配置表）
-- ============================================
CREATE TABLE IF NOT EXISTS public.system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    category TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. 创建 assessments 表（评估表）
-- ============================================
CREATE TABLE IF NOT EXISTS public.assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 8. 创建 advertisements 表（广告表）
-- ============================================
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

-- ============================================
-- 9. 创建 social_links 表（社交链接表）
-- ============================================
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

-- ============================================
-- 10. 创建 releases 表（版本发布表）
-- ============================================
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
-- 11. 创建 profiles 表（用户配置表，兼容字段）
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
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

-- ============================================
-- 12. 创建索引（如果不存在）
-- ============================================

-- payments 表索引
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_payment_method ON public.payments(payment_method);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at);

-- orders 表新增索引
CREATE INDEX IF NOT EXISTS idx_orders_type ON public.orders(type);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON public.orders(product_id);

-- admins 表索引
CREATE INDEX IF NOT EXISTS idx_admins_username ON public.admins(username);
CREATE INDEX IF NOT EXISTS idx_admins_status ON public.admins(status);

-- system_logs 表索引
CREATE INDEX IF NOT EXISTS idx_system_logs_admin_id ON public.system_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_action ON public.system_logs(action);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at);

-- system_config 表索引
CREATE INDEX IF NOT EXISTS idx_system_config_key ON public.system_config(key);
CREATE INDEX IF NOT EXISTS idx_system_config_category ON public.system_config(category);

-- users 表新增索引
CREATE INDEX IF NOT EXISTS idx_users_subscription_plan ON public.users(subscription_plan);
CREATE INDEX IF NOT EXISTS idx_users_tokens_remaining ON public.users(tokens_remaining);

-- profiles 表索引
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_plan ON public.profiles(subscription_plan);

-- ============================================
-- 13. 启用行级安全策略（RLS）
-- ============================================

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 14. 删除旧策略（如果存在）
-- ============================================

DROP POLICY IF EXISTS "允许服务角色完全访问 payments" ON public.payments;
DROP POLICY IF EXISTS "允许服务角色完全访问 system_logs" ON public.system_logs;
DROP POLICY IF EXISTS "允许服务角色完全访问 system_config" ON public.system_config;
DROP POLICY IF EXISTS "允许服务角色完全访问 assessments" ON public.assessments;
DROP POLICY IF EXISTS "允许服务角色完全访问 advertisements" ON public.advertisements;
DROP POLICY IF EXISTS "允许服务角色完全访问 social_links" ON public.social_links;
DROP POLICY IF EXISTS "允许服务角色完全访问 releases" ON public.releases;
DROP POLICY IF EXISTS "允许服务角色完全访问 profiles" ON public.profiles;

-- ============================================
-- 15. 创建 RLS 策略（允许服务角色完全访问）
-- ============================================

CREATE POLICY "允许服务角色完全访问 payments" ON public.payments
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "允许服务角色完全访问 system_logs" ON public.system_logs
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "允许服务角色完全访问 system_config" ON public.system_config
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "允许服务角色完全访问 assessments" ON public.assessments
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "允许服务角色完全访问 advertisements" ON public.advertisements
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "允许服务角色完全访问 social_links" ON public.social_links
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "允许服务角色完全访问 releases" ON public.releases
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "允许服务角色完全访问 profiles" ON public.profiles
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 完成
-- ============================================
-- 所有表创建/更新完成！
-- 现在你可以刷新浏览器页面，管理后台应该能正常显示数据了。
