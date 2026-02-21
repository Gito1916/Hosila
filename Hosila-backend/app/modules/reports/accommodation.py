"""
Accommodation report — RevPAR, ADR, occupancy, revenue by room type.
All calculations done server-side via SQL aggregation.
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.reports.schemas import AccommodationReport, RoomTypeRevenue

TWO_PLACES = Decimal("0.01")


async def generate_accommodation_report(
    db: AsyncSession,
    hotel_id: str,
    start: date,
    end: date,
) -> AccommodationReport:
    """Generate accommodation revenue and performance report."""

    # Total rooms available
    rooms_result = await db.execute(
        text("SELECT COUNT(*) FROM rooms WHERE hotel_id = :hotel_id"),
        {"hotel_id": hotel_id},
    )
    total_rooms = rooms_result.scalar() or 0
    days_in_period = (end - start).days + 1
    total_room_nights = total_rooms * days_in_period

    # Booking revenue + room nights sold
    booking_result = await db.execute(
        text("""
            SELECT
                r.room_type,
                COUNT(DISTINCT b.id) as bookings,
                COALESCE(SUM(
                    CASE WHEN b.booking_type = 'night'
                    THEN GREATEST(1,
                        EXTRACT(DAY FROM
                            LEAST(b.check_out_time, :end_ts::timestamptz)
                            - GREATEST(b.check_in_time, :start_ts::timestamptz)
                        )::int
                    )
                    ELSE 1 END
                ), 0) as nights_sold,
                COALESCE(SUM(c.gross_amount), 0) as revenue
            FROM bookings b
            JOIN rooms r ON b.room_id = r.id
            LEFT JOIN charges c ON c.booking_id = b.id
                AND c.department = 'accommodation'
                AND c.status = 'active'
                AND c.hotel_id = :hotel_id
            WHERE b.hotel_id = :hotel_id
              AND b.check_in_time < :end_ts::timestamptz
              AND b.check_out_time > :start_ts::timestamptz
            GROUP BY r.room_type
            ORDER BY revenue DESC
        """),
        {
            "hotel_id": hotel_id,
            "start_ts": start.isoformat(),
            "end_ts": end.isoformat() + "T23:59:59Z",
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
              AND transaction_date >= :start_ts::timestamptz
              AND transaction_date < :end_ts::timestamptz
        """),
        {
            "hotel_id": hotel_id,
            "start_ts": start.isoformat(),
            "end_ts": end.isoformat() + "T23:59:59Z",
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
