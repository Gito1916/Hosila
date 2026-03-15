-- ============================================================================
-- Phase 3: Session Hardening & Audit Logging
-- 1. Add account lockout columns to users
-- 2. Create auth_events audit log table
-- 3. Fix staff_sessions RLS policies (use 'sub' claim, not 'staff_user_id')
-- ============================================================================

-- 1. Account lockout columns on users table
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- 2. Auth events audit table
CREATE TABLE IF NOT EXISTS public.auth_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,  -- 'login_success', 'login_failed', 'logout', 'password_change', 'account_locked', 'account_unlocked', 'session_revoked', 'device_paired', 'device_unpaired'
    ip_address TEXT,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_events_hotel_id ON public.auth_events(hotel_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_user_id ON public.auth_events(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_created_at ON public.auth_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_event_type ON public.auth_events(event_type);

-- RLS for auth_events (admins can read their hotel's events)
ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_events_select" ON public.auth_events
    FOR SELECT USING (
        hotel_id IN (SELECT public.get_tenant_hotel_ids())
    );

-- Insert is done via service role (Edge Function), so no insert policy needed for users.

-- 3. Fix staff_sessions RLS policies
-- Drop old policies that referenced 'staff_user_id' (incorrect claim name)
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.staff_sessions;
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.staff_sessions;

-- Staff can view their own sessions (using 'sub' claim from our JWT)
CREATE POLICY "staff_sessions_select_own" ON public.staff_sessions
    FOR SELECT USING (
        user_id = COALESCE(
            auth.uid(),
            (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid
        )
    );

-- Admin staff can view all sessions for their hotel
CREATE POLICY "staff_sessions_select_hotel" ON public.staff_sessions
    FOR SELECT USING (
        hotel_id IN (SELECT public.get_tenant_hotel_ids())
        AND EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = COALESCE(
                auth.uid(),
                (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid
            )
            AND u.role IN ('admin', 'manager')
        )
    );
