-- Market referral backend schema (INTL / Supabase)
-- Idempotent DDL, safe to run multiple times.

create extension if not exists pgcrypto;

alter table if exists public.users
  add column if not exists referral_code text;

alter table if exists public.users
  add column if not exists referred_by uuid references public.users (id) on delete set null;

alter table if exists public.users
  add column if not exists referred_at timestamptz;

alter table if exists public.users
  add column if not exists credits integer not null default 0;

create unique index if not exists idx_users_referral_code_unique
  on public.users (referral_code)
  where referral_code is not null;

create index if not exists idx_users_referred_by
  on public.users (referred_by);

create table if not exists public.referral_links (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references public.users (id) on delete cascade,
  tool_slug text not null,
  share_code text not null unique,
  source_default text,
  is_active boolean not null default true,
  click_count bigint not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists idx_referral_links_creator_created
  on public.referral_links (creator_user_id, created_at desc);

create index if not exists idx_referral_links_share_active
  on public.referral_links (share_code, is_active);

create table if not exists public.referral_clicks (
  id uuid primary key default gen_random_uuid(),
  share_code text not null,
  source text,
  ip_hash text,
  user_agent_hash text,
  landing_path text,
  created_at timestamptz not null default now(),
  registered_user_id uuid references public.users (id) on delete set null
);

create index if not exists idx_referral_clicks_share_created
  on public.referral_clicks (share_code, created_at desc);

create index if not exists idx_referral_clicks_created
  on public.referral_clicks (created_at desc);

create index if not exists idx_referral_clicks_registered_user
  on public.referral_clicks (registered_user_id);

create table if not exists public.referral_relations (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references public.users (id) on delete cascade,
  invited_user_id uuid not null references public.users (id) on delete cascade,
  share_code text not null,
  tool_slug text,
  first_tool_id text,
  status text not null default 'bound',
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

alter table public.referral_relations
  add column if not exists first_tool_id text;

alter table public.referral_relations
  add column if not exists activated_at timestamptz;

create unique index if not exists idx_referral_relations_invited_unique
  on public.referral_relations (invited_user_id);

create unique index if not exists idx_referral_relations_pair_unique
  on public.referral_relations (inviter_user_id, invited_user_id);

create index if not exists idx_referral_relations_inviter_created
  on public.referral_relations (inviter_user_id, created_at desc);

create index if not exists idx_referral_relations_activated
  on public.referral_relations (activated_at desc);

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  relation_id uuid references public.referral_relations (id) on delete set null,
  user_id uuid not null references public.users (id) on delete cascade,
  reward_type text not null,
  amount integer not null check (amount > 0),
  status text not null default 'granted',
  reference_id text not null unique,
  created_at timestamptz not null default now(),
  granted_at timestamptz
);

create index if not exists idx_referral_rewards_user_created
  on public.referral_rewards (user_id, created_at desc);

create index if not exists idx_referral_rewards_relation
  on public.referral_rewards (relation_id);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null,
  amount integer not null,
  description text,
  reference_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_credit_transactions_reference_unique
  on public.credit_transactions (reference_id)
  where reference_id is not null;

create index if not exists idx_credit_transactions_user_created
  on public.credit_transactions (user_id, created_at desc);

