
-- Hotel Email Settings — per-hotel email configuration with dual sending mode
CREATE TABLE hotel_email_settings (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    
    -- Sending mode: 'shared' (via hosila.app) or 'custom' (hotel's verified domain)
    sending_mode TEXT NOT NULL DEFAULT 'shared' CHECK (sending_mode IN ('shared', 'custom')),
    
    -- Custom domain fields (only used when sending_mode = 'custom')
    custom_domain TEXT,
    custom_sender_email TEXT,
    domain_verified BOOLEAN NOT NULL DEFAULT FALSE,
    spf_verified BOOLEAN NOT NULL DEFAULT FALSE,
    dkim_verified BOOLEAN NOT NULL DEFAULT FALSE,
    dmarc_verified BOOLEAN NOT NULL DEFAULT FALSE,
    resend_domain_id TEXT,  -- Resend's domain ID for verification checks
    
    -- Branding
    primary_color TEXT NOT NULL DEFAULT '#2563EB',
    
    -- Promo block
    promo_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    promo_title TEXT,
    promo_body TEXT,
    
    -- Custom footer message
    custom_footer TEXT,
    
    -- Auto-send toggles
    send_reservation_email BOOLEAN NOT NULL DEFAULT TRUE,
    send_checkin_email BOOLEAN NOT NULL DEFAULT TRUE,
    send_checkout_email BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One settings row per hotel
    CONSTRAINT hotel_email_settings_hotel_id_unique UNIQUE (hotel_id)
);

-- RLS
ALTER TABLE hotel_email_settings ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access their own hotel's email settings
CREATE POLICY "hotel_email_settings_hotel_isolation" ON hotel_email_settings
    FOR ALL
    USING (hotel_id IN (
        SELECT hotel_id FROM users WHERE id = auth.uid()
    ))
    WITH CHECK (hotel_id IN (
        SELECT hotel_id FROM users WHERE id = auth.uid()
    ));

-- Service role bypass for backend API
CREATE POLICY "hotel_email_settings_service_role" ON hotel_email_settings
    FOR ALL
    USING (TRUE)
    WITH CHECK (TRUE);
