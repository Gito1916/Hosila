import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT } from "https://deno.land/x/jose@v5.2.3/index.ts";

// ── Constants ────────────────────────────────────────────────────
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function error(message: string, status = 400) {
    return json({ error: message }, status);
}

function getSupabaseAdmin() {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    return createClient(url, serviceKey);
}

const JWT_SECRET_RAW = Deno.env.get("SUPABASE_AUTH_JWT_SECRET");
if (!JWT_SECRET_RAW) throw new Error("SUPABASE_AUTH_JWT_SECRET is required — refusing to start with an insecure default");
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

async function mintAccessToken(user: any, sessionId: string) {
    return await new SignJWT({
        role: "authenticated",
        sub: user.id,
        session_id: sessionId,
        staff_hotel_id: user.hotel_id,
        user_role: user.role,
    })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(JWT_SECRET);
}

// ── Audit helper ─────────────────────────────────────────────────
async function logAuthEvent(
    supabase: ReturnType<typeof createClient>,
    event: {
        hotel_id?: string;
        user_id?: string;
        event_type: string;
        ip_address?: string | null;
        user_agent?: string | null;
        metadata?: Record<string, unknown>;
    }
) {
    await supabase.from("auth_events").insert({
        hotel_id: event.hotel_id || null,
        user_id: event.user_id || null,
        event_type: event.event_type,
        ip_address: event.ip_address || null,
        user_agent: event.user_agent || null,
        metadata: event.metadata || {},
    });
}

function getClientInfo(req: Request) {
    return {
        ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
        ua: req.headers.get("user-agent") || null,
    };
}

// ------------------------------------------------------------------
// Handlers
// ------------------------------------------------------------------

async function handleLogin(req: Request, supabase: ReturnType<typeof createClient>) {
    const body = await req.json().catch(() => ({}));
    const { username, password, hotel_code } = body;
    const { ip, ua } = getClientInfo(req);

    if (!username || !password || !hotel_code) {
        return error("username, password, and hotel_code are required");
    }

    // 1. Find hotel by code
    const { data: hotel, error: hotelErr } = await supabase
        .from("hotels")
        .select("id")
        .eq("hotel_code", hotel_code)
        .single();

    if (hotelErr || !hotel) {
        return error("Invalid credentials", 401);
    }

    // 2. Find user
    const { data: user, error: userErr } = await supabase
        .from("users")
        .select("id, hotel_id, username, name, role, is_active, must_change_password, last_login, created_at, updated_at, failed_login_attempts, locked_until")
        .eq("hotel_id", hotel.id)
        .ilike("username", username)
        .single();

    if (userErr || !user) {
        await logAuthEvent(supabase, {
            hotel_id: hotel.id,
            event_type: "login_failed",
            ip_address: ip, user_agent: ua,
            metadata: { reason: "user_not_found", username },
        });
        return error("Invalid credentials", 401);
    }

    if (!user.is_active) {
        await logAuthEvent(supabase, {
            hotel_id: hotel.id, user_id: user.id,
            event_type: "login_failed",
            ip_address: ip, user_agent: ua,
            metadata: { reason: "account_deactivated" },
        });
        return error("Invalid credentials", 401);
    }

    // 3. Check account lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const remainingMs = new Date(user.locked_until).getTime() - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);
        return error(`Account is locked. Try again in ${remainingMin} minute(s).`, 429);
    }

    // Clear expired lockout
    if (user.locked_until && new Date(user.locked_until) <= new Date()) {
        await supabase
            .from("users")
            .update({ locked_until: null, failed_login_attempts: 0 })
            .eq("id", user.id);
        user.failed_login_attempts = 0;
        user.locked_until = null;
    }

    // 4. Verify password via RPC
    const { data: isValid, error: verifyErr } = await supabase.rpc("verify_user_password", {
        p_user_id: user.id,
        p_password: password,
    });

    if (verifyErr || !isValid) {
        const attempts = (user.failed_login_attempts || 0) + 1;
        const updateData: Record<string, unknown> = { failed_login_attempts: attempts };

        if (attempts >= MAX_FAILED_ATTEMPTS) {
            updateData.locked_until = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();

            await logAuthEvent(supabase, {
                hotel_id: hotel.id, user_id: user.id,
                event_type: "account_locked",
                ip_address: ip, user_agent: ua,
                metadata: { attempts, lockout_minutes: LOCKOUT_DURATION_MS / 60000 },
            });
        }

        await supabase.from("users").update(updateData).eq("id", user.id);

        await logAuthEvent(supabase, {
            hotel_id: hotel.id, user_id: user.id,
            event_type: "login_failed",
            ip_address: ip, user_agent: ua,
            metadata: { reason: "invalid_password", attempts },
        });

        if (attempts >= MAX_FAILED_ATTEMPTS) {
            return error(`Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts. Try again in 15 minutes.`, 429);
        }

        return error("Invalid credentials", 401);
    }

    // 5. Successful login — reset failed attempts
    await supabase
        .from("users")
        .update({
            failed_login_attempts: 0,
            locked_until: null,
            last_login: new Date().toISOString(),
        })
        .eq("id", user.id);

    // 6. Create Session
    const refreshToken = crypto.randomUUID() + crypto.randomUUID();
    const deviceId = ua || "unknown";

    const { data: session, error: sessionErr } = await supabase
        .from("staff_sessions")
        .insert({
            hotel_id: hotel.id,
            user_id: user.id,
            device_id: deviceId,
            refresh_token: refreshToken,
            ip_address: ip,
            user_agent: ua,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single();

    if (sessionErr || !session) {
        return error("Failed to create session", 500);
    }

    // 7. Mint JWT
    const accessToken = await mintAccessToken(user, session.id);

    // 8. Audit log
    await logAuthEvent(supabase, {
        hotel_id: hotel.id, user_id: user.id,
        event_type: "login_success",
        ip_address: ip, user_agent: ua,
        metadata: { session_id: session.id },
    });

    return json({
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
            id: user.id,
            hotel_id: user.hotel_id,
            username: user.username,
            name: user.name,
            role: user.role,
            is_active: user.is_active,
            must_change_password: user.must_change_password,
            last_login: new Date().toISOString(),
            created_at: user.created_at,
            updated_at: user.updated_at,
        }
    });
}

async function handleRefresh(req: Request, supabase: ReturnType<typeof createClient>) {
    const body = await req.json().catch(() => ({}));
    const { refresh_token } = body;

    if (!refresh_token) {
        return error("refresh_token is required");
    }

    // 1. Find session
    const { data: session, error: sessionErr } = await supabase
        .from("staff_sessions")
        .select("id, user_id, hotel_id, expires_at, revoked_at")
        .eq("refresh_token", refresh_token)
        .single();

    if (sessionErr || !session) {
        return error("Invalid refresh token", 401);
    }

    if (session.revoked_at || new Date(session.expires_at) < new Date()) {
        return error("Session expired or revoked", 401);
    }

    // 2. Load user to get latest role
    const { data: user, error: userErr } = await supabase
        .from("users")
        .select("id, hotel_id, username, name, role, is_active, must_change_password, last_login, created_at, updated_at")
        .eq("id", session.user_id)
        .single();

    if (userErr || !user || !user.is_active) {
        return error("User inactive or deleted", 401);
    }

    // 3. Rotate refresh token & touch last_active
    const newRefreshToken = crypto.randomUUID() + crypto.randomUUID();
    const { error: updateErr } = await supabase
        .from("staff_sessions")
        .update({
            refresh_token: newRefreshToken,
            last_active: new Date().toISOString(),
        })
        .eq("id", session.id);

    if (updateErr) {
        return error("Failed to rotate session", 500);
    }

    // 4. Mint new JWT
    const accessToken = await mintAccessToken(user, session.id);

    return json({
        access_token: accessToken,
        refresh_token: newRefreshToken,
        user: {
            id: user.id,
            hotel_id: user.hotel_id,
            username: user.username,
            name: user.name,
            role: user.role,
            is_active: user.is_active,
            must_change_password: user.must_change_password,
            last_login: user.last_login,
            created_at: user.created_at,
            updated_at: user.updated_at,
        }
    });
}

async function handleLogout(req: Request, supabase: ReturnType<typeof createClient>) {
    const body = await req.json().catch(() => ({}));
    const { refresh_token } = body;
    const { ip, ua } = getClientInfo(req);

    if (!refresh_token) {
        return error("refresh_token is required");
    }

    // Find session for audit log
    const { data: session } = await supabase
        .from("staff_sessions")
        .select("id, user_id, hotel_id")
        .eq("refresh_token", refresh_token)
        .single();

    // Mark as revoked
    await supabase
        .from("staff_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("refresh_token", refresh_token);

    if (session) {
        await logAuthEvent(supabase, {
            hotel_id: session.hotel_id, user_id: session.user_id,
            event_type: "logout",
            ip_address: ip, user_agent: ua,
            metadata: { session_id: session.id },
        });
    }

    return json({ success: true });
}

// ------------------------------------------------------------------
// Main Router
// ------------------------------------------------------------------

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return error("Method not allowed", 405);
    }

    try {
        const url = new URL(req.url);
        const path = url.pathname.split("/").pop();
        const supabase = getSupabaseAdmin();

        switch (path) {
            case "login":
                return await handleLogin(req, supabase);
            case "refresh":
                return await handleRefresh(req, supabase);
            case "logout":
                return await handleLogout(req, supabase);
            default:
                return error("Endpoint not found", 404);
        }
    } catch (err: any) {
        console.error("Internal Error:", err);
        return error("Internal server error", 500);
    }
});
