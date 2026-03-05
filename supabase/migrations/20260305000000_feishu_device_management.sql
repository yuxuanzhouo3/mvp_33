-- Feishu-style device management upgrade:
-- 1) add fingerprint/model/brand/client/category fields
-- 2) backfill fingerprint + normalize legacy records
-- 3) deduplicate same (user_id, device_fingerprint)
-- 4) add unique/indexes for stable query + upsert behavior

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS device_model text,
  ADD COLUMN IF NOT EXISTS device_brand text,
  ADD COLUMN IF NOT EXISTS client_type text,
  ADD COLUMN IF NOT EXISTS device_category text;

UPDATE public.user_devices
SET device_category = CASE
  WHEN device_type IN ('ios', 'android') THEN 'mobile'
  ELSE 'desktop'
END
WHERE device_category IS NULL OR btrim(device_category) = '';

UPDATE public.user_devices
SET client_type = CASE
  WHEN device_type = 'ios' THEN 'ios_app'
  WHEN device_type = 'android' THEN 'android_app'
  ELSE 'web'
END
WHERE client_type IS NULL OR btrim(client_type) = '';

UPDATE public.user_devices
SET device_fingerprint = concat(
  'fp_',
  encode(
    digest(
      concat_ws(
        '|',
        coalesce(device_type, ''),
        coalesce(device_category, ''),
        coalesce(client_type, ''),
        coalesce(device_brand, ''),
        coalesce(device_model, ''),
        coalesce(browser, ''),
        coalesce(os, ''),
        coalesce(device_name, '')
      ),
      'sha256'
    ),
    'hex'
  )
)
WHERE device_fingerprint IS NULL OR btrim(device_fingerprint) = '';

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, device_fingerprint
      ORDER BY last_active_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.user_devices
)
DELETE FROM public.user_devices ud
USING ranked r
WHERE ud.id = r.id
  AND r.rn > 1;

ALTER TABLE public.user_devices
  ALTER COLUMN device_fingerprint SET NOT NULL,
  ALTER COLUMN client_type SET DEFAULT 'web',
  ALTER COLUMN device_category SET DEFAULT 'desktop';

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_devices_user_fingerprint_unique
  ON public.user_devices (user_id, device_fingerprint);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_last_active_desc
  ON public.user_devices (user_id, last_active_at DESC);
