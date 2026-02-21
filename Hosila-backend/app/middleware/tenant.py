"""
Multi-tenant middleware.
After authentication, resolves the hotel_id for the current user
by querying the hotels table where tenant_id matches the auth user.
"""

from fastapi import Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import AuthenticatedUser, get_current_user


class TenantContext:
    """Holds the resolved tenant (hotel) context for a request."""

    def __init__(self, hotel_id: str, user_id: str, hotel_name: str | None = None):
        self.hotel_id = hotel_id
        self.user_id = user_id
        self.hotel_name = hotel_name


async def get_tenant(
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantContext:
    """
    FastAPI dependency — resolves hotel_id from authenticated user.
    Every hotel-scoped endpoint should depend on this.

    Usage:
        @router.get("/something")
        async def something(tenant: TenantContext = Depends(get_tenant)):
            # tenant.hotel_id is available
            ...
    """
    result = await db.execute(
        text("SELECT id, name FROM hotels WHERE tenant_id = :uid LIMIT 1"),
        {"uid": user.user_id},
    )
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=403,
            detail="No hotel found for this account. Please complete onboarding.",
        )

    return TenantContext(
        hotel_id=str(row.id),
        user_id=user.user_id,
        hotel_name=row.name,
    )
