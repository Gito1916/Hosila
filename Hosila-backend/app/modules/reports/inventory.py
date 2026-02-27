"""
Inventory movement report — opening/closing stock, purchases, usage, wastage.
Proper stock accounting: Opening + Purchases - Usage - Wastage = Closing.
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime, time
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.reports.schemas import InventoryReport, InventoryItemReport

TWO_PLACES = Decimal("0.01")


async def generate_inventory_report(
    db: AsyncSession,
    hotel_id: str,
    start: date,
    end: date,
) -> InventoryReport:
    """
    Generate inventory movement report.

    For each item:
      Opening Stock = total adds before period - total deductions before period
      Purchases     = adds within period (source = 'restock')
      Usage         = deductions within period (source != 'loss')
      Wastage       = deductions within period (source = 'loss')
      Closing Stock = Opening + Purchases - Usage - Wastage
    """

    # Build proper datetime range for asyncpg
    start_dt = datetime.combine(start, time.min)
    end_dt = datetime.combine(end, time(23, 59, 59))

    # Get all inventory items
    items_result = await db.execute(
        text("""
            SELECT id, name, category, unit_type, unit_cost, current_stock
            FROM inventory_items
            WHERE hotel_id = :hotel_id
            ORDER BY category, name
        """),
        {"hotel_id": hotel_id},
    )
    items = items_result.mappings().all()

    report_items: list[InventoryItemReport] = []
    total_opening = Decimal("0")
    total_closing = Decimal("0")
    total_purchases = Decimal("0")
    total_usage = Decimal("0")

    for item in items:
        item_id = str(item["id"])
        unit_cost = Decimal(str(item["unit_cost"]))
        current_stock = int(item["current_stock"])

        # Opening stock: work backwards from current_stock
        # Opening = current_stock - (adds since period start) + (deducts since period start)
        # This handles items whose initial stock was set without a movement record
        net_change_result = await db.execute(
            text("""
                SELECT
                    COALESCE(SUM(CASE WHEN movement_type = 'add' THEN quantity ELSE 0 END), 0) as total_adds,
                    COALESCE(SUM(CASE WHEN movement_type = 'deduct' THEN quantity ELSE 0 END), 0) as total_deducts
                FROM inventory_movements
                WHERE item_id = :item_id
                  AND hotel_id = :hotel_id
                  AND movement_time >= :start_ts
            """),
            {"item_id": item_id, "hotel_id": hotel_id, "start_ts": start_dt},
        )
        net_row = net_change_result.mappings().first()
        adds_since = int(net_row["total_adds"])
        deducts_since = int(net_row["total_deducts"])
        opening_stock = current_stock - adds_since + deducts_since

        # Period movements
        period_result = await db.execute(
            text("""
                SELECT
                    COALESCE(SUM(CASE
                        WHEN movement_type = 'add' AND source = 'restock' THEN quantity
                        ELSE 0 END), 0) as purchases,
                    COALESCE(SUM(CASE
                        WHEN movement_type = 'deduct' AND source != 'loss' THEN quantity
                        ELSE 0 END), 0) as usage,
                    COALESCE(SUM(CASE
                        WHEN movement_type = 'deduct' AND source = 'loss' THEN quantity
                        ELSE 0 END), 0) as wastage
                FROM inventory_movements
                WHERE item_id = :item_id
                  AND hotel_id = :hotel_id
                  AND movement_time >= :start_ts
                  AND movement_time < :end_ts
            """),
            {
                "item_id": item_id,
                "hotel_id": hotel_id,
                "start_ts": start_dt,
                "end_ts": end_dt,
            },
        )
        period = period_result.mappings().first()
        purchases = int(period["purchases"])
        usage = int(period["usage"])
        wastage = int(period["wastage"])
        closing_stock = opening_stock + purchases - usage - wastage

        item_report = InventoryItemReport(
            item_id=item_id,
            item_name=item["name"],
            category=item["category"],
            unit_type=item["unit_type"],
            opening_stock=opening_stock,
            purchases=purchases,
            usage=usage,
            wastage=wastage,
            closing_stock=closing_stock,
            unit_cost=unit_cost,
            total_value=(Decimal(closing_stock) * unit_cost).quantize(TWO_PLACES, ROUND_HALF_UP),
        )
        report_items.append(item_report)

        total_opening += Decimal(opening_stock) * unit_cost
        total_closing += Decimal(closing_stock) * unit_cost
        total_purchases += Decimal(purchases) * unit_cost
        total_usage += Decimal(usage) * unit_cost

    return InventoryReport(
        period_start=start,
        period_end=end,
        items=report_items,
        total_opening_value=total_opening.quantize(TWO_PLACES, ROUND_HALF_UP),
        total_closing_value=total_closing.quantize(TWO_PLACES, ROUND_HALF_UP),
        total_purchases_value=total_purchases.quantize(TWO_PLACES, ROUND_HALF_UP),
        total_usage_value=total_usage.quantize(TWO_PLACES, ROUND_HALF_UP),
    )
