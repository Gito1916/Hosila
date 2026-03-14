-- ============================================================================
-- Server-side password authentication RPCs
-- Moves password hashing and verification from frontend to Postgres
-- ============================================================================

-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- ============================================================================
-- 1. authenticate_user — replaces client-side bcrypt.compare
-- ============================================================================
CREATE OR REPLACE FUNCTION authenticate_user(
    p_username TEXT,
    p_hotel_id UUID
)
RETURNS TABLE(
    id UUID,
    hotel_id UUID,
    username TEXT,
    name TEXT,
    role TEXT,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_login TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id, u.hotel_id, u.username, u.name, u.role,
        u.is_active, u.created_at, u.updated_at, u.last_login
    FROM public.users u
    WHERE u.username = p_username
      AND u.hotel_id = p_hotel_id
      AND u.is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
   SET search_path = '';

-- ============================================================================
-- 2. verify_user_password — checks password server-side
-- ============================================================================
CREATE OR REPLACE FUNCTION verify_user_password(
    p_user_id UUID,
    p_password TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    stored_hash TEXT;
BEGIN
    SELECT u.password_hash INTO stored_hash
    FROM public.users u
    WHERE u.id = p_user_id;

    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN stored_hash = extensions.crypt(p_password, stored_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
   SET search_path = '';

-- ============================================================================
-- 3. hash_password — replaces client-side bcrypt.hash
-- ============================================================================
CREATE OR REPLACE FUNCTION hash_password(p_password TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN extensions.crypt(p_password, extensions.gen_salt('bf', 10));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';

-- ============================================================================
-- 4. verify_and_change_password — replaces changePassword() in settings.ts
-- ============================================================================
CREATE OR REPLACE FUNCTION verify_and_change_password(
    p_user_id UUID,
    p_current_password TEXT,
    p_new_password TEXT
)
RETURNS JSONB AS $$
DECLARE
    stored_hash TEXT;
    new_hash TEXT;
BEGIN
    SELECT u.password_hash INTO stored_hash
    FROM public.users u
    WHERE u.id = p_user_id;

    IF stored_hash IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    IF stored_hash != extensions.crypt(p_current_password, stored_hash) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Current password is incorrect');
    END IF;

    IF length(p_new_password) < 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'New password must be at least 6 characters');
    END IF;

    new_hash := extensions.crypt(p_new_password, extensions.gen_salt('bf', 10));
    UPDATE public.users SET password_hash = new_hash, updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';
