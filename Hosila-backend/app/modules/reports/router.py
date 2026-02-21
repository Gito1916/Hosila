"""
Reports API routes — accommodation, restaurant, inventory, tax remittance.
All reports support date-range filtering and export to PDF/Excel.
"""

from datetime import date
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
import io

from app.database import get_db
from app.middleware.tenant import TenantContext, get_tenant
from app.modules.reports import accommodation, restaurant, inventory, tax_remittance, export
from app.modules.reports.schemas import (
    AccommodationReport,
    RestaurantReport,
    InventoryReport,
    TaxRemittanceReport,
    MarkRemittedRequest,
    RemittanceBatchResponse,
)

router = APIRouter(prefix="/reports", tags=["Reports"])


# ── Accommodation ─────────────────────────────────────────────

@router.get("/accommodation", response_model=AccommodationReport)
async def get_accommodation_report(
    start: date = Query(..., description="Period start date (YYYY-MM-DD)"),
    end: date = Query(..., description="Period end date (YYYY-MM-DD)"),
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    return await accommodation.generate_accommodation_report(db, tenant.hotel_id, start, end)


@router.get("/accommodation/export")
async def export_accommodation_report(
    start: date = Query(...),
    end: date = Query(...),
    format: str = Query("excel", pattern=r"^(excel|pdf)$"),
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    report = await accommodation.generate_accommodation_report(db, tenant.hotel_id, start, end)
    content = export.generate_accommodation_excel(report, tenant.hotel_name or "Hotel")
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=accommodation_report_{start}_{end}.xlsx"},
    )


# ── Restaurant ────────────────────────────────────────────────

@router.get("/restaurant", response_model=RestaurantReport)
async def get_restaurant_report(
    start: date = Query(...),
    end: date = Query(...),
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    return await restaurant.generate_restaurant_report(db, tenant.hotel_id, start, end)


@router.get("/restaurant/export")
async def export_restaurant_report(
    start: date = Query(...),
    end: date = Query(...),
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    report = await restaurant.generate_restaurant_report(db, tenant.hotel_id, start, end)
    content = export.generate_restaurant_excel(report, tenant.hotel_name or "Hotel")
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=restaurant_report_{start}_{end}.xlsx"},
    )


# ── Inventory ─────────────────────────────────────────────────

@router.get("/inventory", response_model=InventoryReport)
async def get_inventory_report(
    start: date = Query(...),
    end: date = Query(...),
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    return await inventory.generate_inventory_report(db, tenant.hotel_id, start, end)


@router.get("/inventory/export")
async def export_inventory_report(
    start: date = Query(...),
    end: date = Query(...),
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    report = await inventory.generate_inventory_report(db, tenant.hotel_id, start, end)
    content = export.generate_inventory_excel(report, tenant.hotel_name or "Hotel")
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=inventory_report_{start}_{end}.xlsx"},
    )


# ── Tax Remittance ────────────────────────────────────────────

@router.get("/tax-remittance", response_model=TaxRemittanceReport)
async def get_tax_remittance_report(
    start: date = Query(...),
    end: date = Query(...),
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    return await tax_remittance.generate_tax_remittance_report(db, tenant.hotel_id, start, end)


@router.post("/tax-remittance/mark-remitted", response_model=RemittanceBatchResponse)
async def mark_tax_remitted(
    request: MarkRemittedRequest,
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    return await tax_remittance.mark_as_remitted(
        db, tenant.hotel_id, tenant.user_id, request
    )


@router.get("/tax-remittance/export")
async def export_tax_remittance(
    start: date = Query(...),
    end: date = Query(...),
    format: str = Query("pdf", pattern=r"^(pdf|excel)$"),
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    report = await tax_remittance.generate_tax_remittance_report(db, tenant.hotel_id, start, end)
    hotel_name = tenant.hotel_name or "Hotel"

    if format == "pdf":
        content = export.generate_tax_remittance_pdf(report, hotel_name)
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=tax_remittance_{start}_{end}.pdf"},
        )
    else:
        content = export.generate_tax_remittance_excel(report, hotel_name)
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=tax_remittance_{start}_{end}.xlsx"},
        )
