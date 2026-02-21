-- ============================================================================
-- Fix RLS policies for hotel INSERT/UPDATE
-- The original policy only had USING which doesn't properly allow INSERTs.
-- We need separate policies for SELECT, INSERT, UPDATE, DELETE.
-- ============================================================================

-- Drop the old single policy
DROP POLICY IF EXISTS "Tenant isolation" ON hotels;

-- SELECT: can only see own hotels
CREATE POLICY "hotels_select" ON hotels
    FOR SELECT USING (tenant_id = auth.uid());

-- INSERT: can insert rows where tenant_id matches your user id
CREATE POLICY "hotels_insert" ON hotels
    FOR INSERT WITH CHECK (tenant_id = auth.uid());

-- UPDATE: can only update own hotels
CREATE POLICY "hotels_update" ON hotels
    FOR UPDATE USING (tenant_id = auth.uid())
    WITH CHECK (tenant_id = auth.uid());

-- DELETE: can only delete own hotels
CREATE POLICY "hotels_delete" ON hotels
    FOR DELETE USING (tenant_id = auth.uid());
