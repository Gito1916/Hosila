-- Drop the FK constraint that prevents text service_ids (inventory items use 'inv_<uuid>' format)
ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_service_id_fkey;

-- Change service_id from uuid to text to support inventory item IDs
ALTER TABLE service_orders ALTER COLUMN service_id TYPE text USING service_id::text;
