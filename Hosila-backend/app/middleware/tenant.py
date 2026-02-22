"""
Multi-tenant middleware.
After authentication, resolves the hotel_id for the current user
by querying the hotels table where tenant_id matches the auth user,
and optionally the org context from org_members.

Supports:
- Legacy single-hotel tenancy (hotel.tenant_id = auth user)
- Organisation-based multi-hotel access (via org_members)
- Hotel switching via X-Hotel-Id header (validated against accessible hotels)
"""

from fastapi import Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import AuthenticatedUser, get_current_user


class TenantContext:
    """Holds the resolved tenant (hotel) context for a request."""

    def __init__(
        self,
        hotel_id: str,
        user_id: str,
        hotel_name: str | None = None,
        org_id: str | None = None,
        org_role: str | None = None,
        accessible_hotel_ids: list[str] | None = None,
    ):
        self.hotel_id = hotel_id
        self.user_id = user_id
        self.hotel_name = hotel_name
        self.org_id = org_id
        self.org_role = org_role
        self.accessible_hotel_ids = accessible_hotel_ids or [hotel_id]

    @property
    def is_org_owner(self) -> bool:
        return self.org_role == "org_owner"

    @property
    def is_org_level(self) -> bool:
        return self.org_role in ("org_owner", "org_admin")


async def get_tenant(
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantContext:
    """
    FastAPI dependency — resolves hotel_id from authenticated user.
    Every hotel-scoped endpoint should depend on this.

    Supports:
    - Legacy path: hotels.tenant_id = user
    - Org path: org_members → hotels.org_id
    - Hotel switching: X-Hotel-Id header (validated)

    Usage:
        @router.get("/something")
        async def something(tenant: TenantContext = Depends(get_tenant)):
            # tenant.hotel_id is available
            ...
    """
    uid = user.user_id

    # ── 1. Resolve org membership (if any) ───────────────────────
    org_result = await db.execute(
        text("""
            SELECT om.org_id, om.role, om.hotel_id as scoped_hotel_id
            FROM org_members om
            WHERE om.user_id = :uid
            LIMIT 1
        """),
        {"uid": uid},
    )
    org_row = org_result.first()

    org_id: str | None = None
    org_role: str | None = None

    if org_row:
        org_id = str(org_row.org_id)
        org_role = org_row.role

    # ── 2. Build list of accessible hotel IDs ────────────────────
    hotels_result = await db.execute(
        text("""
            SELECT DISTINCT h.id, h.name FROM hotels h
            LEFT JOIN org_members om ON om.org_id = h.org_id AND om.user_id = :uid
            WHERE h.tenant_id = :uid
               OR (om.user_id = :uid AND (om.hotel_id IS NULL OR om.hotel_id = h.id))
        """),
        {"uid": uid},
    )
    hotels = hotels_result.fetchall()

    if not hotels:
        raise HTTPException(
            status_code=403,
            detail="No hotel found for this account. Please complete onboarding.",
        )

    accessible_ids = [str(h.id) for h in hotels]

    # ── 3. Determine active hotel_id ─────────────────────────────
    # Check for X-Hotel-Id header (hotel switching)
    requested_hotel_id = request.headers.get("X-Hotel-Id")

    if requested_hotel_id:
        if requested_hotel_id not in accessible_ids:
            raise HTTPException(
                status_code=403,
                detail="You do not have access to the requested hotel.",
            )
        active_hotel_id = requested_hotel_id
    else:
        # Default to first accessible hotel
        active_hotel_id = accessible_ids[0]

    # Resolve hotel name
    active_hotel_name = None
    for h in hotels:
        if str(h.id) == active_hotel_id:
            active_hotel_name = h.name
            break

    return TenantContext(
        hotel_id=active_hotel_id,
        user_id=uid,
        hotel_name=active_hotel_name,
        org_id=org_id,
        org_role=org_role,
        accessible_hotel_ids=accessible_ids,
    )
