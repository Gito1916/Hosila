-- service_orders.booking_id stores 'walk-in' for walk-in orders, needs to be text
ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_booking_id_fkey;
ALTER TABLE service_orders ALTER COLUMN booking_id TYPE text USING booking_id::text;
