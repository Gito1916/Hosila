-- ============================================================================
-- HotelFlow v2 Core Schema
-- Mirrors Dexie.js tables for hybrid offline/cloud sync
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Tenancy: hotels table (one per tenant)
-- ============================================================================
CREATE TABLE hotels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID, -- Supabase auth user who owns this hotel
    name TEXT NOT NULL,
    logo_url TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Room Types
-- ============================================================================
CREATE TABLE room_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    base_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Rooms
-- ============================================================================
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    room_number TEXT NOT NULL,
    room_type TEXT NOT NULL,
    floor_number INTEGER,
    max_occupancy INTEGER NOT NULL DEFAULT 2,
    night_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
    short_rest_hourly_rate NUMERIC(12,2),
    short_rest_packages JSONB DEFAULT '[]',
    amenities JSONB DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'dirty', 'maintenance', 'short_rest')),
    housekeeping_status TEXT DEFAULT 'clean' CHECK (housekeeping_status IN ('clean', 'inspected', 'dirty', 'in_progress')),
    maintenance_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Guests
-- ============================================================================
CREATE TABLE guests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    gender TEXT CHECK (gender IN ('male', 'female', 'other')),
    id_type TEXT CHECK (id_type IN ('passport', 'national_id', 'drivers_license', 'voters_card', 'other')),
    id_number TEXT,
    address TEXT,
    occupation TEXT,
    reason_for_visit TEXT CHECK (reason_for_visit IN ('business', 'leisure', 'medical', 'family_event', 'transit', 'other')),
    vehicle_number TEXT,
    vehicle_model TEXT,
    preferences JSONB DEFAULT '{}',
    is_vip BOOLEAN DEFAULT FALSE,
    notes TEXT,
    lifetime_stays INTEGER DEFAULT 0,
    lifetime_spend NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Reservations
-- ============================================================================
CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    check_in_date TIMESTAMPTZ NOT NULL,
    check_out_date TIMESTAMPTZ NOT NULL,
    nights INTEGER NOT NULL DEFAULT 1,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    deposit_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('confirmed', 'pending', 'cancelled', 'checked_in', 'no_show')),
    source TEXT DEFAULT 'walk-in' CHECK (source IN ('walk-in', 'phone', 'booking.com', 'airbnb', 'direct')),
    notes TEXT,
    refund_status TEXT DEFAULT 'none' CHECK (refund_status IN ('none', 'full', 'partial')),
    refund_amount NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Bookings (active stays)
-- ============================================================================
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    reservation_id UUID REFERENCES reservations(id),
    guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    booking_type TEXT NOT NULL DEFAULT 'night' CHECK (booking_type IN ('night', 'short_rest')),
    check_in_time TIMESTAMPTZ NOT NULL,
    check_out_time TIMESTAMPTZ NOT NULL,
    planned_checkout TIMESTAMPTZ NOT NULL,
    actual_checkout TIMESTAMPTZ,
    num_guests INTEGER NOT NULL DEFAULT 1,
    rate NUMERIC(12,2) NOT NULL DEFAULT 0,
    duration_hours NUMERIC(5,2),
    total_charged NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
    balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'checked_out')),
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Services (restaurant menu items)
-- ============================================================================
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('food', 'beverage', 'laundry', 'transport', 'cleaning', 'room_service', 'other')),
    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    description TEXT,
    uses_inventory BOOLEAN DEFAULT FALSE,
    inventory_items JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Service Orders
-- ============================================================================
CREATE TABLE service_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'delivered', 'cancelled')),
    order_type TEXT CHECK (order_type IN ('room_service', 'dine_in', 'takeaway')),
    notes TEXT,
    order_number TEXT,
    ordered_at TIMESTAMPTZ NOT NULL,
    delivered_at TIMESTAMPTZ,
    created_by TEXT NOT NULL,
    created_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Payments
-- ============================================================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'pos')),
    payment_reference TEXT,
    notes TEXT,
    received_by TEXT NOT NULL,
    payment_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Inventory Items
-- ============================================================================
CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('food', 'housekeeping', 'maintenance', 'front_office', 'beverages', 'laundry', 'amenities')),
    behavior TEXT NOT NULL DEFAULT 'consumable' CHECK (behavior IN ('consumable', 'returnable')),
    is_amenity BOOLEAN DEFAULT FALSE,
    default_issue_qty INTEGER DEFAULT 0,
    unit_type TEXT NOT NULL DEFAULT 'pcs',
    current_stock INTEGER NOT NULL DEFAULT 0,
    min_stock_level INTEGER NOT NULL DEFAULT 0,
    unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    selling_price NUMERIC(12,2),
    supplier_name TEXT,
    supplier_contact TEXT,
    last_purchase_price NUMERIC(12,2),
    last_purchase_date TIMESTAMPTZ,
    reorder_quantity INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Inventory Movements
-- ============================================================================
CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('add', 'deduct')),
    quantity INTEGER NOT NULL,
    unit_cost NUMERIC(12,2),
    reason TEXT,
    department TEXT,
    supplier_name TEXT,
    receipt_url TEXT,
    source TEXT CHECK (source IN ('check_in', 'checkout', 'loss', 'restock', 'adjustment', 'service_order')),
    issued_amenity_id UUID,
    performed_by TEXT NOT NULL,
    balance_after INTEGER NOT NULL DEFAULT 0,
    movement_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Expenses
-- ============================================================================
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    date TIMESTAMPTZ NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    category TEXT NOT NULL CHECK (category IN ('utilities', 'maintenance', 'supplies', 'salaries', 'marketing', 'caution_refund', 'cancellation_refund', 'caution_deposit_refund', 'other')),
    vendor_name TEXT,
    description TEXT,
    receipt_url TEXT,
    payment_method TEXT CHECK (payment_method IN ('cash', 'transfer', 'pos')),
    recorded_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Users (hotel staff accounts)
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'reception', 'housekeeping', 'accountant', 'back_desk')),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Invoices
-- ============================================================================
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id),
    invoice_number TEXT NOT NULL,
    guest_name TEXT NOT NULL,
    guest_phone TEXT,
    items JSONB DEFAULT '[]',
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax NUMERIC(12,2) NOT NULL DEFAULT 0,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Receipts
-- ============================================================================
CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id),
    booking_id UUID REFERENCES bookings(id),
    receipt_number TEXT NOT NULL,
    payment_id UUID NOT NULL REFERENCES payments(id),
    guest_name TEXT NOT NULL,
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'pos')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Other Income
-- ============================================================================
CREATE TABLE other_income (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('venue_rental', 'swimming_pool', 'parking', 'laundry_external', 'caution_fee', 'other')),
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'pos')),
    customer_name TEXT,
    customer_phone TEXT,
    recorded_by TEXT NOT NULL,
    date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Issued Amenities
-- ============================================================================
CREATE TABLE issued_amenities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    quantity_issued INTEGER NOT NULL DEFAULT 0,
    quantity_returned INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'returned', 'lost', 'partial')),
    issued_by TEXT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    returned_at TIMESTAMPTZ,
    returned_by TEXT,
    loss_charge NUMERIC(12,2),
    notes TEXT,
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Transactions (Unified Financial Ledger)
-- ============================================================================
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    source TEXT NOT NULL CHECK (source IN ('accommodation', 'restaurant', 'other_income', 'expense')),
    department TEXT NOT NULL CHECK (department IN ('accommodation', 'restaurant', 'other')),
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'pos')),
    reference_id TEXT,
    reference_type TEXT CHECK (reference_type IN ('booking', 'service_order', 'expense', 'other_income')),
    is_taxable BOOLEAN DEFAULT FALSE,
    tax_rate NUMERIC(5,2),
    tax_amount NUMERIC(12,2),
    recorded_by TEXT NOT NULL,
    date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'reversed', 'reversal')),
    reversed_transaction_id UUID REFERENCES transactions(id),
    reversal_reason TEXT,
    synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Audit Logs
-- ============================================================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Sync Queue (for tracking offline changes)
-- ============================================================================
CREATE TABLE sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
    data JSONB DEFAULT '{}',
    synced BOOLEAN DEFAULT FALSE,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Integration tables (for Phase 3: Gmail parsing)
-- ============================================================================
CREATE TABLE integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('gmail', 'website', 'report_app')),
    status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
    credentials JSONB DEFAULT '{}', -- encrypted OAuth tokens
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    email_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    subject TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('parsed', 'failed', 'manual_review', 'pending')),
    parsed_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE room_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    source TEXT NOT NULL, -- 'booking.com', 'airbnb'
    external_name TEXT NOT NULL,
    internal_room_id UUID REFERENCES rooms(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes for performance
-- ============================================================================
CREATE INDEX idx_rooms_hotel ON rooms(hotel_id);
CREATE INDEX idx_rooms_status ON rooms(hotel_id, status);
CREATE INDEX idx_guests_hotel ON guests(hotel_id);
CREATE INDEX idx_guests_name ON guests(hotel_id, name);
CREATE INDEX idx_reservations_hotel ON reservations(hotel_id);
CREATE INDEX idx_reservations_dates ON reservations(hotel_id, check_in_date, check_out_date);
CREATE INDEX idx_reservations_status ON reservations(hotel_id, status);
CREATE INDEX idx_bookings_hotel ON bookings(hotel_id);
CREATE INDEX idx_bookings_status ON bookings(hotel_id, status);
CREATE INDEX idx_bookings_guest ON bookings(guest_id);
CREATE INDEX idx_bookings_room ON bookings(room_id);
CREATE INDEX idx_service_orders_booking ON service_orders(booking_id);
CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_expenses_hotel_date ON expenses(hotel_id, date);
CREATE INDEX idx_transactions_hotel_date ON transactions(hotel_id, date);
CREATE INDEX idx_transactions_type ON transactions(hotel_id, type);
CREATE INDEX idx_inventory_hotel ON inventory_items(hotel_id);
CREATE INDEX idx_inventory_movements_item ON inventory_movements(item_id);
CREATE INDEX idx_audit_logs_hotel ON audit_logs(hotel_id);
CREATE INDEX idx_sync_queue_hotel ON sync_queue(hotel_id, synced);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE other_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE issued_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_mappings ENABLE ROW LEVEL SECURITY;

-- RLS policies: tenants can only access their own hotel's data
-- Using hotels.tenant_id = auth.uid()
CREATE POLICY "Tenant isolation" ON hotels
    FOR ALL USING (tenant_id = auth.uid());

-- For all other tables, join to hotels to check tenant ownership
CREATE OR REPLACE FUNCTION get_tenant_hotel_ids()
RETURNS SETOF UUID AS $$
    SELECT id FROM public.hotels WHERE tenant_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE
   SET search_path = '';

-- Apply same policy pattern to all hotel-scoped tables
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'rooms', 'room_types', 'guests', 'reservations', 'bookings',
        'services', 'service_orders', 'payments', 'inventory_items',
        'inventory_movements', 'expenses', 'users', 'invoices',
        'receipts', 'other_income', 'issued_amenities', 'transactions',
        'audit_logs', 'sync_queue', 'integrations', 'email_logs', 'room_mappings'
    ])
    LOOP
        EXECUTE format(
            'CREATE POLICY "Tenant isolation" ON %I FOR ALL USING (hotel_id IN (SELECT get_tenant_hotel_ids()))',
            t
        );
    END LOOP;
END;
$$;

-- ============================================================================
-- Updated_at trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON hotels FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON guests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
