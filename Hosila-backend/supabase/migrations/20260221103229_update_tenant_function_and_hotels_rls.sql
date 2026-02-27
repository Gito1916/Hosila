
-- ============================================================================
-- 1. Update get_tenant_hotel_ids() to be org-aware
--    This single change propagates to all 28+ RLS policies that call it
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_tenant_hotel_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
    -- Legacy path: hotels owned directly by this auth user (tenant_id)
    SELECT id FROM public.hotels WHERE tenant_id = auth.uid()
    UNION
    -- Org path: hotels where user is an org member with access
    SELECT h.id FROM public.hotels h
    JOIN public.org_members om ON om.org_id = h.org_id
    WHERE om.user_id = auth.uid()
    AND (om.hotel_id IS NULL OR om.hotel_id = h.id)
$function$;

-- ============================================================================
-- 2. Update hotels table RLS policies for org-aware access
-- ============================================================================

-- SELECT: tenant owner OR any org member
DROP POLICY IF EXISTS "hotels_select" ON public.hotels;
CREATE POLICY "hotels_select" ON public.hotels FOR SELECT
    USING (
        tenant_id = auth.uid()
        OR org_id IN (
            SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
        )
    );

-- UPDATE: tenant owner OR org_owner
DROP POLICY IF EXISTS "hotels_update" ON public.hotels;
CREATE POLICY "hotels_update" ON public.hotels FOR UPDATE
    USING (
        tenant_id = auth.uid()
        OR org_id IN (
            SELECT org_id FROM public.org_members
            WHERE user_id = auth.uid() AND role = 'org_owner'
        )
    )
    WITH CHECK (
        tenant_id = auth.uid()
        OR org_id IN (
            SELECT org_id FROM public.org_members
            WHERE user_id = auth.uid() AND role = 'org_owner'
        )
    );

-- INSERT: tenant owner OR org_owner
DROP POLICY IF EXISTS "hotels_insert" ON public.hotels;
CREATE POLICY "hotels_insert" ON public.hotels FOR INSERT
    WITH CHECK (
        tenant_id = auth.uid()
        OR org_id IN (
            SELECT org_id FROM public.org_members
            WHERE user_id = auth.uid() AND role = 'org_owner'
        )
    );

-- DELETE: tenant owner OR org_owner
DROP POLICY IF EXISTS "hotels_delete" ON public.hotels;
CREATE POLICY "hotels_delete" ON public.hotels FOR DELETE
    USING (
        tenant_id = auth.uid()
        OR org_id IN (
            SELECT org_id FROM public.org_members
            WHERE user_id = auth.uid() AND role = 'org_owner'
        )
    );
