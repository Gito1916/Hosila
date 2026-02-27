
-- Guest Email Logs — audit trail for all automated guest emails
CREATE TABLE guest_email_logs (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
    
    -- Email details
    email_type TEXT NOT NULL CHECK (email_type IN ('reservation_confirmation', 'checkin_welcome', 'checkout_receipt')),
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('sent', 'failed', 'skipped', 'pending')),
    provider_response JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    
    -- Timestamps
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE guest_email_logs ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access their own hotel's email logs
CREATE POLICY "guest_email_logs_hotel_isolation" ON guest_email_logs
    FOR ALL
    USING (hotel_id IN (
        SELECT hotel_id FROM users WHERE id = auth.uid()
    ))
    WITH CHECK (hotel_id IN (
        SELECT hotel_id FROM users WHERE id = auth.uid()
    ));

-- Service role bypass for backend API
CREATE POLICY "guest_email_logs_service_role" ON guest_email_logs
    FOR ALL
    USING (TRUE)
    WITH CHECK (TRUE);

-- Index for efficient querying
CREATE INDEX idx_guest_email_logs_hotel_id ON guest_email_logs(hotel_id);
CREATE INDEX idx_guest_email_logs_guest_id ON guest_email_logs(guest_id);
CREATE INDEX idx_guest_email_logs_email_type ON guest_email_logs(email_type);
CREATE INDEX idx_guest_email_logs_sent_at ON guest_email_logs(sent_at DESC);
