DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'original_amount'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN original_amount NUMERIC(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'coupon_id'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN coupon_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'callback_data'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN callback_data JSONB;
  END IF;
END $$;

UPDATE public.orders
SET original_amount = amount
WHERE original_amount IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_coupon_id ON public.orders(coupon_id);
