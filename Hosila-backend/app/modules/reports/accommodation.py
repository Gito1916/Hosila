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

from app.modules.reports.schemas import AccommodationReport, RoomTypeRevenue
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
