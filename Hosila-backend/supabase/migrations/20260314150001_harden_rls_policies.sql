-- ============================================================================
-- Harden RLS policies — remove overly permissive service-role bypass
-- ============================================================================

DROP POLICY IF EXISTS "hotel_email_settings_service_role" ON hotel_email_settings;
DROP POLICY IF EXISTS "guest_email_logs_service_role" ON guest_email_logs;

DROP POLICY IF EXISTS "Allow insert availability checks" ON availability_checks;

CREATE POLICY "Hotel members can insert availability checks"
    ON availability_checks FOR INSERT
    WITH CHECK (hotel_id IN (
        SELECT hotels.id FROM hotels WHERE hotels.tenant_id = auth.uid()
    ));
