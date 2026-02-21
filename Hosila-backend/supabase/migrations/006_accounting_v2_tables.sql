-- ============================================================================
-- HotelFlow Accounting v2 — charges, payment_allocations, journal_entries
-- These tables support the double-entry accounting system for all revenue,
-- payments, and financial reporting.
-- ============================================================================

-- ============================================================================
-- Charges (revenue recognition)
-- ============================================================================
CREATE TABLE IF NOT EXISTS charges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    guest_id UUID REFERENCES guests(id),
    booking_id UUID REFERENCES bookings(id),
    department TEXT NOT NULL CHECK (department IN ('accommodation', 'restaurant', 'other_services')),
    description TEXT NOT NULL,
    gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'partially_refunded')),
    reference_id TEXT,
    reference_type TEXT,
    charge_date TIMESTAMPTZ NOT NULL,
    cancelled_date TIMESTAMPTZ,
    refunded_amount NUMERIC(12,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Payment Allocations (links payments to specific charges)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    charge_id UUID NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
    allocated_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
    allocation_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Journal Entries (immutable double-entry audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    entry_date TIMESTAMPTZ NOT NULL,
    description TEXT NOT NULL,
    account_code TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    department TEXT CHECK (department IN ('accommodation', 'restaurant', 'other_services')),
    reference_type TEXT NOT NULL CHECK (reference_type IN ('charge', 'payment', 'refund', 'reversal', 'expense')),
    reference_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_charges_hotel ON charges(hotel_id);
CREATE INDEX IF NOT EXISTS idx_charges_hotel_dept ON charges(hotel_id, department);
CREATE INDEX IF NOT EXISTS idx_charges_hotel_date ON charges(hotel_id, charge_date);
CREATE INDEX IF NOT EXISTS idx_charges_booking ON charges(booking_id);
CREATE INDEX IF NOT EXISTS idx_charges_guest ON charges(guest_id);
CREATE INDEX IF NOT EXISTS idx_charges_status ON charges(hotel_id, status);

CREATE INDEX IF NOT EXISTS idx_payment_alloc_hotel ON payment_allocations(hotel_id);
CREATE INDEX IF NOT EXISTS idx_payment_alloc_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_alloc_charge ON payment_allocations(charge_id);

CREATE INDEX IF NOT EXISTS idx_journal_hotel ON journal_entries(hotel_id);
CREATE INDEX IF NOT EXISTS idx_journal_hotel_date ON journal_entries(hotel_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_hotel_account ON journal_entries(hotel_id, account_code);
CREATE INDEX IF NOT EXISTS idx_journal_ref ON journal_entries(reference_id, reference_type);

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies: tenant isolation via hotel_id
CREATE POLICY "Tenant isolation" ON charges
    FOR ALL USING (hotel_id IN (SELECT get_tenant_hotel_ids()));

CREATE POLICY "Tenant isolation" ON payment_allocations
    FOR ALL USING (hotel_id IN (SELECT get_tenant_hotel_ids()));

CREATE POLICY "Tenant isolation" ON journal_entries
    FOR ALL USING (hotel_id IN (SELECT get_tenant_hotel_ids()));
