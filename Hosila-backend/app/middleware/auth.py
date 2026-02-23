"""
JWT authentication middleware.
Validates Supabase JWT tokens from the Authorization header.

Supports two verification strategies:
1. JWKS-based (recommended) — fetches public keys from Supabase's JWKS endpoint
2. HS256 fallback — uses the legacy JWT secret if JWKS verification fails

This means the middleware works regardless of whether the project uses
Supabase's new JWT Signing Keys or the legacy JWT secret.
"""

import httpx
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError, ExpiredSignatureError, jwk
from jose.utils import base64url_decode
from app.config import settings

security = HTTPBearer()

# ── JWKS cache ────────────────────────────────────────
_jwks_cache: dict | None = None


async def _get_jwks() -> dict:
    """Fetch and cache JWKS from Supabase."""
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache

    jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(jwks_url, timeout=5)
            resp.raise_for_status()
            _jwks_cache = resp.json()
            return _jwks_cache
        except Exception:
            return {"keys": []}


class AuthenticatedUser:
    """Represents the authenticated user extracted from the JWT."""

    def __init__(self, user_id: str, email: str | None = None, role: str | None = None):
        self.user_id = user_id
        self.email = email
        self.role = role


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthenticatedUser:
    """
    FastAPI dependency — validates the Supabase JWT and returns the user.

    Tries JWKS-based RS256 verification first (Supabase's new signing keys),
    falls back to HS256 with the legacy JWT secret.
    """
    token = credentials.credentials
    jwks_error = None
    hs256_error = None

    # ── Strategy 1: Try JWKS (RS256 / EdDSA) ────────────
    try:
        jwks = await _get_jwks()
        if jwks.get("keys"):
            # Decode header to find the kid
            header = jwt.get_unverified_header(token)
            kid = header.get("kid")
            alg = header.get("alg", "unknown")

            # Find the matching key
            available_kids = [k.get("kid") for k in jwks["keys"]]
            matching_key = None
            for key_data in jwks["keys"]:
                if key_data.get("kid") == kid:
                    matching_key = key_data
                    break

            if matching_key:
                payload = jwt.decode(
                    token,
                    matching_key,
                    algorithms=["RS256", "ES256", "EdDSA"],
                    audience="authenticated",
                )
                return _extract_user(payload)
            else:
                jwks_error = f"kid '{kid}' (alg={alg}) not in JWKS keys: {available_kids}"
        else:
            jwks_error = f"JWKS endpoint returned no keys (URL: {settings.supabase_url}/auth/v1/.well-known/jwks.json)"
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except (JWTError, Exception) as e:
        jwks_error = f"JWKS decode failed: {type(e).__name__}: {e}"

    # ── Strategy 2: HS256 with legacy JWT secret ────────
    try:
        # Check if the secret looks valid
        secret = settings.supabase_jwt_secret
        if secret in ("dev-jwt-secret", ""):
            hs256_error = "SUPABASE_JWT_SECRET is not configured (still default)"
        else:
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
            return _extract_user(payload)
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except JWTError as e:
        hs256_error = f"HS256 decode failed: {type(e).__name__}: {e}"

    # Both strategies failed — return diagnostic info
    print(f"⚠️ AUTH FAILED — JWKS: {jwks_error} | HS256: {hs256_error}")
    raise HTTPException(
        status_code=401,
        detail=f"Invalid authentication token. JWKS: {jwks_error}. HS256: {hs256_error}",
    )


def _extract_user(payload: dict) -> AuthenticatedUser:
    """Pull user info from the validated JWT payload."""
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing user ID")

    return AuthenticatedUser(
        user_id=user_id,
        email=payload.get("email"),
        role=payload.get("role"),
    )
