
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS voided_reason text,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_payment_method_check') THEN
    ALTER TABLE expenses ADD CONSTRAINT expenses_payment_method_check CHECK (payment_method IN ('cash', 'transfer', 'pos'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_status_check') THEN
    ALTER TABLE expenses ADD CONSTRAINT expenses_status_check CHECK (status IN ('active', 'voided'));
  END IF;
END $$;
