ALTER TABLE IF EXISTS public.coupons
  ADD COLUMN IF NOT EXISTS issued_to_user_id TEXT,
  ADD COLUMN IF NOT EXISTS used_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS issued_by_admin_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc', now());

UPDATE public.coupons
SET
  issued_to_user_id = COALESCE(issued_to_user_id, user_id),
  used_by_user_id = CASE
    WHEN status = 'used' THEN COALESCE(used_by_user_id, issued_to_user_id, user_id)
    ELSE used_by_user_id
  END,
  updated_at = COALESCE(updated_at, created_at, timezone('utc', now()))
WHERE
  issued_to_user_id IS NULL
  OR updated_at IS NULL
  OR (status = 'used' AND used_by_user_id IS NULL);

ALTER TABLE IF EXISTS public.coupons
  ALTER COLUMN updated_at SET DEFAULT timezone('utc', now());

UPDATE public.coupons
SET updated_at = timezone('utc', now())
WHERE updated_at IS NULL;

ALTER TABLE IF EXISTS public.coupons
  ALTER COLUMN updated_at SET NOT NULL;

DROP INDEX IF EXISTS idx_coupons_issued_to_user_id;
CREATE INDEX idx_coupons_issued_to_user_id ON public.coupons (issued_to_user_id);

DROP INDEX IF EXISTS idx_coupons_used_by_user_id;
CREATE INDEX idx_coupons_used_by_user_id ON public.coupons (used_by_user_id);

DROP INDEX IF EXISTS idx_coupons_status_created_at;
CREATE INDEX idx_coupons_status_created_at ON public.coupons (status, created_at DESC);

ALTER TABLE IF EXISTS public.coupons
  DROP CONSTRAINT IF EXISTS coupons_used_tracking_check;

ALTER TABLE IF EXISTS public.coupons
  ADD CONSTRAINT coupons_used_tracking_check
  CHECK (
    status <> 'used'
    OR (used_at IS NOT NULL AND used_by_user_id IS NOT NULL)
  );
