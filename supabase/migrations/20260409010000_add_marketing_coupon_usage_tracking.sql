ALTER TABLE IF EXISTS public.marketing_coupons
  ADD COLUMN IF NOT EXISTS max_uses INTEGER DEFAULT 1;

ALTER TABLE IF EXISTS public.marketing_coupons
  ADD COLUMN IF NOT EXISTS used_count INTEGER DEFAULT 0;

ALTER TABLE IF EXISTS public.marketing_coupons
  ADD COLUMN IF NOT EXISTS used_by_user_id TEXT;

ALTER TABLE IF EXISTS public.marketing_coupons
  ADD COLUMN IF NOT EXISTS used_order_no TEXT;

ALTER TABLE IF EXISTS public.marketing_coupons
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.marketing_coupons
  ALTER COLUMN max_uses SET DEFAULT 1;

ALTER TABLE IF EXISTS public.marketing_coupons
  ALTER COLUMN used_count SET DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'marketing_coupons'
  ) THEN
    UPDATE public.marketing_coupons
    SET
      max_uses = COALESCE(max_uses, 1),
      used_count = CASE
        WHEN COALESCE(used_count, 0) > 0 THEN COALESCE(used_count, 0)
        WHEN status = 'used' THEN 1
        ELSE 0
      END,
      used_at = CASE
        WHEN used_at IS NOT NULL THEN used_at
        WHEN status = 'used' THEN COALESCE(updated_at, created_at, NOW())
        ELSE used_at
      END;
  END IF;
END $$;
