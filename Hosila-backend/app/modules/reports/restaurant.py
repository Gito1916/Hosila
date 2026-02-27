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
    RestaurantDailySalesRow,
    RestaurantMonthlySalesRow,
    RestaurantTransactionRow,
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


# ── V2 Daily Sales ───────────────────────────────────────────

async def get_restaurant_daily_sales(
    db: AsyncSession,
    hotel_id: str,
    start: date,
    end: date,
) -> dict:
    """
    Daily restaurant sales with food/drinks split.
    Uses generate_series so zero-activity days still appear.
    Returns dict with 'rows', 'total_revenue', 'average_daily_revenue'.
    """
    start_ts, end_ts = date_range_to_timestamps(start, end)

    result = await db.execute(
        text("""
            WITH date_spine AS (
                SELECT d::date AS day
                FROM generate_series(:start_date::date, :end_date::date, '1 day') AS d
            )
            SELECT
                ds.day,
                COUNT(DISTINCT so.order_number) AS orders,
                COALESCE(SUM(CASE
                    WHEN COALESCE(s.category, ii.category, 'other') = 'food'
                    THEN so.total_price ELSE 0
                END), 0) AS food_revenue,
                COALESCE(SUM(CASE
                    WHEN COALESCE(s.category, ii.category, 'other') IN ('beverage', 'beverages')
                    THEN so.total_price ELSE 0
                END), 0) AS drinks_revenue,
                COALESCE(SUM(so.total_price), 0) AS total_revenue
            FROM date_spine ds
            LEFT JOIN service_orders so
                ON so.hotel_id = :hotel_id
               AND so.status != 'cancelled'
               AND DATE(so.ordered_at) = ds.day
            LEFT JOIN services s ON s.id::text = so.service_id
            LEFT JOIN inventory_items ii ON 'inv_' || ii.id::text = so.service_id
            GROUP BY ds.day
            ORDER BY ds.day
        """),
        {
            "hotel_id": hotel_id,
            "start_date": start,
            "end_date": end,
        },
    )
    raw_rows = result.mappings().all()

    rows = []
    total_revenue = Decimal("0")
    for row in raw_rows:
        rev = Decimal(str(row["total_revenue"]))
        rows.append(RestaurantDailySalesRow(
            date=row["day"],
            orders=int(row["orders"]),
            food_revenue=Decimal(str(row["food_revenue"])),
            drinks_revenue=Decimal(str(row["drinks_revenue"])),
            total_revenue=rev,
        ))
        total_revenue += rev

    days_count = len(rows) or 1
    avg_daily = (total_revenue / Decimal(days_count)).quantize(TWO_PLACES, ROUND_HALF_UP)

    return {
        "rows": rows,
        "total_revenue": total_revenue,
        "average_daily_revenue": avg_daily,
    }


# ── V2 Monthly Sales ─────────────────────────────────────────

async def get_restaurant_monthly_sales(
    db: AsyncSession,
    hotel_id: str,
    start: date,
    end: date,
) -> dict:
    """
    Monthly restaurant sales (one row per month).
    Aggregates from the daily sales internally.
    Returns dict with 'rows', 'total_revenue', 'average_monthly_revenue'.
    """
    daily = await get_restaurant_daily_sales(db, hotel_id, start, end)

    monthly_buckets: dict[str, dict] = {}
    for row in daily["rows"]:
        month_key = row.date.strftime("%Y-%m")
        if month_key not in monthly_buckets:
            monthly_buckets[month_key] = {
                "orders": 0,
                "food_revenue": Decimal("0"),
                "drinks_revenue": Decimal("0"),
                "total_revenue": Decimal("0"),
            }
        bucket = monthly_buckets[month_key]
        bucket["orders"] += row.orders
        bucket["food_revenue"] += row.food_revenue
        bucket["drinks_revenue"] += row.drinks_revenue
        bucket["total_revenue"] += row.total_revenue

    rows = []
    total_revenue = Decimal("0")
    for month_key in sorted(monthly_buckets):
        b = monthly_buckets[month_key]
        rows.append(RestaurantMonthlySalesRow(
            month=month_key,
            orders=b["orders"],
            food_revenue=b["food_revenue"],
            drinks_revenue=b["drinks_revenue"],
            total_revenue=b["total_revenue"],
        ))
        total_revenue += b["total_revenue"]

    months_count = len(rows) or 1
    avg_monthly = (total_revenue / Decimal(months_count)).quantize(TWO_PLACES, ROUND_HALF_UP)

    return {
        "rows": rows,
        "total_revenue": total_revenue,
        "average_monthly_revenue": avg_monthly,
    }


# ── V2 Day Transactions ──────────────────────────────────────

async def get_restaurant_day_transactions(
    db: AsyncSession,
    hotel_id: str,
    report_date: date,
) -> list[RestaurantTransactionRow]:
    """
    Transaction-level detail for a single day: service_orders joined to
    services/inventory_items and bookings/rooms.
    """
    start_ts, end_ts = date_range_to_timestamps(report_date, report_date)

    result = await db.execute(
        text("""
            SELECT
                so.ordered_at AS time,
                COALESCE(so.order_number, '') AS order_number,
                COALESCE(r.room_number, '') AS guest_room,
                COALESCE(s.name, ii.name, 'Unknown') AS item_name,
                COALESCE(s.category, ii.category, 'other') AS category,
                so.quantity,
                so.unit_price,
                so.total_price AS line_total,
                so.status
            FROM service_orders so
            LEFT JOIN services s ON s.id::text = so.service_id
            LEFT JOIN inventory_items ii ON 'inv_' || ii.id::text = so.service_id
            LEFT JOIN bookings b ON so.booking_id = b.id
            LEFT JOIN rooms r ON b.room_id = r.id
            WHERE so.hotel_id = :hotel_id
              AND so.status != 'cancelled'
              AND so.ordered_at >= :start_ts
              AND so.ordered_at < :end_ts
            ORDER BY so.ordered_at
        """),
        {
            "hotel_id": hotel_id,
            "start_ts": start_ts,
            "end_ts": end_ts,
        },
    )

    return [
        RestaurantTransactionRow(
            time=row["time"],
            order_number=row["order_number"],
            guest_room=row["guest_room"],
            item_name=row["item_name"],
            category=row["category"],
            quantity=int(row["quantity"]),
            unit_price=Decimal(str(row["unit_price"])),
            line_total=Decimal(str(row["line_total"])),
            status=row["status"],
        )
        for row in result.mappings().all()
    ]
