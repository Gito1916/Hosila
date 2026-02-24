"""
Tax remittance report — VAT/TDL summaries, mark-as-remitted, batch management.
This is the compliance module that hotels will use to track
what they owe FIRS (VAT) and state revenue service (TDL).
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime, timezone
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
    """

    # ── Summary by tax type ───────────────────────
    summary_result = await db.execute(
        text("""
            SELECT
                tax_type,
                COUNT(*) as transaction_count,
                SUM(tax_amount) as total_amount,
                SUM(CASE WHEN remitted THEN tax_amount ELSE 0 END) as remitted_amount,
                SUM(CASE WHEN NOT remitted THEN tax_amount ELSE 0 END) as pending_amount
            FROM tax_transactions
            WHERE hotel_id = :hotel_id
              AND transaction_date >= CAST(:start_ts AS timestamptz)
              AND transaction_date < CAST(:end_ts AS timestamptz)
            GROUP BY tax_type
        """),
        {
            "hotel_id": hotel_id,
            "start_ts": start.isoformat(),
            "end_ts": end.isoformat() + "T23:59:59Z",
        },
    )
    summary_rows = {row["tax_type"]: row for row in summary_result.mappings().all()}

    def _make_summary(tax_type: str) -> TaxTypeSummary:
        row = summary_rows.get(tax_type)
        if row:
            return TaxTypeSummary(
                tax_type=tax_type,
                total_amount=Decimal(str(row["total_amount"])),
                remitted_amount=Decimal(str(row["remitted_amount"])),
                pending_amount=Decimal(str(row["pending_amount"])),
                transaction_count=int(row["transaction_count"]),
            )
        return TaxTypeSummary(
            tax_type=tax_type,
            total_amount=Decimal("0"),
            remitted_amount=Decimal("0"),
            pending_amount=Decimal("0"),
            transaction_count=0,
        )

    # ── Breakdown by department ───────────────────
    dept_result = await db.execute(
        text("""
            SELECT
                department,
                COALESCE(SUM(CASE WHEN tax_type = 'vat' THEN tax_amount ELSE 0 END), 0) as vat,
                COALESCE(SUM(CASE WHEN tax_type = 'tdl' THEN tax_amount ELSE 0 END), 0) as tdl,
                COALESCE(SUM(CASE WHEN tax_type = 'service_charge' THEN tax_amount ELSE 0 END), 0) as sc
            FROM tax_transactions
            WHERE hotel_id = :hotel_id
              AND transaction_date >= CAST(:start_ts AS timestamptz)
              AND transaction_date < CAST(:end_ts AS timestamptz)
            GROUP BY department
            ORDER BY department
        """),
        {
            "hotel_id": hotel_id,
            "start_ts": start.isoformat(),
            "end_ts": end.isoformat() + "T23:59:59Z",
        },
    )
    by_department = [
        DepartmentTaxBreakdown(
            department=row["department"],
            vat=Decimal(str(row["vat"])),
            tdl=Decimal(str(row["tdl"])),
            service_charge=Decimal(str(row["sc"])),
        )
        for row in dept_result.mappings().all()
    ]

    return TaxRemittanceReport(
        period_start=start,
        period_end=end,
        federal_vat=_make_summary("vat"),
        state_tdl=_make_summary("tdl"),
        service_charge=_make_summary("service_charge"),
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
    now = datetime.now(timezone.utc)

    # Count and sum pending transactions
    result = await db.execute(
        text("""
            SELECT COUNT(*) as count, COALESCE(SUM(tax_amount), 0) as total
            FROM tax_transactions
            WHERE hotel_id = :hotel_id
              AND tax_type = :tax_type
              AND remitted = FALSE
              AND transaction_date >= CAST(:start_ts AS timestamptz)
              AND transaction_date < CAST(:end_ts AS timestamptz)
        """),
        {
            "hotel_id": hotel_id,
            "tax_type": request.tax_type,
            "start_ts": request.period_start.isoformat(),
            "end_ts": request.period_end.isoformat() + "T23:59:59Z",
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
              AND transaction_date >= CAST(:start_ts AS timestamptz)
              AND transaction_date < CAST(:end_ts AS timestamptz)
        """),
        {
            "batch_id": batch_id,
            "hotel_id": hotel_id,
            "tax_type": request.tax_type,
            "start_ts": request.period_start.isoformat(),
            "end_ts": request.period_end.isoformat() + "T23:59:59Z",
            "remitted_at": now,
        },
    )

    await db.commit()

    # Audit log
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

    return RemittanceBatchResponse(
        batch_id=batch_id,
        tax_type=request.tax_type,
        total_amount=total,
        transactions_marked=count,
        status="remitted",
    )
