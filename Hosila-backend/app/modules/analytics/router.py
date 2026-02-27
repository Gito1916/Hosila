"""
Analytics API routes — aggregated KPIs for the financial dashboard.
"""

from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.middleware.tenant import TenantContext, get_tenant
from app.shared.date_utils import date_range_to_timestamps

router = APIRouter(prefix="/analytics", tags=["Analytics"])


class DashboardKPIs(BaseModel):
    total_revenue: Decimal
    total_expenses: Decimal
    net_profit: Decimal
    profit_margin: Decimal
    accommodation_revenue: Decimal
    restaurant_revenue: Decimal
    other_revenue: Decimal
    total_vat_collected: Decimal
    total_tdl_collected: Decimal
    total_service_charge: Decimal
    active_bookings: int
    total_guests: int


@router.get("/dashboard", response_model=DashboardKPIs)
async def get_dashboard_kpis(
    start: date = Query(...),
    end: date = Query(...),
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated financial KPIs for the dashboard."""

    start_ts, end_ts = date_range_to_timestamps(start, end)

    # Revenue by department
    rev_result = await db.execute(
        text("""
            SELECT
                COALESCE(SUM(CASE WHEN department = 'accommodation' THEN gross_amount ELSE 0 END), 0) as accom_rev,
                COALESCE(SUM(CASE WHEN department = 'restaurant' THEN gross_amount ELSE 0 END), 0) as rest_rev,
                COALESCE(SUM(CASE WHEN department = 'other_services' THEN gross_amount ELSE 0 END), 0) as other_rev,
                COALESCE(SUM(gross_amount), 0) as total_rev
            FROM charges
            WHERE hotel_id = :hotel_id AND status = 'active'
              AND charge_date >= :start_ts
              AND charge_date < :end_ts
        """),
        {"hotel_id": tenant.hotel_id, "start_ts": start_ts, "end_ts": end_ts},
    )
    rev = rev_result.mappings().first()

    # Expenses
    exp_result = await db.execute(
        text("""
            SELECT COALESCE(SUM(amount), 0) as total_expenses
            FROM expenses
            WHERE hotel_id = :hotel_id
              AND date >= :start_ts
              AND date < :end_ts
        """),
        {"hotel_id": tenant.hotel_id, "start_ts": start_ts, "end_ts": end_ts},
    )
    expenses = Decimal(str(exp_result.scalar() or 0))

    # Tax totals
    tax_result = await db.execute(
        text("""
            SELECT
                COALESCE(SUM(CASE WHEN tax_type = 'vat' THEN tax_amount ELSE 0 END), 0) as vat,
                COALESCE(SUM(CASE WHEN tax_type = 'tdl' THEN tax_amount ELSE 0 END), 0) as tdl,
                COALESCE(SUM(CASE WHEN tax_type = 'service_charge' THEN tax_amount ELSE 0 END), 0) as sc
            FROM tax_transactions
            WHERE hotel_id = :hotel_id
              AND transaction_date >= :start_ts
              AND transaction_date < :end_ts
        """),
        {"hotel_id": tenant.hotel_id, "start_ts": start_ts, "end_ts": end_ts},
    )
    tax = tax_result.mappings().first()

    # Active bookings
    bookings_result = await db.execute(
        text("SELECT COUNT(*) FROM bookings WHERE hotel_id = :hotel_id AND status = 'active'"),
        {"hotel_id": tenant.hotel_id},
    )
    active_bookings = bookings_result.scalar() or 0

    # Total guests
    guests_result = await db.execute(
        text("SELECT COUNT(*) FROM guests WHERE hotel_id = :hotel_id"),
        {"hotel_id": tenant.hotel_id},
    )
    total_guests = guests_result.scalar() or 0

    # Safely extract revenue values (handle None results)
    accom_rev = Decimal(str(rev["accom_rev"])) if rev else Decimal("0")
    rest_rev = Decimal(str(rev["rest_rev"])) if rev else Decimal("0")
    other_rev = Decimal(str(rev["other_rev"])) if rev else Decimal("0")
    total_rev = Decimal(str(rev["total_rev"])) if rev else Decimal("0")

    net_profit = total_rev - expenses
    margin = ((net_profit / total_rev) * 100) if total_rev > 0 else Decimal("0")

    return DashboardKPIs(
        total_revenue=total_rev,
        total_expenses=expenses,
        net_profit=net_profit,
        profit_margin=margin.quantize(Decimal("0.01")),
        accommodation_revenue=accom_rev,
        restaurant_revenue=rest_rev,
        other_revenue=other_rev,
        total_vat_collected=Decimal(str(tax["vat"])) if tax else Decimal("0"),
        total_tdl_collected=Decimal(str(tax["tdl"])) if tax else Decimal("0"),
        total_service_charge=Decimal(str(tax["sc"])) if tax else Decimal("0"),
        active_bookings=active_bookings,
        total_guests=total_guests,
    )
