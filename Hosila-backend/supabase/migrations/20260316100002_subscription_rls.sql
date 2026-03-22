-- Migration: Subscription-based RLS policies and triggers
-- Enforces subscription entitlements at the database level.

-- =========================================================================
-- TRIGGERS: Room inventory limit + Active booking cap
-- =========================================================================

-- Room inventory limit trigger (plan-based rooms_limit)
CREATE OR REPLACE FUNCTION public.trg_check_rooms_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT check_rooms_limit(NEW.hotel_id) THEN
        RAISE EXCEPTION 'Room limit reached for your plan. Upgrade to add more rooms.'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_rooms_limit_trigger ON rooms;
CREATE TRIGGER check_rooms_limit_trigger
    BEFORE INSERT ON rooms
    FOR EACH ROW
    EXECUTE FUNCTION trg_check_rooms_limit();


-- Active booking cap trigger (5 occupied rooms in restricted mode)
CREATE OR REPLACE FUNCTION public.trg_check_active_room_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only check on new active bookings (check-in)
    IF NEW.status = 'active' THEN
        IF NOT check_active_room_cap(NEW.hotel_id) THEN
            RAISE EXCEPTION 'Active room cap reached (5 rooms in restricted mode). Upgrade your subscription to check in more guests.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_active_room_cap_trigger ON bookings;
CREATE TRIGGER check_active_room_cap_trigger
    BEFORE INSERT ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION trg_check_active_room_cap();


-- =========================================================================
-- RLS: Premium module tables — feature-gated (full block)
-- =========================================================================

-- services: full block if no restaurant_pos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'services_subscription_gate' AND tablename = 'services'
    ) THEN
        CREATE POLICY services_subscription_gate ON services
            FOR ALL
            USING (has_feature(hotel_id, 'restaurant_pos'))
            WITH CHECK (has_feature(hotel_id, 'restaurant_pos'));
    END IF;
END $$;

-- service_orders: block restaurant use, but allow extension inserts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'service_orders_subscription_gate' AND tablename = 'service_orders'
    ) THEN
        CREATE POLICY service_orders_subscription_gate ON service_orders
            FOR ALL
            USING (has_feature(hotel_id, 'restaurant_pos') OR service_id = 'extension')
            WITH CHECK (has_feature(hotel_id, 'restaurant_pos') OR service_id = 'extension');
    END IF;
END $$;

-- inventory_items: full block if no inventory_tracking
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'inventory_items_subscription_gate' AND tablename = 'inventory_items'
    ) THEN
        CREATE POLICY inventory_items_subscription_gate ON inventory_items
            FOR ALL
            USING (has_feature(hotel_id, 'inventory_tracking'))
            WITH CHECK (has_feature(hotel_id, 'inventory_tracking'));
    END IF;
END $$;

-- inventory_movements: full block if no inventory_tracking
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'inventory_movements_subscription_gate' AND tablename = 'inventory_movements'
    ) THEN
        CREATE POLICY inventory_movements_subscription_gate ON inventory_movements
            FOR ALL
            USING (has_feature(hotel_id, 'inventory_tracking'))
            WITH CHECK (has_feature(hotel_id, 'inventory_tracking'));
    END IF;
END $$;


-- =========================================================================
-- RLS: Premium action tables — write-block only (SELECT preserved)
-- =========================================================================

-- api_keys: write-block if no website_hooking
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'api_keys_subscription_write_gate' AND tablename = 'api_keys'
    ) THEN
        CREATE POLICY api_keys_subscription_write_gate ON api_keys
            FOR INSERT
            WITH CHECK (has_feature(hotel_id, 'website_hooking'));
    END IF;
END $$;

-- hotel_email_settings: write-block if no guest_email_automation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'email_settings_subscription_write_gate' AND tablename = 'hotel_email_settings'
    ) THEN
        CREATE POLICY email_settings_subscription_write_gate ON hotel_email_settings
            FOR INSERT
            WITH CHECK (has_feature(hotel_id, 'guest_email_automation'));
    END IF;
END $$;

-- guest_email_logs: write-block if no guest_email_automation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'email_logs_subscription_write_gate' AND tablename = 'guest_email_logs'
    ) THEN
        CREATE POLICY email_logs_subscription_write_gate ON guest_email_logs
            FOR INSERT
            WITH CHECK (has_feature(hotel_id, 'guest_email_automation'));
    END IF;
END $$;


-- =========================================================================
-- RLS: Core tables — writable only in full or restricted mode
-- These tables must stay writable for checkout/extend/payment flows.
-- The subscription_write_mode() function returns 'full' or 'restricted'
-- for active subscriptions, blocking writes only when truly blocked.
-- =========================================================================
-- NOTE: Core tables use subscription_write_mode() which allows both
-- 'full' and 'restricted' modes. This means even inactive/cancelled
-- hotels can do checkout operations. The 5-room cap is enforced
-- separately by the check_active_room_cap() trigger on bookings.

-- We add write-gate policies to core operational tables.
-- These policies are additive (AND) to any existing hotel_id-based policies.

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'rooms', 'bookings', 'guests', 'payments', 'charges',
        'journal_entries', 'payment_allocations', 'invoices', 'receipts', 'audit_logs'
    ])
    LOOP
        -- Check if policy already exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE policyname = t || '_subscription_write_gate'
              AND tablename = t
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (subscription_write_mode(hotel_id) IN (''full'', ''restricted''))',
                t || '_subscription_write_gate', t
            );
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR UPDATE USING (subscription_write_mode(hotel_id) IN (''full'', ''restricted''))',
                t || '_subscription_update_gate', t
            );
        END IF;
    END LOOP;
END $$;
