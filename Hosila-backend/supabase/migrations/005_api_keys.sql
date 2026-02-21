-- API Keys for website integration
-- Each hotel generates a unique API key to authenticate website API calls

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL, -- SHA-256 hash of the API key (never store plaintext)
    key_prefix TEXT NOT NULL, -- First 8 chars for identification (e.g., "hf_abc12...")
    name TEXT NOT NULL DEFAULT 'Website API Key',
    allowed_origins TEXT[] DEFAULT '{}', -- CORS allowed origins
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(key_hash)
);

-- RLS policies
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_tenant" ON api_keys
    FOR ALL USING (
        hotel_id IN (SELECT get_tenant_hotel_ids())
    );

-- Index for fast key lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_hotel ON api_keys(hotel_id);

-- Function to validate an API key and return the hotel_id
-- Used by Edge Functions to authenticate requests
CREATE OR REPLACE FUNCTION validate_api_key(p_key_hash TEXT)
RETURNS TABLE(hotel_id UUID, key_name TEXT) AS $$
    SELECT ak.hotel_id, ak.name
    FROM public.api_keys ak
    WHERE ak.key_hash = p_key_hash
      AND ak.is_active = TRUE;
$$ LANGUAGE SQL SECURITY DEFINER STABLE
   SET search_path = '';

-- Update last_used_at on key usage
CREATE OR REPLACE FUNCTION touch_api_key(p_key_hash TEXT)
RETURNS VOID AS $$
    UPDATE public.api_keys SET last_used_at = now() WHERE key_hash = p_key_hash;
$$ LANGUAGE SQL SECURITY DEFINER
   SET search_path = '';
