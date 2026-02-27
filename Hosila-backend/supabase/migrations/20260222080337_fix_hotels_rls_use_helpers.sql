
-- Fix hotels RLS policies to use the same SECURITY DEFINER helpers,
-- avoiding the cross-table recursion through org_members.

DROP POLICY IF EXISTS "hotels_select" ON hotels;
DROP POLICY IF EXISTS "hotels_insert" ON hotels;
DROP POLICY IF EXISTS "hotels_update" ON hotels;
DROP POLICY IF EXISTS "hotels_delete" ON hotels;

-- SELECT: tenant owner OR any org member
CREATE POLICY "hotels_select" ON hotels
  FOR SELECT
  USING (
    tenant_id = auth.uid()
    OR org_id IN (SELECT public.user_org_ids())
  );

-- INSERT: tenant owner OR org owner
CREATE POLICY "hotels_insert" ON hotels
  FOR INSERT
  WITH CHECK (
    tenant_id = auth.uid()
    OR public.is_org_owner(org_id)
  );

-- UPDATE: tenant owner OR org owner
CREATE POLICY "hotels_update" ON hotels
  FOR UPDATE
  USING (
    tenant_id = auth.uid()
    OR public.is_org_owner(org_id)
  )
  WITH CHECK (
    tenant_id = auth.uid()
    OR public.is_org_owner(org_id)
  );

-- DELETE: tenant owner OR org owner
CREATE POLICY "hotels_delete" ON hotels
  FOR DELETE
  USING (
    tenant_id = auth.uid()
    OR public.is_org_owner(org_id)
  );
