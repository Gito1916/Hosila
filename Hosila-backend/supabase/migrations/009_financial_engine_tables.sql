-- ============================================================================
-- Hosila Financial Engine Tables
-- Migration 009: Adds tax settings, tax transactions, remittance batches,
-- extends charges with tax breakdown columns, adds cost_price to services,
-- and scoped permissions to api_keys.
-- ============================================================================

-- ============================================================================
-- 1. Extend hotels table with tax registration info
-- ============================================================================
ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS vat_number TEXT,
  ADD COLUMN IF NOT EXISTS tdl_registration_number TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'cross_river';

-- ============================================================================
-- 2. Tax Settings (per-tenant, per-department tax rates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (department IN (
    'accommodation', 'restaurant', 'other_services', 'all'
  )),
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 7.5,
  tdl_rate NUMERIC(5,2) NOT NULL DEFAULT 5.0,
  service_charge_rate NUMERIC(5,2) NOT NULL DEFAULT 10.0,
  service_charge_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  vat_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  tdl_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  vat_calculation_base TEXT NOT NULL DEFAULT 'base_only'
    CHECK (vat_calculation_base IN ('base_only', 'base_plus_sc')),
  tdl_calculation_base TEXT NOT NULL DEFAULT 'base_only'
    CHECK (tdl_calculation_base IN ('base_only', 'base_plus_sc')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, department)
);

-- ============================================================================
-- 3. Tax Transactions (immutable record for remittance tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  charge_id UUID REFERENCES charges(id),
  invoice_id UUID REFERENCES invoices(id),
  tax_type TEXT NOT NULL CHECK (tax_type IN ('vat', 'tdl', 'service_charge')),
  taxable_amount NUMERIC(12,2) NOT NULL,
  tax_rate NUMERIC(5,2) NOT NULL,
  tax_amount NUMERIC(12,2) NOT NULL,
  department TEXT NOT NULL CHECK (department IN (
    'accommodation', 'restaurant', 'other_services'
  )),
  remitted BOOLEAN NOT NULL DEFAULT FALSE,
  remittance_batch_id UUID,
  remittance_date TIMESTAMPTZ,
  transaction_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. Remittance Batches (groups of tax transactions marked as remitted)
-- ============================================================================
CREATE TABLE IF NOT EXISTS remittance_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  tax_type TEXT NOT NULL CHECK (tax_type IN ('vat', 'tdl')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'remitted')),
  remitted_by TEXT,
  remitted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. Idempotency Keys (prevent duplicate financial operations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  response_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, key)
);

-- ============================================================================
-- 6. Extend charges table with tax breakdown columns
-- ============================================================================
ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS base_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount_v2 NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tdl_amount NUMERIC(12,2) DEFAULT 0;

-- ============================================================================
-- 7. Add cost_price to services (menu items) for margin analysis
-- ============================================================================
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT 0;

-- ============================================================================
-- 8. Add scoped permissions to api_keys
-- ============================================================================
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS scopes TEXT[] DEFAULT '{read:availability}',
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER DEFAULT 60;

-- ============================================================================
-- 9. Row Level Security on new tables
-- ============================================================================
ALTER TABLE tax_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE remittance_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON tax_settings
  FOR ALL USING (hotel_id IN (SELECT get_tenant_hotel_ids()));
CREATE POLICY "Tenant isolation" ON tax_transactions
  FOR ALL USING (hotel_id IN (SELECT get_tenant_hotel_ids()));
CREATE POLICY "Tenant isolation" ON remittance_batches
  FOR ALL USING (hotel_id IN (SELECT get_tenant_hotel_ids()));
CREATE POLICY "Tenant isolation" ON idempotency_keys
  FOR ALL USING (hotel_id IN (SELECT get_tenant_hotel_ids()));

-- ============================================================================
-- 10. Indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_tax_settings_hotel ON tax_settings(hotel_id);
CREATE INDEX IF NOT EXISTS idx_tax_settings_hotel_dept ON tax_settings(hotel_id, department);
CREATE INDEX IF NOT EXISTS idx_tax_tx_hotel ON tax_transactions(hotel_id);
CREATE INDEX IF NOT EXISTS idx_tax_tx_hotel_date ON tax_transactions(hotel_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_tax_tx_hotel_type ON tax_transactions(hotel_id, tax_type);
CREATE INDEX IF NOT EXISTS idx_tax_tx_remitted ON tax_transactions(hotel_id, remitted);
CREATE INDEX IF NOT EXISTS idx_tax_tx_dept ON tax_transactions(hotel_id, department);
CREATE INDEX IF NOT EXISTS idx_remittance_hotel ON remittance_batches(hotel_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_hotel_key ON idempotency_keys(hotel_id, key);

-- ============================================================================
-- 11. Updated_at trigger for tax_settings
-- ============================================================================
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tax_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
