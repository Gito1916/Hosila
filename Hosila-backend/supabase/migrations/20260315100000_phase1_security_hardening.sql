-- ============================================================================
-- Phase 1: Security Hardening
-- 1. Username uniqueness constraint (case-insensitive)
-- 2. Add must_change_password flag to users
-- 3. Strengthen password policy in verify_and_change_password RPC
-- 4. Set must_change_password = true for all existing admin users with 
--    default 'admin' username (catches seeded defaults)
-- ============================================================================

-- 1. Case-insensitive username uniqueness per hotel
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_hotel_username_ci
    ON public.users (hotel_id, lower(username));

-- 2. Add must_change_password column (default false for existing users)
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- 3. Strengthen password validation in verify_and_change_password
CREATE OR REPLACE FUNCTION verify_and_change_password(
    p_user_id UUID,
    p_current_password TEXT,
    p_new_password TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_stored_hash TEXT;
BEGIN
    -- Validate new password: min 8 chars, at least one digit
    IF length(p_new_password) < 8 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 8 characters.');
    END IF;

    IF p_new_password !~ '[0-9]' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Password must contain at least one number.');
    END IF;

    -- Fetch stored hash
    SELECT password_hash INTO v_stored_hash
    FROM public.users
    WHERE id = p_user_id;

    IF v_stored_hash IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found.');
    END IF;

    -- Verify current password
    IF NOT (v_stored_hash = crypt(p_current_password, v_stored_hash)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Current password is incorrect.');
    END IF;

    -- Update password and clear must_change_password flag
    UPDATE public.users
    SET password_hash = crypt(p_new_password, gen_salt('bf')),
        must_change_password = FALSE,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';

-- 4. Also strengthen hash_password to validate policy
CREATE OR REPLACE FUNCTION hash_password(p_password TEXT)
RETURNS TEXT AS $$
BEGIN
    IF length(p_password) < 8 THEN
        RAISE EXCEPTION 'Password must be at least 8 characters.';
    END IF;

    IF p_password !~ '[0-9]' THEN
        RAISE EXCEPTION 'Password must contain at least one number.';
    END IF;

    RETURN crypt(p_password, gen_salt('bf'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';

-- 5. Flag existing admin accounts with default username for password change
UPDATE public.users
SET must_change_password = TRUE
WHERE username = 'admin' AND role = 'admin';
