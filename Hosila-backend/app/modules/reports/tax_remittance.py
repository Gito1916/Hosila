"""
Tax remittance report — VAT/TDL summaries, mark-as-remitted, batch management.
This is the compliance module that hotels will use to track
what they owe FIRS (VAT) and state revenue service (TDL).

Source of truth: tax_transactions table (used for both totals and remittance state).
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime, time, timezone
from uuid import uuid4
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.reports.schemas import (
    TaxRemittanceReport,
    TaxTypeSummary,
    DepartmentTaxBreakdown,
    MarkRemittedRequest,
    RemittanceBatchResponse,
)
from app.shared.audit import write_audit_log
from app.shared.date_utils import date_range_to_timestamps
from app.shared.logger import get_logger

logger = get_logger(__name__)

TWO_PLACES = Decimal("0.01")


async def generate_tax_remittance_report(
    db: AsyncSession,
    hotel_id: str,
    start: date,
    end: date,
) -> TaxRemittanceReport:
    """
    Generate tax remittance report showing what's owed to:
    - Federal: VAT
    - State: TDL
    - Informational: Service Charge collected

    Reads from tax_transactions (single source of truth for both
    collected amounts and remittance state).
    """

    start_ts, end_ts = date_range_to_timestamps(start, end)

    # ── Aggregate taxes from tax_transactions (single source of truth) ──
    result = await db.execute(
        text("""
            SELECT
                department,
                COUNT(*) as transaction_count,
                COALESCE(SUM(CASE WHEN tax_type = 'vat' THEN tax_amount ELSE 0 END), 0) as total_vat,
                COALESCE(SUM(CASE WHEN tax_type = 'tdl' THEN tax_amount ELSE 0 END), 0) as total_tdl,
                COALESCE(SUM(CASE WHEN tax_type = 'service_charge' THEN tax_amount ELSE 0 END), 0) as total_sc
            FROM tax_transactions
            WHERE hotel_id = :hotel_id
              AND transaction_date >= :start_ts
              AND transaction_date < :end_ts
            GROUP BY department
            ORDER BY department
        """),
        {
            "hotel_id": hotel_id,
            "start_ts": start_ts,
            "end_ts": end_ts,
        },
    )
    dept_rows = result.mappings().all()

    # Accumulate totals per tax type
    total_vat = Decimal("0")
    total_tdl = Decimal("0")
    total_sc = Decimal("0")
    total_count = 0

    by_department = []
    for row in dept_rows:
        vat = Decimal(str(row["total_vat"]))
        tdl = Decimal(str(row["total_tdl"]))
        sc = Decimal(str(row["total_sc"]))
        total_vat += vat
        total_tdl += tdl
        total_sc += sc
        total_count += int(row["transaction_count"])

        by_department.append(
            DepartmentTaxBreakdown(
                department=row["department"],
                vat=vat,
                tdl=tdl,
                service_charge=sc,
            )
        )

    # ── Remittance totals from tax_transactions (same source) ──
    remit_result = await db.execute(
        text("""
            SELECT
                tax_type,
                COALESCE(SUM(tax_amount), 0) as remitted
            FROM tax_transactions
            WHERE hotel_id = :hotel_id
              AND remitted = TRUE
              AND transaction_date >= :start_ts
              AND transaction_date < :end_ts
            GROUP BY tax_type
        """),
        {
            "hotel_id": hotel_id,
            "start_ts": start_ts,
            "end_ts": end_ts,
        },
    )
    remitted_map = {row["tax_type"]: Decimal(str(row["remitted"])) for row in remit_result.mappings().all()}

    def _make_summary(tax_type: str, total: Decimal) -> TaxTypeSummary:
        remitted = remitted_map.get(tax_type, Decimal("0"))
        return TaxTypeSummary(
            tax_type=tax_type,
            total_amount=total,
            remitted_amount=remitted,
            pending_amount=total - remitted,
            transaction_count=total_count,
        )

    return TaxRemittanceReport(
        period_start=start,
        period_end=end,
        federal_vat=_make_summary("vat", total_vat),
        state_tdl=_make_summary("tdl", total_tdl),
        service_charge=_make_summary("service_charge", total_sc),
        by_department=by_department,
    )


async def mark_as_remitted(
    db: AsyncSession,
    hotel_id: str,
    user_id: str,
    request: MarkRemittedRequest,
) -> RemittanceBatchResponse:
    """
    Mark all pending tax transactions of a given type within a period as remitted.
    Creates a remittance_batch record for auditing.
    """
    batch_id = str(uuid4())
    now = datetime.now(timezone.utc)  # timezone-aware UTC

    start_ts, end_ts = date_range_to_timestamps(request.period_start, request.period_end)

    # Count and sum pending transactions
    result = await db.execute(
        text("""
            SELECT COUNT(*) as count, COALESCE(SUM(tax_amount), 0) as total
            FROM tax_transactions
            WHERE hotel_id = :hotel_id
              AND tax_type = :tax_type
              AND remitted = FALSE
              AND transaction_date >= :start_ts
              AND transaction_date < :end_ts
        """),
        {
            "hotel_id": hotel_id,
            "tax_type": request.tax_type,
            "start_ts": start_ts,
            "end_ts": end_ts,
        },
    )
    row = result.mappings().first()
    count = int(row["count"])
    total = Decimal(str(row["total"]))

    if count == 0:
        return RemittanceBatchResponse(
            batch_id=batch_id,
            tax_type=request.tax_type,
            total_amount=Decimal("0"),
            transactions_marked=0,
            status="no_pending_transactions",
        )

    # Create remittance batch
    await db.execute(
        text("""
            INSERT INTO remittance_batches
                (id, hotel_id, tax_type, period_start, period_end,
                 total_amount, status, remitted_by, remitted_at, notes)
            VALUES
                (:id, :hotel_id, :tax_type, :period_start, :period_end,
                 :total_amount, 'remitted', :remitted_by, :remitted_at, :notes)
        """),
        {
            "id": batch_id,
            "hotel_id": hotel_id,
            "tax_type": request.tax_type,
            "period_start": request.period_start,
            "period_end": request.period_end,
            "total_amount": str(total),
            "remitted_by": user_id,
            "remitted_at": now,
            "notes": request.notes,
        },
    )

    # Mark transactions as remitted
    await db.execute(
        text("""
            UPDATE tax_transactions
            SET remitted = TRUE,
                remittance_batch_id = :batch_id,
                remittance_date = :remitted_at
            WHERE hotel_id = :hotel_id
              AND tax_type = :tax_type
              AND remitted = FALSE
              AND transaction_date >= :start_ts
              AND transaction_date < :end_ts
        """),
        {
            "batch_id": batch_id,
            "hotel_id": hotel_id,
            "tax_type": request.tax_type,
            "start_ts": start_ts,
            "end_ts": end_ts,
            "remitted_at": now,
        },
    )

    await db.commit()

    # Audit log (non-critical)
    try:
        await write_audit_log(
            db, hotel_id, user_id,
            action="tax_remitted",
            entity_type="remittance_batch",
            entity_id=batch_id,
            details={
                "tax_type": request.tax_type,
                "total_amount": str(total),
                "transactions_marked": count,
                "period": f"{request.period_start} to {request.period_end}",
            },
        )
        await db.commit()
    except Exception as e:
        logger.error("Non-critical audit log failed for remittance: %s", e, exc_info=True)

    return RemittanceBatchResponse(
        batch_id=batch_id,
        tax_type=request.tax_type,
        total_amount=total,
        transactions_marked=count,
        status="remitted",
    )
