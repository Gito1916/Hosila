"""
Restaurant sales analysis — item-level revenue, margins, top/bottom sellers.
All calculations done server-side via SQL aggregation.
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.reports.schemas import (
    RestaurantReport,
    MenuItemSales,
    PaymentMethodSplit,
    DailyRevenue,
)
from app.shared.date_utils import date_range_to_timestamps

TWO_PLACES = Decimal("0.01")


async def generate_restaurant_report(
    db: AsyncSession,
    hotel_id: str,
    start: date,
    end: date,
) -> RestaurantReport:
    """Generate restaurant sales analysis report."""

    start_ts, end_ts = date_range_to_timestamps(start, end)

    # ── Item-level sales ──────────────────────────
    # service_orders.service_id is text and can be either:
    #   - a plain UUID matching services.id  (menu items)
    #   - "inv_<uuid>" matching inventory_items.id (beverages from inventory)
    items_result = await db.execute(
        text("""
            SELECT
                COALESCE(s.name, ii.name, 'Unknown') as item_name,
                COALESCE(s.category, ii.category, 'other') as category,
                COALESCE(s.cost_price, ii.unit_cost, 0) as cost_price,
                SUM(so.quantity) as quantity_sold,
                SUM(so.total_price) as revenue
            FROM service_orders so
            LEFT JOIN services s ON s.id::text = so.service_id
            LEFT JOIN inventory_items ii ON 'inv_' || ii.id::text = so.service_id
            WHERE so.hotel_id = :hotel_id
              AND so.status != 'cancelled'
              AND so.ordered_at >= :start_ts
              AND so.ordered_at < :end_ts
            GROUP BY COALESCE(s.name, ii.name, 'Unknown'),
                     COALESCE(s.category, ii.category, 'other'),
                     COALESCE(s.cost_price, ii.unit_cost, 0)
            ORDER BY revenue DESC
        """),
        {
            "hotel_id": hotel_id,
            "start_ts": start_ts,
            "end_ts": end_ts,
        },
    )
    item_rows = items_result.mappings().all()

    all_items: list[MenuItemSales] = []
    total_revenue = Decimal("0")

    for row in item_rows:
        rev = Decimal(str(row["revenue"]))
        qty = int(row["quantity_sold"])
        cost = Decimal(str(row["cost_price"]))
        total_cost = cost * qty
        margin = rev - total_cost if cost > 0 else None
        margin_pct = ((margin / rev) * 100).quantize(TWO_PLACES, ROUND_HALF_UP) if margin and rev > 0 else None

        all_items.append(MenuItemSales(
            item_name=row["item_name"],
            category=row["category"],
            quantity_sold=qty,
            revenue=rev,
            cost_price=cost if cost > 0 else None,
            gross_margin=margin,
            margin_percent=margin_pct,
        ))
        total_revenue += rev

    top_sellers = all_items[:10]
    bottom_sellers = list(reversed(all_items[-10:])) if len(all_items) > 10 else []

    # ── Total order count ─────────────────────────
    order_count_result = await db.execute(
        text("""
            SELECT COUNT(DISTINCT order_number) as total_orders
            FROM service_orders
            WHERE hotel_id = :hotel_id
              AND status != 'cancelled'
              AND ordered_at >= :start_ts
              AND ordered_at < :end_ts
        """),
        {
            "hotel_id": hotel_id,
            "start_ts": start_ts,
            "end_ts": end_ts,
        },
    )
    total_orders = order_count_result.scalar() or 0
    avg_order_value = (total_revenue / Decimal(total_orders)).quantize(
        TWO_PLACES, ROUND_HALF_UP
    ) if total_orders > 0 else Decimal("0")

    # ── Payment method split ──────────────────────
    # Restaurant payments are tracked via charges + payments
    payment_result = await db.execute(
        text("""
            SELECT
                t.payment_method as method,
                SUM(t.amount) as amount,
                COUNT(*) as count
            FROM transactions t
            WHERE t.hotel_id = :hotel_id
              AND t.source = 'restaurant'
              AND t.type = 'income'
              AND t.date >= :start_ts
              AND t.date < :end_ts
            GROUP BY t.payment_method
        """),
        {
            "hotel_id": hotel_id,
            "start_ts": start_ts,
            "end_ts": end_ts,
        },
    )
    payment_split = [
        PaymentMethodSplit(
            method=row["method"],
            amount=Decimal(str(row["amount"])),
            count=int(row["count"]),
        )
        for row in payment_result.mappings().all()
    ]

    # ── Daily breakdown ───────────────────────────
    daily_result = await db.execute(
        text("""
            SELECT
                DATE(ordered_at) as order_date,
                SUM(total_price) as revenue,
                COUNT(DISTINCT order_number) as order_count
            FROM service_orders
            WHERE hotel_id = :hotel_id
              AND status != 'cancelled'
              AND ordered_at >= :start_ts
              AND ordered_at < :end_ts
            GROUP BY DATE(ordered_at)
            ORDER BY order_date
        """),
        {
            "hotel_id": hotel_id,
            "start_ts": start_ts,
            "end_ts": end_ts,
        },
    )
    daily_breakdown = [
        DailyRevenue(
            date=row["order_date"],
            revenue=Decimal(str(row["revenue"])),
            order_count=int(row["order_count"]),
        )
        for row in daily_result.mappings().all()
    ]

    # ── Tax collected ─────────────────────────────
    tax_result = await db.execute(
        text("""
            SELECT
                COALESCE(SUM(tax_amount), 0) as vat,
                COALESCE(SUM(service_charge_amount), 0) as sc,
                COALESCE(SUM(tdl_amount), 0) as tdl
            FROM charges
            WHERE hotel_id = :hotel_id
              AND department = 'restaurant'
              AND status != 'cancelled'
              AND charge_date >= :start_ts
              AND charge_date < :end_ts
        """),
        {
            "hotel_id": hotel_id,
            "start_ts": start_ts,
            "end_ts": end_ts,
        },
    )
    tax_row = tax_result.mappings().first()

    return RestaurantReport(
        period_start=start,
        period_end=end,
        total_revenue=total_revenue,
        total_orders=total_orders,
        average_order_value=avg_order_value,
        top_sellers=top_sellers,
        bottom_sellers=bottom_sellers,
        all_items=all_items,
        payment_split=payment_split,
        daily_breakdown=daily_breakdown,
        tax_collected=Decimal(str(tax_row["vat"])) + Decimal(str(tax_row["tdl"])) if tax_row else Decimal("0"),
        service_charge_collected=Decimal(str(tax_row["sc"])) if tax_row else Decimal("0"),
    )
