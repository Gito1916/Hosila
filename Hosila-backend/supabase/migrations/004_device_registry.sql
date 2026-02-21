-- Device registry for tracking connected devices per hotel
-- Devices send a heartbeat on each sync to register/update their presence

CREATE TABLE IF NOT EXISTS device_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL DEFAULT 'Unknown Device',
    user_agent TEXT,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(hotel_id, device_id)
);

-- RLS policies
ALTER TABLE device_registry ENABLE ROW LEVEL SECURITY;

-- Hotels can only see their own devices
CREATE POLICY "device_registry_select" ON device_registry
    FOR SELECT USING (
        hotel_id IN (SELECT get_tenant_hotel_ids())
    );

-- Hotels can insert/update their own device records
CREATE POLICY "device_registry_upsert" ON device_registry
    FOR INSERT WITH CHECK (
        hotel_id IN (SELECT get_tenant_hotel_ids())
    );

CREATE POLICY "device_registry_update" ON device_registry
    FOR UPDATE USING (
        hotel_id IN (SELECT get_tenant_hotel_ids())
    );

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_device_registry_hotel_id ON device_registry(hotel_id);
CREATE INDEX IF NOT EXISTS idx_device_registry_last_seen ON device_registry(last_seen);
