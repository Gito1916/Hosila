"""
Internal admin API routes.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.modules.internal_admin import service
from app.modules.internal_admin.schemas import (
    ActivatePlanRequest,
    AddOverrideRequest,
    AdminMeResponse,
    HotelDetailResponse,
    HotelHistoryResponse,
    HotelListResponse,
    MarkInactiveRequest,
    RenewPlanRequest,
    StartTrialRequest,
)

router = APIRouter(prefix="/internal-admin", tags=["Internal Admin"])


async def get_platform_admin(
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> service.PlatformAdminContext:
    return await service.get_platform_admin_context(db, user.user_id, user.email)


@router.get("/me", response_model=AdminMeResponse)
async def me(
    admin: service.PlatformAdminContext = Depends(get_platform_admin),
):
    return await service.get_admin_me(admin)


@router.get("/hotels", response_model=HotelListResponse)
async def hotels(
    query: str | None = Query(None),
    status: str | None = Query(None),
    plan_code: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _: service.PlatformAdminContext = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_hotels(
        db,
        query=query,
        status=status,
        plan_code=plan_code,
        limit=limit,
        offset=offset,
    )


@router.get("/hotels/{hotel_id}", response_model=HotelDetailResponse)
async def hotel_detail(
    hotel_id: str,
    _: service.PlatformAdminContext = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_hotel_detail(db, hotel_id)


@router.get("/hotels/{hotel_id}/history", response_model=HotelHistoryResponse)
async def hotel_history(
    hotel_id: str,
    _: service.PlatformAdminContext = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_hotel_history(db, hotel_id)


@router.post("/hotels/{hotel_id}/start-trial", response_model=HotelDetailResponse)
async def start_trial(
    hotel_id: str,
    request: StartTrialRequest,
    admin: service.PlatformAdminContext = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.start_trial(db, hotel_id, admin, request.model_dump())


@router.post("/hotels/{hotel_id}/activate-plan", response_model=HotelDetailResponse)
async def activate_plan(
    hotel_id: str,
    request: ActivatePlanRequest,
    admin: service.PlatformAdminContext = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.activate_plan(db, hotel_id, admin, request.model_dump())


@router.post("/hotels/{hotel_id}/renew", response_model=HotelDetailResponse)
async def renew(
    hotel_id: str,
    request: RenewPlanRequest,
    admin: service.PlatformAdminContext = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.renew_plan(db, hotel_id, admin, request.model_dump())


@router.post("/hotels/{hotel_id}/mark-inactive", response_model=HotelDetailResponse)
async def mark_inactive(
    hotel_id: str,
    request: MarkInactiveRequest,
    admin: service.PlatformAdminContext = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.mark_inactive(db, hotel_id, admin, request.model_dump())


@router.post("/hotels/{hotel_id}/overrides", response_model=HotelDetailResponse)
async def add_override(
    hotel_id: str,
    request: AddOverrideRequest,
    admin: service.PlatformAdminContext = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.add_override(db, hotel_id, admin, request.model_dump())
