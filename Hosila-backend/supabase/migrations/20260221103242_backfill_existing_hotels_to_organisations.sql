
-- Backfill: create an organisation for each existing hotel
-- and link the hotel owner (tenant_id) as org_owner
DO $$
DECLARE
    r RECORD;
    new_org_id uuid;
BEGIN
    FOR r IN SELECT id, name, tenant_id FROM public.hotels WHERE org_id IS NULL
    LOOP
        new_org_id := gen_random_uuid();
        
        INSERT INTO public.organisations (id, name, owner_id)
        VALUES (new_org_id, r.name, r.tenant_id);
        
        UPDATE public.hotels SET org_id = new_org_id WHERE id = r.id;
        
        INSERT INTO public.org_members (org_id, user_id, role, hotel_id)
        VALUES (new_org_id, r.tenant_id, 'org_owner', NULL)
        ON CONFLICT (org_id, user_id) DO NOTHING;
    END LOOP;
END $$;
