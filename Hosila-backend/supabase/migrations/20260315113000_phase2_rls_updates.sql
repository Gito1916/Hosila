-- ============================================================================
-- Phase 2: RLS Updates for Staff Auth Architecture
-- 1. Update get_tenant_hotel_ids() to validate staff_sessions
-- 2. Update hotels_select policy to use get_tenant_hotel_ids()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_hotel_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_staff_hotel_id uuid;
    v_session_id uuid;
    v_is_valid boolean;
BEGIN
    -- 1. Legacy and Owner path: hotels owned directly by this auth user (tenant_id)
    RETURN QUERY SELECT id FROM public.hotels WHERE tenant_id = auth.uid();
    
    -- 2. Org path: hotels where user is an org member with access
    RETURN QUERY 
        SELECT h.id FROM public.hotels h
        JOIN public.org_members om ON om.org_id = h.org_id
        WHERE om.user_id = auth.uid()
        AND (om.hotel_id IS NULL OR om.hotel_id = h.id);

    -- 3. Staff token path: check JWT claims for active session
    BEGIN
        v_staff_hotel_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'staff_hotel_id')::uuid;
        v_session_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'session_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_staff_hotel_id := NULL;
        v_session_id := NULL;
    END;

    IF v_staff_hotel_id IS NOT NULL AND v_session_id IS NOT NULL THEN
        -- Validate the session (indexed lookup on staff_sessions)
        SELECT true INTO v_is_valid
        FROM public.staff_sessions
        WHERE id = v_session_id AND revoked_at IS NULL;

        IF v_is_valid THEN
            RETURN NEXT v_staff_hotel_id;
        END IF;
    END IF;
END;
$$;

-- Update hotels_select to just use the helper, which now includes staff access
DROP POLICY IF EXISTS "hotels_select" ON public.hotels;
CREATE POLICY "hotels_select" ON public.hotels FOR SELECT
    USING (
        id IN (SELECT public.get_tenant_hotel_ids())
    );
