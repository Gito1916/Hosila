"""
Tax engine API routes.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.tenant import TenantContext, get_tenant
from app.middleware.rate_limit import rate_limit_dependency
from app.modules.tax_engine import service
from app.modules.tax_engine.schemas import (
    TaxCalculationRequest,
    TaxCalculationResponse,
    TaxSettingsListResponse,
    TaxSettingsRead,
    TaxSettingsUpdate,
)

router = APIRouter(prefix="/tax", tags=["Tax Engine"])


@router.post(
    "/calculate",
    response_model=TaxCalculationResponse,
    summary="Calculate tax breakdown",
    description="Calculate full tax breakdown (SC + VAT + TDL) for a given base amount and department.",
)
async def calculate_tax(
    request: TaxCalculationRequest,
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    return await service.calculate_tax_breakdown(db, tenant.hotel_id, request)


@router.get(
    "/settings",
    response_model=TaxSettingsListResponse,
    summary="Get all tax settings",
    description="Returns tax settings for all departments configured for this hotel.",
)
async def get_settings(
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    settings_list = await service.get_all_tax_settings(db, tenant.hotel_id)
    return TaxSettingsListResponse(settings=settings_list)


@router.put(
    "/settings/{department}",
    response_model=TaxSettingsRead,
    summary="Update tax settings for a department",
    description="Update or create tax settings for a specific department (accommodation, restaurant, other_services, all).",
    dependencies=[Depends(rate_limit_dependency)],
)
async def update_settings(
    department: str,
    data: TaxSettingsUpdate,
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    return await service.upsert_tax_settings(db, tenant.hotel_id, department, data)
