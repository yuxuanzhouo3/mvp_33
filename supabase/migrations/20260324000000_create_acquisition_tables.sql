-- Acquisition domain tables for the /market/acquisition subsystem
-- Shared schema semantics for CN/INTL. Current migration applies to the INTL Supabase stack.

-- ==========================================
-- 1. 博主联盟 (Bloggers / KOL)
-- ==========================================
CREATE TABLE IF NOT EXISTS acquisition_bloggers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT '',
  followers TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '未联系',
  commission TEXT NOT NULL DEFAULT '',
  cost TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 2. 企业采购线索 (B2B Leads)
-- ==========================================
CREATE TABLE IF NOT EXISTS acquisition_b2b_leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '手工录入',
  status TEXT NOT NULL DEFAULT '初步接触',
  est_value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 3. 金融 VC 投资机构线索
-- ==========================================
CREATE TABLE IF NOT EXISTS acquisition_vc_leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '手工录入',
  status TEXT NOT NULL DEFAULT '待联系',
  focus TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 4. Ad-to-Earn 广告资源
-- ==========================================
CREATE TABLE IF NOT EXISTS acquisition_ads (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '视频广告',
  duration TEXT NOT NULL DEFAULT '30s',
  reward TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '待审核',
  views TEXT NOT NULL DEFAULT '0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- Indexes
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_acquisition_bloggers_status ON acquisition_bloggers(status);
CREATE INDEX IF NOT EXISTS idx_acquisition_b2b_leads_status ON acquisition_b2b_leads(status);
CREATE INDEX IF NOT EXISTS idx_acquisition_vc_leads_status ON acquisition_vc_leads(status);
CREATE INDEX IF NOT EXISTS idx_acquisition_ads_status ON acquisition_ads(status);

-- ==========================================
-- Seed data from design mockups
-- ==========================================

-- Bloggers
INSERT INTO acquisition_bloggers (id, name, platform, followers, email, status, commission, cost) VALUES
  ('bl-001', '科技评测_老马', 'B站', '185k', 'laoma@163.com', '已签约', '30%', '¥200/视频'),
  ('bl-002', '设计日常', '小红书', '42k', 'hello@qq.com', '谈判中', '25%', '¥100/图文'),
  ('bl-003', 'AI工具猎手', '抖音', '120k', 'hunter@126.com', '已发邮件', '20%', '未知')
ON CONFLICT (id) DO NOTHING;

-- B2B Leads
INSERT INTO acquisition_b2b_leads (id, name, region, contact, source, status, est_value) VALUES
  ('b2b-001', '北京某SaaS企业', '北京', '张总 (VP)', 'BD引荐', '合同拟定', '¥50,000'),
  ('b2b-002', '杭州某电商团队', '浙江', '王采购', '官网注册', '已转化', '¥12,000')
ON CONFLICT (id) DO NOTHING;

-- VC Leads
INSERT INTO acquisition_vc_leads (id, name, region, contact, source, status, focus) VALUES
  ('vc-001', '红杉中国', '北京', 'Li Wei (合伙人)', 'BD引荐', '初步接触', 'AI / SaaS'),
  ('vc-002', '经纬创投', '上海', 'David', '手工录入', '待联系', '前沿科技 / AI')
ON CONFLICT (id) DO NOTHING;

-- Ads
INSERT INTO acquisition_ads (id, brand, type, duration, reward, status, views) VALUES
  ('ad-001', 'KFC (肯德基)', '视频广告', '30s', '1 RMB', '投放中', '12,450'),
  ('ad-002', '某国内云服务', '互动广告', '30s', '0.8 RMB', '投放中', '8,320')
ON CONFLICT (id) DO NOTHING;
