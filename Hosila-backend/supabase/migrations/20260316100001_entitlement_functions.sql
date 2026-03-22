-- Migration: SQL helper functions for subscription entitlement enforcement
-- These are the single source of truth — Python, Edge Functions, and RLS all call these.

-- ---------------------------------------------------------------------------
-- 1. effective_subscription_status(p_hotel_id)
--    Computes real-time status considering trial expiry and grace period.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.effective_subscription_status(p_hotel_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status       text;
    v_trial_ends   timestamptz;
    v_period_ends  timestamptz;
BEGIN
    SELECT status, trial_ends_at, current_period_ends_at
      INTO v_status, v_trial_ends, v_period_ends
      FROM hotel_subscriptions
     WHERE hotel_id = p_hotel_id;

    IF NOT FOUND THEN
        RETURN 'inactive';
    END IF;

    -- Trial expired → inactive
    IF v_status = 'trialing' AND v_trial_ends IS NOT NULL AND v_trial_ends < now() THEN
        RETURN 'inactive';
    END IF;

    -- Active but period expired → past_due
    IF v_status = 'active' AND v_period_ends IS NOT NULL AND v_period_ends < now() THEN
        -- Within 7-day grace → past_due
        IF v_period_ends + interval '7 days' >= now() THEN
            RETURN 'past_due';
        END IF;
        -- Grace period exhausted → inactive
        RETURN 'inactive';
    END IF;

    -- Past_due but grace exhausted → inactive
    IF v_status = 'past_due' AND v_period_ends IS NOT NULL
       AND v_period_ends + interval '7 days' < now() THEN
        RETURN 'inactive';
    END IF;

    RETURN v_status;
END;
$$;


-- ---------------------------------------------------------------------------
-- 2. subscription_write_mode(p_hotel_id)
--    Returns 'full', 'restricted', or 'blocked'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscription_write_mode(p_hotel_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_eff_status text;
BEGIN
    v_eff_status := effective_subscription_status(p_hotel_id);

    IF v_eff_status IN ('trialing', 'active', 'past_due') THEN
        RETURN 'full';
    ELSIF v_eff_status IN ('inactive', 'cancelled') THEN
        RETURN 'restricted';
    ELSE
        RETURN 'blocked';
    END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. has_feature(p_hotel_id, p_feature_key)
--    Override-aware feature check. Returns FALSE for inactive/cancelled hotels.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_feature(p_hotel_id uuid, p_feature_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_eff_status    text;
    v_override_mode text;
    v_entitlements  jsonb;
    v_value         text;
BEGIN
    v_eff_status := effective_subscription_status(p_hotel_id);

    -- Inactive/cancelled → all features off
    IF v_eff_status IN ('inactive', 'cancelled') THEN
        RETURN FALSE;
    END IF;

    -- Check active overrides first
    SELECT override_mode
      INTO v_override_mode
      FROM subscription_overrides
     WHERE hotel_id = p_hotel_id
       AND feature_key = p_feature_key
       AND is_active = TRUE
       AND revoked_at IS NULL
       AND starts_at <= now()
       AND (ends_at IS NULL OR ends_at >= now())
     ORDER BY created_at DESC
     LIMIT 1;

    IF FOUND THEN
        IF v_override_mode = 'enable' THEN
            RETURN TRUE;
        ELSIF v_override_mode = 'disable' THEN
            RETURN FALSE;
        END IF;
    END IF;

    -- Check feature_entitlements JSONB
    SELECT feature_entitlements
      INTO v_entitlements
      FROM hotel_subscriptions
     WHERE hotel_id = p_hotel_id;

    IF v_entitlements IS NULL THEN
        RETURN FALSE;
    END IF;

    v_value := v_entitlements ->> p_feature_key;

    -- Key missing → deny by default
    IF v_value IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Boolean check: 'true' → TRUE, everything else → FALSE
    RETURN v_value = 'true';
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. check_rooms_limit(p_hotel_id)
--    Checks plan-based room inventory limit. NULL rooms_limit = unlimited.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_rooms_limit(p_hotel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit    int;
    v_count    int;
    v_raw      text;
BEGIN
    SELECT feature_entitlements ->> 'rooms_limit'
      INTO v_raw
      FROM hotel_subscriptions
     WHERE hotel_id = p_hotel_id;

    -- No subscription row or null limit → unlimited
    IF v_raw IS NULL OR v_raw = 'null' THEN
        RETURN TRUE;
    END IF;

    v_limit := v_raw::int;

    SELECT COUNT(*)
      INTO v_count
      FROM rooms
     WHERE hotel_id = p_hotel_id;

    RETURN v_count < v_limit;
END;
$$;


-- ---------------------------------------------------------------------------
-- 5. check_active_room_cap(p_hotel_id)
--    In restricted mode, cap active bookings at 5. Full mode → always TRUE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_active_room_cap(p_hotel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_mode  text;
    v_count int;
BEGIN
    v_mode := subscription_write_mode(p_hotel_id);

    IF v_mode = 'full' THEN
        RETURN TRUE;
    END IF;

    -- Restricted mode → cap at 5 active bookings
    SELECT COUNT(*)
      INTO v_count
      FROM bookings
     WHERE hotel_id = p_hotel_id
       AND status = 'active';

    RETURN v_count < 5;
END;
$$;


-- ---------------------------------------------------------------------------
-- Grant execute to authenticated users (needed for RLS policy evaluation)
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.effective_subscription_status(uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_write_mode(uuid)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_rooms_limit(uuid)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_active_room_cap(uuid)               TO authenticated, service_role;
