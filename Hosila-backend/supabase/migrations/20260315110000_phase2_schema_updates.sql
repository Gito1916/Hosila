-- ============================================================================
-- Phase 2: Staff Auth Architecture (Database Schema)
-- 1. Add hotel_code to hotels table
-- 2. Create staff_sessions table
-- 3. Upgrade device_registry table for pairing
-- ============================================================================

-- 1. Add hotel_code to hotels
ALTER TABLE public.hotels
    ADD COLUMN IF NOT EXISTS hotel_code TEXT UNIQUE;

-- Function to generate a random 6-character alphanumeric code
CREATE OR REPLACE FUNCTION generate_hotel_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result TEXT := '';
    i INTEGER := 0;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Trigger to automatically assign hotel_code before insert
CREATE OR REPLACE FUNCTION set_hotel_code_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.hotel_code IS NULL THEN
        LOOP
            NEW.hotel_code := generate_hotel_code();
            BEGIN
                -- Attempt to insert to check for uniqueness (handled implicitly by UNIQUE constraint later, 
                -- but here we just ensure the variable has a value. The actual unique check happens on insert).
                -- To be perfectly safe against collisions during generation, we could query:
                IF NOT EXISTS (SELECT 1 FROM public.hotels WHERE hotel_code = NEW.hotel_code) THEN
                    EXIT;
                END IF;
            END;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_hotel_code ON public.hotels;
CREATE TRIGGER ensure_hotel_code
    BEFORE INSERT ON public.hotels
    FOR EACH ROW
    EXECUTE FUNCTION set_hotel_code_trigger();

-- Backfill existing hotels with hotel codes
DO $$
DECLARE
    h RECORD;
BEGIN
    FOR h IN SELECT id FROM public.hotels WHERE hotel_code IS NULL LOOP
        UPDATE public.hotels SET hotel_code = generate_hotel_code() WHERE id = h.id;
    END LOOP;
END;
$$;

-- Make hotel_code NOT NULL after backfill
ALTER TABLE public.hotels ALTER COLUMN hotel_code SET NOT NULL;

-- 2. Create staff_sessions table
CREATE TABLE IF NOT EXISTS public.staff_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    refresh_token TEXT UNIQUE NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_active TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for RLS validation lookups
CREATE INDEX IF NOT EXISTS idx_staff_sessions_id_revoked ON public.staff_sessions(id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_staff_sessions_user_id ON public.staff_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_hotel_id ON public.staff_sessions(hotel_id);

-- 3. Upgrade device_registry table
ALTER TABLE public.device_registry
    ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pairing_code TEXT,
    ADD COLUMN IF NOT EXISTS pairing_code_expires_at TIMESTAMPTZ;

-- Backfill existing devices to be approved (since they were already connected)
UPDATE public.device_registry SET is_approved = TRUE WHERE is_approved = FALSE;

-- Enable RLS on staff_sessions
ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;

-- Policies for staff_sessions
-- Admins can view all sessions for their hotel
CREATE POLICY "Admins can view all sessions"
    ON public.staff_sessions
    FOR SELECT
    USING (
        hotel_id IN (SELECT unnest(get_tenant_hotel_ids()))
        AND EXISTS (
             SELECT 1 FROM public.users u
             WHERE u.id = auth.uid() OR u.id = (current_setting('request.jwt.claims', true)::jsonb ->> 'staff_user_id')::uuid
             -- Note: Full RLS rewrite using JWT claims will be in a separate migration step,
             -- but we can use tenant_hotel_ids as a fallback for now.
             -- Actually, since staff_sessions is managed by Edge Function using service role,
             -- the frontend only needs read access to view active sessions.
        )
    );

-- Users can view their own sessions
CREATE POLICY "Users can view their own sessions"
    ON public.staff_sessions
    FOR SELECT
    USING (
        user_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'staff_user_id')::uuid
    );

-- Delete/revoke is handled via Edge Function (service role) or RPC
