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
from app.modules.reports.report_period import resolve_export_mode
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
    hotel_name = tenant.hotel_name or "Hotel"

    if format == "pdf":
        content = export.generate_accommodation_pdf(report, hotel_name)
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=accommodation_report_{start}_{end}.pdf"},
        )
    else:
        content = export.generate_accommodation_excel(report, hotel_name)
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


# ── V2 Period-Aware Exports ───────────────────────────────────

@router.get("/accommodation/export-v2")
async def export_accommodation_v2(
    start: date = Query(..., description="Period start date (YYYY-MM-DD)"),
    end: date = Query(..., description="Period end date (YYYY-MM-DD)"),
    mode: str = Query("auto", pattern=r"^(auto|daily_transactions|daily_summary|monthly_summary)$"),
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """
    Period-aware accommodation export.
    - Daily (start == end): transaction-level detail
    - Weekly/Monthly (≤31 days): daily summary
    - Yearly (>31 days): monthly summary
    """
    resolved = resolve_export_mode(start, end, mode)
    hotel_name = tenant.hotel_name or "Hotel"

    if resolved == "daily_transactions":
        rows = await accommodation.get_accommodation_day_transactions(db, tenant.hotel_id, start)
        content = export.generate_accommodation_transactions_excel(rows, hotel_name, str(start))
        filename = f"accommodation_transactions_{start}.xlsx"

    elif resolved == "daily_summary":
        data = await accommodation.get_accommodation_daily_summary(db, tenant.hotel_id, start, end)
        content = export.generate_accommodation_daily_summary_excel(
            data["rows"], data["total_revenue"], data["average_daily_revenue"],
            hotel_name, str(start), str(end),
        )
        filename = f"accommodation_daily_{start}_{end}.xlsx"

    else:  # monthly_summary
        data = await accommodation.get_accommodation_monthly_summary(db, tenant.hotel_id, start, end)
        content = export.generate_accommodation_monthly_summary_excel(
            data["rows"], data["total_revenue"], data["average_monthly_revenue"],
            hotel_name, str(start), str(end),
        )
        filename = f"accommodation_monthly_{start}_{end}.xlsx"

    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/restaurant/export-v2")
async def export_restaurant_v2(
    start: date = Query(..., description="Period start date (YYYY-MM-DD)"),
    end: date = Query(..., description="Period end date (YYYY-MM-DD)"),
    mode: str = Query("auto", pattern=r"^(auto|daily_transactions|daily_summary|monthly_summary)$"),
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """
    Period-aware restaurant export.
    - Daily (start == end): transaction-level detail
    - Weekly/Monthly (≤31 days): daily summary with food/drinks split
    - Yearly (>31 days): monthly summary
    """
    resolved = resolve_export_mode(start, end, mode)
    hotel_name = tenant.hotel_name or "Hotel"

    if resolved == "daily_transactions":
        rows = await restaurant.get_restaurant_day_transactions(db, tenant.hotel_id, start)
        content = export.generate_restaurant_transactions_excel(rows, hotel_name, str(start))
        filename = f"restaurant_transactions_{start}.xlsx"

    elif resolved == "daily_summary":
        data = await restaurant.get_restaurant_daily_sales(db, tenant.hotel_id, start, end)
        content = export.generate_restaurant_daily_sales_excel(
            data["rows"], data["total_revenue"], data["average_daily_revenue"],
            hotel_name, str(start), str(end),
        )
        filename = f"restaurant_daily_{start}_{end}.xlsx"

    else:  # monthly_summary
        data = await restaurant.get_restaurant_monthly_sales(db, tenant.hotel_id, start, end)
        content = export.generate_restaurant_monthly_sales_excel(
            data["rows"], data["total_revenue"], data["average_monthly_revenue"],
            hotel_name, str(start), str(end),
        )
        filename = f"restaurant_monthly_{start}_{end}.xlsx"

    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
