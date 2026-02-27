"""
Inventory movement report — opening/closing stock, purchases, usage, wastage.
Proper stock accounting: Opening + Purchases - Usage - Wastage = Closing.

Uses batch SQL queries instead of per-item queries to avoid N+1 performance issues.
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.reports.schemas import InventoryReport, InventoryItemReport
from app.shared.date_utils import date_range_to_timestamps

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
      Opening Stock = current_stock - adds_since_start + deducts_since_start
      Purchases     = adds within period (source = 'restock')
      Usage         = deductions within period (source != 'loss')
      Wastage       = deductions within period (source = 'loss')
      Closing Stock = Opening + Purchases - Usage - Wastage

    Uses grouped SQL queries (not per-item) to avoid N+1 performance issues.
    """

    start_ts, end_ts = date_range_to_timestamps(start, end)

    # ── 1. Get all inventory items ────────────────
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

    if not items:
        return InventoryReport(
            period_start=start,
            period_end=end,
            items=[],
            total_opening_value=Decimal("0"),
            total_closing_value=Decimal("0"),
            total_purchases_value=Decimal("0"),
            total_usage_value=Decimal("0"),
        )

    item_ids = [str(item["id"]) for item in items]

    # ── 2. Batch: net changes since period start (for opening stock) ──
    net_result = await db.execute(
        text("""
            SELECT
                item_id,
                COALESCE(SUM(CASE WHEN movement_type = 'add' THEN quantity ELSE 0 END), 0) as total_adds,
                COALESCE(SUM(CASE WHEN movement_type = 'deduct' THEN quantity ELSE 0 END), 0) as total_deducts
            FROM inventory_movements
            WHERE item_id = ANY(:item_ids)
              AND hotel_id = :hotel_id
              AND movement_time >= :start_ts
            GROUP BY item_id
        """),
        {"item_ids": item_ids, "hotel_id": hotel_id, "start_ts": start_ts},
    )
    net_changes = {
        str(row["item_id"]): {
            "adds": int(row["total_adds"]),
            "deducts": int(row["total_deducts"]),
        }
        for row in net_result.mappings().all()
    }

    # ── 3. Batch: period movements (purchases, usage, wastage) ──
    period_result = await db.execute(
        text("""
            SELECT
                item_id,
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
            WHERE item_id = ANY(:item_ids)
              AND hotel_id = :hotel_id
              AND movement_time >= :start_ts
              AND movement_time < :end_ts
            GROUP BY item_id
        """),
        {
            "item_ids": item_ids,
            "hotel_id": hotel_id,
            "start_ts": start_ts,
            "end_ts": end_ts,
        },
    )
    period_movements = {
        str(row["item_id"]): {
            "purchases": int(row["purchases"]),
            "usage": int(row["usage"]),
            "wastage": int(row["wastage"]),
        }
        for row in period_result.mappings().all()
    }

    # ── 4. Merge results in Python ────────────────
    report_items: list[InventoryItemReport] = []
    total_opening = Decimal("0")
    total_closing = Decimal("0")
    total_purchases = Decimal("0")
    total_usage = Decimal("0")

    for item in items:
        item_id = str(item["id"])
        unit_cost = Decimal(str(item["unit_cost"]))
        current_stock = int(item["current_stock"])

        net = net_changes.get(item_id, {"adds": 0, "deducts": 0})
        opening_stock = current_stock - net["adds"] + net["deducts"]

        period = period_movements.get(item_id, {"purchases": 0, "usage": 0, "wastage": 0})
        purchases = period["purchases"]
        usage = period["usage"]
        wastage = period["wastage"]
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
