-- ============================================================================
-- Invoice counters — atomic invoice number generation
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_counters (
    hotel_id UUID PRIMARY KEY REFERENCES hotels(id) ON DELETE CASCADE,
    last_number INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON invoice_counters
    FOR ALL USING (hotel_id IN (SELECT get_tenant_hotel_ids()));

CREATE OR REPLACE FUNCTION next_invoice_number(p_hotel_id UUID)
RETURNS INTEGER AS $$
DECLARE
    next_num INTEGER;
BEGIN
    INSERT INTO invoice_counters (hotel_id, last_number, updated_at)
    VALUES (p_hotel_id, 1, NOW())
    ON CONFLICT (hotel_id)
    DO UPDATE SET last_number = invoice_counters.last_number + 1, updated_at = NOW()
    RETURNING last_number INTO next_num;

    RETURN next_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';
