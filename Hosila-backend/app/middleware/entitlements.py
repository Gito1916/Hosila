"""
Subscription entitlement middleware for the hotel product.

Provides FastAPI dependencies that enforce subscription status and feature
access by calling the SQL helper functions — no duplicated business logic.
"""

from fastapi import Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.tenant import TenantContext, get_tenant


def require_feature(feature_key: str):
    """
    Dependency factory: blocks the request if the hotel lacks the feature.

    Calls SQL ``has_feature()`` which handles:
    - Trial expiry
    - Grace period
    - Override checks
    - Entitlement JSONB lookup
    """

    async def _check(
        tenant: TenantContext = Depends(get_tenant),
        db: AsyncSession = Depends(get_db),
    ) -> TenantContext:
        result = await db.execute(
            text("SELECT has_feature(CAST(:hid AS uuid), :key)"),
            {"hid": tenant.hotel_id, "key": feature_key},
        )
        allowed = result.scalar()
        if not allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Your current plan does not include '{feature_key}'. Please upgrade to access this feature.",
            )
        return tenant

    return _check


def require_writable(*, allow_restricted: bool = False):
    """
    Dependency factory: blocks write operations when subscription is inactive.

    Calls SQL ``subscription_write_mode()`` which returns:
    - ``'full'``       → trialing / active / past_due
    - ``'restricted'`` → inactive / cancelled (5-room cap, checkout-only)
    - ``'blocked'``    → no subscription row

    If *allow_restricted* is True, the restricted-mode operations (checkout,
    payment, extend stay) are permitted.
    """

    async def _check(
        tenant: TenantContext = Depends(get_tenant),
        db: AsyncSession = Depends(get_db),
    ) -> TenantContext:
        result = await db.execute(
            text("SELECT subscription_write_mode(CAST(:hid AS uuid))"),
            {"hid": tenant.hotel_id},
        )
        mode = result.scalar() or "blocked"
        if mode == "full":
            return tenant
        if mode == "restricted" and allow_restricted:
            return tenant
        raise HTTPException(
            status_code=403,
            detail="Your subscription is inactive. Please renew to continue using this feature.",
        )

    return _check


async def get_subscription_context(
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Returns the full subscription state for the tenant's hotel.
    Used by the tenant-facing ``GET /subscriptions/current`` endpoint.
    """
    result = await db.execute(
        text("""
            SELECT
                hs.plan_code,
                effective_subscription_status(hs.hotel_id)        AS effective_status,
                subscription_write_mode(hs.hotel_id)              AS write_mode,
                hs.billing_interval,
                hs.currency,
                hs.unit_amount,
                hs.trial_starts_at,
                hs.trial_ends_at,
                hs.activated_at,
                hs.current_period_starts_at,
                hs.current_period_ends_at,
                hs.next_due_at,
                hs.feature_entitlements,
                hs.status                                         AS stored_status,
                (SELECT COUNT(*) FROM rooms r WHERE r.hotel_id = hs.hotel_id)
                    AS rooms_used,
                (SELECT COUNT(*) FROM bookings b WHERE b.hotel_id = hs.hotel_id AND b.status = 'active')
                    AS active_bookings
            FROM hotel_subscriptions hs
            WHERE hs.hotel_id = CAST(:hid AS uuid)
        """),
        {"hid": tenant.hotel_id},
    )
    row = result.mappings().first()

    if not row:
        return {
            "hotel_id": tenant.hotel_id,
            "plan_code": "starter",
            "effective_status": "inactive",
            "write_mode": "restricted",
            "billing_interval": "monthly",
            "currency": "NGN",
            "unit_amount": 0,
            "feature_entitlements": {},
            "rooms_used": 0,
            "rooms_limit": 15,
            "active_bookings": 0,
        }

    entitlements = dict(row["feature_entitlements"] or {})
    rooms_limit = entitlements.get("rooms_limit")

    return {
        "hotel_id": tenant.hotel_id,
        "plan_code": row["plan_code"],
        "effective_status": row["effective_status"],
        "write_mode": row["write_mode"],
        "billing_interval": row["billing_interval"],
        "currency": row["currency"],
        "unit_amount": float(row["unit_amount"] or 0),
        "trial_starts_at": row["trial_starts_at"],
        "trial_ends_at": row["trial_ends_at"],
        "activated_at": row["activated_at"],
        "current_period_starts_at": row["current_period_starts_at"],
        "current_period_ends_at": row["current_period_ends_at"],
        "next_due_at": row["next_due_at"],
        "feature_entitlements": entitlements,
        "rooms_used": int(row["rooms_used"]),
        "rooms_limit": rooms_limit,
        "active_bookings": int(row["active_bookings"]),
    }
