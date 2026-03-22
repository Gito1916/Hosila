-- ============================================================================
-- Platform admin subscription management
-- Keeps billing state outside hotels.settings and under platform control only
-- ============================================================================

-- 1. Platform admins
CREATE TABLE IF NOT EXISTS public.platform_admins (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text,
    full_name text,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- 2. Hotel subscriptions
CREATE TABLE IF NOT EXISTS public.hotel_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id uuid NOT NULL UNIQUE REFERENCES public.hotels(id) ON DELETE CASCADE,
    org_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
    plan_code text NOT NULL
        CHECK (plan_code IN ('starter', 'pro', 'enterprise')),
    status text NOT NULL DEFAULT 'inactive'
        CHECK (status IN ('trialing', 'active', 'past_due', 'inactive', 'cancelled')),
    billing_interval text NOT NULL DEFAULT 'monthly'
        CHECK (billing_interval IN ('monthly', 'yearly')),
    currency text NOT NULL DEFAULT 'NGN',
    unit_amount numeric(12,2) NOT NULL DEFAULT 0,
    trial_starts_at timestamptz,
    trial_ends_at timestamptz,
    activated_at timestamptz,
    current_period_starts_at timestamptz,
    current_period_ends_at timestamptz,
    next_due_at timestamptz,
    last_payment_at timestamptz,
    last_payment_amount numeric(12,2),
    feature_entitlements jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hotel_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_hotel_subscriptions_status
    ON public.hotel_subscriptions(status, plan_code, billing_interval);
CREATE INDEX IF NOT EXISTS idx_hotel_subscriptions_org
    ON public.hotel_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_hotel_subscriptions_due
    ON public.hotel_subscriptions(next_due_at);

-- 3. Subscription ledger
CREATE TABLE IF NOT EXISTS public.subscription_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    subscription_id uuid NOT NULL REFERENCES public.hotel_subscriptions(id) ON DELETE CASCADE,
    entry_type text NOT NULL
        CHECK (entry_type IN (
            'trial_started',
            'payment_recorded',
            'plan_activated',
            'plan_renewed',
            'status_changed',
            'override_added',
            'override_revoked',
            'manual_adjustment'
        )),
    plan_code text
        CHECK (plan_code IS NULL OR plan_code IN ('starter', 'pro', 'enterprise')),
    billing_interval text
        CHECK (billing_interval IS NULL OR billing_interval IN ('monthly', 'yearly')),
    amount numeric(12,2),
    currency text NOT NULL DEFAULT 'NGN',
    reference text,
    period_starts_at timestamptz,
    period_ends_at timestamptz,
    due_at timestamptz,
    effective_at timestamptz NOT NULL DEFAULT now(),
    notes text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_ledger ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_subscription_ledger_hotel_created
    ON public.subscription_ledger(hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_ledger_subscription_created
    ON public.subscription_ledger(subscription_id, created_at DESC);

-- 4. Subscription overrides
CREATE TABLE IF NOT EXISTS public.subscription_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    subscription_id uuid NOT NULL REFERENCES public.hotel_subscriptions(id) ON DELETE CASCADE,
    feature_key text NOT NULL,
    override_mode text NOT NULL
        CHECK (override_mode IN ('enable', 'disable', 'limit', 'set')),
    value jsonb NOT NULL DEFAULT 'null'::jsonb,
    reason text,
    starts_at timestamptz NOT NULL DEFAULT now(),
    ends_at timestamptz,
    is_active boolean NOT NULL DEFAULT true,
    revoked_at timestamptz,
    revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_overrides ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_subscription_overrides_hotel_active
    ON public.subscription_overrides(hotel_id, is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_subscription_overrides_subscription_active
    ON public.subscription_overrides(subscription_id, is_active);

-- 5. Platform audit logs
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    admin_email text,
    hotel_id uuid REFERENCES public.hotels(id) ON DELETE SET NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_hotel_created
    ON public.platform_audit_logs(hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_admin_created
    ON public.platform_audit_logs(admin_user_id, created_at DESC);

-- 6. Keep org linkage in sync for existing hotels
INSERT INTO public.hotel_subscriptions (
    hotel_id,
    org_id,
    plan_code,
    status,
    billing_interval,
    currency,
    unit_amount,
    feature_entitlements,
    metadata
)
SELECT
    h.id,
    h.org_id,
    'starter',
    'inactive',
    'monthly',
    'NGN',
    0,
    '{}'::jsonb,
    jsonb_build_object('seeded', true)
FROM public.hotels h
ON CONFLICT (hotel_id) DO NOTHING;

UPDATE public.hotel_subscriptions hs
SET org_id = h.org_id
FROM public.hotels h
WHERE hs.hotel_id = h.id
  AND hs.org_id IS DISTINCT FROM h.org_id;

-- 7. updated_at triggers
DROP TRIGGER IF EXISTS set_updated_at_platform_admins ON public.platform_admins;
CREATE TRIGGER set_updated_at_platform_admins
    BEFORE UPDATE ON public.platform_admins
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_hotel_subscriptions ON public.hotel_subscriptions;
CREATE TRIGGER set_updated_at_hotel_subscriptions
    BEFORE UPDATE ON public.hotel_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_subscription_overrides ON public.subscription_overrides;
CREATE TRIGGER set_updated_at_subscription_overrides
    BEFORE UPDATE ON public.subscription_overrides
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
