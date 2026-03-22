"""
Tenant-facing subscription endpoints.

These endpoints use normal hotel JWT auth (not platform-admin),
so hotel staff can see their own subscription status and plan info.
"""

from fastapi import APIRouter, Depends

from app.middleware.entitlements import get_subscription_context

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


@router.get("/current")
async def get_current_subscription(
    context: dict = Depends(get_subscription_context),
):
    """
    Returns the current hotel's subscription state including:
    - plan code, effective status, write mode
    - feature entitlements (JSONB)
    - rooms used / rooms limit
    - active bookings count
    """
    return context
