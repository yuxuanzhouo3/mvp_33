CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.ai_project_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT NOT NULL CHECK (region IN ('CN', 'INTL')),
  language TEXT NOT NULL CHECK (language IN ('zh-CN', 'en-US')),
  repo_scope TEXT[] NOT NULL DEFAULT '{}',
  repo_digest TEXT NOT NULL,
  analysis_payload JSONB NOT NULL,
  summary_text TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_creative_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES public.ai_project_analyses(id) ON DELETE SET NULL,
  region TEXT NOT NULL CHECK (region IN ('CN', 'INTL')),
  language TEXT NOT NULL CHECK (language IN ('zh-CN', 'en-US')),
  audience TEXT NOT NULL,
  core_selling_points TEXT[] NOT NULL DEFAULT '{}',
  brand_tone TEXT NOT NULL,
  must_include TEXT[] NOT NULL DEFAULT '{}',
  must_avoid TEXT[] NOT NULL DEFAULT '{}',
  cta TEXT NOT NULL,
  poster_goal TEXT,
  style_preset TEXT,
  extra_notes TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES public.ai_project_analyses(id) ON DELETE SET NULL,
  brief_id UUID REFERENCES public.ai_creative_briefs(id) ON DELETE SET NULL,
  region TEXT NOT NULL CHECK (region IN ('CN', 'INTL')),
  language TEXT NOT NULL CHECK (language IN ('zh-CN', 'en-US')),
  job_type TEXT NOT NULL CHECK (job_type IN ('repo_analysis', 'poster', 'video')),
  provider TEXT NOT NULL,
  provider_model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'in_progress', 'completed', 'failed', 'blocked')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_payload JSONB,
  error_message TEXT,
  external_task_id TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.ai_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.ai_generation_jobs(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('analysis', 'image', 'video', 'script', 'subtitle', 'cover')),
  storage_provider TEXT NOT NULL CHECK (storage_provider IN ('cloudbase', 'supabase')),
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_project_analyses_region_language ON public.ai_project_analyses(region, language, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_creative_briefs_analysis ON public.ai_creative_briefs(analysis_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_status ON public.ai_generation_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_region_type ON public.ai_generation_jobs(region, job_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_assets_job_id ON public.ai_assets(job_id, created_at ASC);

ALTER TABLE public.ai_project_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_creative_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_assets ENABLE ROW LEVEL SECURITY;
