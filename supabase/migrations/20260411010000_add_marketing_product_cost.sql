ALTER TABLE IF EXISTS public.marketing_invitation_codes
  ADD COLUMN IF NOT EXISTS product_cost NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.marketing_coupons
  ADD COLUMN IF NOT EXISTS product_cost NUMERIC(10, 2) NOT NULL DEFAULT 0;
