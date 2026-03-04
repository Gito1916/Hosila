-- Availability checks log — records when hotel website API checks room availability
CREATE TABLE IF NOT EXISTS availability_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    room_type_requested TEXT,
    rooms_found INTEGER NOT NULL DEFAULT 0,
    requested_type_available BOOLEAN DEFAULT TRUE,
    alternatives_shown BOOLEAN DEFAULT FALSE,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for hotel-scoped queries
CREATE INDEX idx_availability_checks_hotel_created ON availability_checks(hotel_id, created_at DESC);

-- RLS
ALTER TABLE availability_checks ENABLE ROW LEVEL SECURITY;

-- Hotel staff can read their own checks (matches existing pattern)
CREATE POLICY "Hotel members can read availability checks"
    ON availability_checks FOR SELECT
    USING (hotel_id IN (
        SELECT hotels.id FROM hotels WHERE hotels.tenant_id = auth.uid()
    ));

-- Allow inserts from service role (Edge Function) and authenticated users
CREATE POLICY "Allow insert availability checks"
    ON availability_checks FOR INSERT
    WITH CHECK (TRUE);

-- Enable realtime for this table so frontend gets instant notifications
ALTER PUBLICATION supabase_realtime ADD TABLE availability_checks;
