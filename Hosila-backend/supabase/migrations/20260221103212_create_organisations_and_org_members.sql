
-- ============================================================================
-- 1. Create organisations table
-- ============================================================================
CREATE TABLE public.organisations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    owner_id    uuid NOT NULL REFERENCES auth.users(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

-- Owner has full access (no cross-table reference, safe to create first)
CREATE POLICY "org_owner_all" ON public.organisations FOR ALL
    USING (owner_id = auth.uid());

-- ============================================================================
-- 2. Add org_id column to hotels (before org_members, since org_members FKs hotels)
-- ============================================================================
ALTER TABLE public.hotels
    ADD COLUMN org_id uuid REFERENCES public.organisations(id);

CREATE INDEX idx_hotels_org_id ON public.hotels(org_id);

-- ============================================================================
-- 3. Create org_members junction table
-- ============================================================================
CREATE TABLE public.org_members (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role       text NOT NULL DEFAULT 'org_admin'
               CHECK (role IN ('org_owner', 'org_admin')),
    hotel_id   uuid REFERENCES public.hotels(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, user_id)
);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- Org owner can manage all members
CREATE POLICY "org_members_owner_all" ON public.org_members FOR ALL
    USING (org_id IN (
        SELECT id FROM public.organisations WHERE owner_id = auth.uid()
    ));

-- Members can read their own record
CREATE POLICY "org_members_self_select" ON public.org_members FOR SELECT
    USING (user_id = auth.uid());

-- ============================================================================
-- 4. Now add the cross-referencing policy on organisations
-- ============================================================================
CREATE POLICY "org_member_select" ON public.organisations FOR SELECT
    USING (id IN (
        SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    ));
