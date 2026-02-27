
-- Fix infinite recursion between org_members and organisations RLS policies.
--
-- Problem:
--   org_members.org_members_owner_all  -> SELECT from organisations  (to check owner_id)
--   organisations.org_member_select    -> SELECT from org_members     (to check membership)
--   This creates a circular dependency.
--
-- Solution:
--   1. Replace org_members_owner_all to check owner_id via a direct join
--      using a security-definer function, avoiding the RLS check on organisations.
--   2. Similarly, replace org_member_select on organisations to use a
--      security-definer function that reads org_members without its RLS.

-- Step 1: Create helper functions that bypass RLS (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_org_owner(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organisations
    WHERE id = p_org_id AND owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid();
$$;

-- Step 2: Drop the problematic policies
DROP POLICY IF EXISTS "org_members_owner_all" ON org_members;
DROP POLICY IF EXISTS "org_member_select" ON organisations;

-- Step 3: Recreate policies using the helper functions (no cross-table RLS)

-- org_members: org owners can do everything on their org's members
CREATE POLICY "org_members_owner_all" ON org_members
  FOR ALL
  USING (public.is_org_owner(org_id))
  WITH CHECK (public.is_org_owner(org_id));

-- organisations: members can read their own orgs
CREATE POLICY "org_member_select" ON organisations
  FOR SELECT
  USING (id IN (SELECT public.user_org_ids()));
