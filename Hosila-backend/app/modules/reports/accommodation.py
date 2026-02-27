"""
Accommodation report — RevPAR, ADR, occupancy, revenue by room type.
All calculations done server-side via SQL aggregation.

Charges are pre-aggregated per booking via CTE to prevent overcount
when a booking has multiple accommodation charges.
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.reports.schemas import (
    AccommodationReport,
    RoomTypeRevenue,
    AccommodationDailySummaryRow,
    AccommodationMonthlySummaryRow,
    AccommodationTransactionRow,
)
from app.shared.date_utils import date_range_to_timestamps

TWO_PLACES = Decimal("0.01")


async def generate_accommodation_report(
    db: AsyncSession,
    hotel_id: str,
    start: date,
    end: date,
) -> AccommodationReport:
    """Generate accommodation revenue and performance report."""

    start_ts, end_ts = date_range_to_timestamps(start, end)

    # Total rooms available
    rooms_result = await db.execute(
        text("SELECT COUNT(*) FROM rooms WHERE hotel_id = :hotel_id"),
        {"hotel_id": hotel_id},
    )
    total_rooms = rooms_result.scalar() or 0
    days_in_period = (end - start).days + 1
    total_room_nights = total_rooms * days_in_period

    # Booking revenue + room nights sold
    # CTE pre-aggregates charges per booking to prevent 1:N overcount
    booking_result = await db.execute(
        text("""
            WITH booking_charges AS (
                SELECT booking_id, SUM(gross_amount) as total_revenue
                FROM charges
                WHERE hotel_id = :hotel_id
                  AND department = 'accommodation'
                  AND status = 'active'
                GROUP BY booking_id
            )
            SELECT
                r.room_type,
                COUNT(DISTINCT b.id) as bookings,
                COALESCE(SUM(
                    CASE WHEN b.booking_type = 'night'
                    THEN GREATEST(1,
                        EXTRACT(DAY FROM
                            LEAST(b.check_out_time, :end_ts)
                            - GREATEST(b.check_in_time, :start_ts)
                        )::int
                    )
                    ELSE 1 END
                ), 0) as nights_sold,
                COALESCE(SUM(bc.total_revenue), 0) as revenue
            FROM bookings b
            JOIN rooms r ON b.room_id = r.id
            LEFT JOIN booking_charges bc ON bc.booking_id = b.id
            WHERE b.hotel_id = :hotel_id
              AND b.check_in_time < :end_ts
              AND b.check_out_time > :start_ts
            GROUP BY r.room_type
            ORDER BY revenue DESC
        """),
        {
            "hotel_id": hotel_id,
            "start_ts": start_ts,
            "end_ts": end_ts,
        },
    )
    rows = booking_result.mappings().all()

    revenue_by_type = []
    total_revenue = Decimal("0")
    total_sold = 0

    for row in rows:
        rev = Decimal(str(row["revenue"]))
        sold = int(row["nights_sold"])
        avg_rate = (rev / sold).quantize(TWO_PLACES, ROUND_HALF_UP) if sold > 0 else Decimal("0")

        revenue_by_type.append(RoomTypeRevenue(
            room_type=row["room_type"],
            total_revenue=rev,
            nights_sold=sold,
            average_rate=avg_rate,
        ))
        total_revenue += rev
        total_sold += sold

    # KPIs
    occupancy = (Decimal(total_sold) / Decimal(total_room_nights) * 100).quantize(
        TWO_PLACES, ROUND_HALF_UP
    ) if total_room_nights > 0 else Decimal("0")

    adr = (total_revenue / Decimal(total_sold)).quantize(
        TWO_PLACES, ROUND_HALF_UP
    ) if total_sold > 0 else Decimal("0")

    revpar = (total_revenue / Decimal(total_room_nights)).quantize(
        TWO_PLACES, ROUND_HALF_UP
    ) if total_room_nights > 0 else Decimal("0")

    # Tax collected on accommodation
    tax_result = await db.execute(
        text("""
            SELECT
                COALESCE(SUM(CASE WHEN tax_type = 'vat' THEN tax_amount ELSE 0 END), 0) as vat,
                COALESCE(SUM(CASE WHEN tax_type = 'service_charge' THEN tax_amount ELSE 0 END), 0) as sc
            FROM tax_transactions
            WHERE hotel_id = :hotel_id
              AND department = 'accommodation'
              AND transaction_date >= :start_ts
              AND transaction_date < :end_ts
        """),
        {
            "hotel_id": hotel_id,
            "start_ts": start_ts,
            "end_ts": end_ts,
        },
    )
    tax_row = tax_result.mappings().first()

    return AccommodationReport(
        period_start=start,
        period_end=end,
        total_revenue=total_revenue,
        total_rooms_available=total_rooms,
        total_room_nights=total_room_nights,
        rooms_sold=total_sold,
        occupancy_rate=occupancy,
        adr=adr,
        revpar=revpar,
        revenue_by_room_type=revenue_by_type,
        tax_collected=Decimal(str(tax_row["vat"])) if tax_row else Decimal("0"),
        service_charge_collected=Decimal(str(tax_row["sc"])) if tax_row else Decimal("0"),
    )


# ── V2 Daily Summary ────────────────────────────────────────

async def get_accommodation_daily_summary(
    db: AsyncSession,
    hotel_id: str,
    start: date,
    end: date,
) -> dict:
    """
    Daily accommodation summary: rooms sold, occupancy %, revenue per day.
    Uses generate_series so zero-activity days still appear.
    Returns dict with 'rows', 'total_revenue', 'average_daily_revenue'.
    """
    start_ts, end_ts = date_range_to_timestamps(start, end)

    # Total rooms for occupancy calculation
    rooms_result = await db.execute(
        text("SELECT COUNT(*) FROM rooms WHERE hotel_id = :hotel_id"),
        {"hotel_id": hotel_id},
    )
    total_rooms = rooms_result.scalar() or 0

    result = await db.execute(
        text("""
            WITH date_spine AS (
                SELECT d::date AS day
                FROM generate_series(:start_date::date, :end_date::date, '1 day') AS d
            ),
            daily_rooms AS (
                SELECT ds.day,
                       COUNT(DISTINCT b.room_id) AS rooms_sold
                FROM date_spine ds
                LEFT JOIN bookings b
                    ON b.hotel_id = :hotel_id
                   AND b.check_in_time::date <= ds.day
                   AND b.check_out_time::date > ds.day
                   AND b.status = 'active'
                GROUP BY ds.day
            ),
            daily_revenue AS (
                SELECT ds.day,
                       COALESCE(SUM(c.gross_amount), 0) AS revenue
                FROM date_spine ds
                LEFT JOIN charges c
                    ON c.hotel_id = :hotel_id
                   AND c.department = 'accommodation'
                   AND c.status = 'active'
                   AND c.charge_date >= ds.day::timestamp
                   AND c.charge_date < (ds.day + INTERVAL '1 day')::timestamp
                GROUP BY ds.day
            )
            SELECT dr.day,
                   dr.rooms_sold,
                   drev.revenue
            FROM daily_rooms dr
            JOIN daily_revenue drev ON dr.day = drev.day
            ORDER BY dr.day
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
        sold = int(row["rooms_sold"])
        rev = Decimal(str(row["revenue"]))
        occ = (Decimal(sold) / Decimal(total_rooms) * 100).quantize(
            TWO_PLACES, ROUND_HALF_UP
        ) if total_rooms > 0 else Decimal("0")

        rows.append(AccommodationDailySummaryRow(
            date=row["day"],
            rooms_sold=sold,
            occupancy_rate=occ,
            daily_revenue=rev,
        ))
        total_revenue += rev

    days_count = len(rows) or 1
    avg_daily = (total_revenue / Decimal(days_count)).quantize(TWO_PLACES, ROUND_HALF_UP)

    return {
        "rows": rows,
        "total_revenue": total_revenue,
        "average_daily_revenue": avg_daily,
    }


# ── V2 Monthly Summary ──────────────────────────────────────

async def get_accommodation_monthly_summary(
    db: AsyncSession,
    hotel_id: str,
    start: date,
    end: date,
) -> dict:
    """
    Monthly accommodation summary (one row per month).
    Aggregates from the daily summary internally.
    Returns dict with 'rows', 'total_revenue', 'average_monthly_revenue'.
    """
    daily = await get_accommodation_daily_summary(db, hotel_id, start, end)

    # Group daily rows by month
    monthly_buckets: dict[str, dict] = {}
    for row in daily["rows"]:
        month_key = row.date.strftime("%Y-%m")
        if month_key not in monthly_buckets:
            monthly_buckets[month_key] = {
                "rooms_sold": 0,
                "occ_sum": Decimal("0"),
                "occ_count": 0,
                "revenue": Decimal("0"),
            }
        bucket = monthly_buckets[month_key]
        bucket["rooms_sold"] += row.rooms_sold
        bucket["occ_sum"] += row.occupancy_rate
        bucket["occ_count"] += 1
        bucket["revenue"] += row.daily_revenue

    rows = []
    total_revenue = Decimal("0")
    for month_key in sorted(monthly_buckets):
        b = monthly_buckets[month_key]
        avg_occ = (b["occ_sum"] / Decimal(b["occ_count"])).quantize(
            TWO_PLACES, ROUND_HALF_UP
        ) if b["occ_count"] > 0 else Decimal("0")

        rows.append(AccommodationMonthlySummaryRow(
            month=month_key,
            rooms_sold=b["rooms_sold"],
            occupancy_rate=avg_occ,
            monthly_revenue=b["revenue"],
        ))
        total_revenue += b["revenue"]

    months_count = len(rows) or 1
    avg_monthly = (total_revenue / Decimal(months_count)).quantize(TWO_PLACES, ROUND_HALF_UP)

    return {
        "rows": rows,
        "total_revenue": total_revenue,
        "average_monthly_revenue": avg_monthly,
    }


# ── V2 Day Transactions ─────────────────────────────────────

async def get_accommodation_day_transactions(
    db: AsyncSession,
    hotel_id: str,
    report_date: date,
) -> list[AccommodationTransactionRow]:
    """
    Transaction-level detail for a single day: charges joined to
    bookings → guests → rooms.
    """
    start_ts, end_ts = date_range_to_timestamps(report_date, report_date)

    result = await db.execute(
        text("""
            SELECT
                c.charge_date AS time,
                b.id AS booking_id,
                COALESCE(g.name, 'Walk-in') AS guest_name,
                COALESCE(r.room_number, '') AS room_number,
                c.description,
                c.gross_amount AS amount,
                c.status
            FROM charges c
            LEFT JOIN bookings b ON c.booking_id = b.id
            LEFT JOIN guests g ON c.guest_id = g.id
            LEFT JOIN rooms r ON b.room_id = r.id
            WHERE c.hotel_id = :hotel_id
              AND c.department = 'accommodation'
              AND c.charge_date >= :start_ts
              AND c.charge_date < :end_ts
            ORDER BY c.charge_date
        """),
        {
            "hotel_id": hotel_id,
            "start_ts": start_ts,
            "end_ts": end_ts,
        },
    )

    return [
        AccommodationTransactionRow(
            time=row["time"],
            booking_id=str(row["booking_id"] or ""),
            guest_name=row["guest_name"],
            room_number=row["room_number"],
            description=row["description"],
            amount=Decimal(str(row["amount"])),
            status=row["status"],
        )
        for row in result.mappings().all()
    ]
