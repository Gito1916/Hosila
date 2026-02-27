"""
Billing service — invoice generation and tax transaction recording.

This is called during guest checkout. It:
1. Reserves idempotency key atomically (prevents race conditions)
2. Fetches all charges for the booking
3. Calculates tax breakdown per charge using the tax engine
4. Generates a formal invoice document
5. Records tax_transactions for remittance tracking
6. Creates journal entries for proper accounting
7. Commits all business writes in a single transaction
8. Records audit log (non-critical — failure here won't rollback business data)
9. Stores idempotency response
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tax_engine.service import calculate_tax_breakdown
from app.modules.tax_engine.schemas import TaxCalculationRequest
from app.modules.billing.schemas import (
    CheckoutRequest,
    InvoiceLineItem,
    InvoiceResponse,
)
from app.shared.audit import write_audit_log
from app.shared.idempotency import reserve_idempotency_key, store_idempotency
from app.shared.exceptions import NotFoundError, ConflictError
from app.shared.logger import get_logger

logger = get_logger(__name__)

TWO_PLACES = Decimal("0.01")
_MAX_INVOICE_RETRIES = 3


def _round(amount: Decimal) -> Decimal:
    return amount.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


async def generate_invoice(
    db: AsyncSession,
    hotel_id: str,
    user_id: str,
    request: CheckoutRequest,
) -> InvoiceResponse:
    """
    Generate a tax-compliant invoice for a booking checkout.

    Uses reserve-first idempotency to prevent duplicate charges under
    concurrent retries. All business writes (invoice, tax_transactions,
    journal entries) are committed in a single transaction.
    """

    # ── 1. Reserve idempotency key atomically ─────
    status, cached = await reserve_idempotency_key(db, hotel_id, request.idempotency_key)

    if status == "already_processed" and cached:
        return InvoiceResponse(**cached)

    if status == "in_progress":
        raise ConflictError(
            "This checkout is already being processed. Please wait and retry."
        )

    # status == "reserved" — proceed with business logic

    # ── 2. Fetch booking + guest ──────────────────
    result = await db.execute(
        text("""
            SELECT b.id, b.guest_id, b.total_charged, b.total_paid, b.balance,
                   g.name as guest_name, g.phone as guest_phone
            FROM bookings b
            JOIN guests g ON b.guest_id = g.id
            WHERE b.id = :booking_id AND b.hotel_id = :hotel_id
        """),
        {"booking_id": request.booking_id, "hotel_id": hotel_id},
    )
    booking = result.mappings().first()
    if not booking:
        raise NotFoundError("Booking", request.booking_id)

    # ── 3. Fetch all charges ──────────────────────
    result = await db.execute(
        text("""
            SELECT id, department, description, gross_amount, tax_rate, status
            FROM charges
            WHERE booking_id = :booking_id AND hotel_id = :hotel_id AND status = 'active'
            ORDER BY charge_date
        """),
        {"booking_id": request.booking_id, "hotel_id": hotel_id},
    )
    charges = result.mappings().all()

    # ── 4. Calculate taxes per charge ─────────────
    items: list[InvoiceLineItem] = []
    total_base = Decimal("0")
    total_sc = Decimal("0")
    total_vat = Decimal("0")
    total_tdl = Decimal("0")

    for charge in charges:
        base = Decimal(str(charge["gross_amount"]))

        tax_result = await calculate_tax_breakdown(
            db,
            hotel_id,
            TaxCalculationRequest(
                base_amount=base,
                department=charge["department"],
            ),
        )

        item = InvoiceLineItem(
            description=charge["description"],
            department=charge["department"],
            base_amount=base,
            service_charge=tax_result.service_charge.amount,
            vat=tax_result.vat.amount,
            tdl=tax_result.tdl.amount,
            total=tax_result.total,
        )
        items.append(item)

        total_base += base
        total_sc += tax_result.service_charge.amount
        total_vat += tax_result.vat.amount
        total_tdl += tax_result.tdl.amount

        # Update charge with v2 tax columns
        await db.execute(
            text("""
                UPDATE charges SET
                    base_amount = :base,
                    service_charge_amount = :sc,
                    vat_amount_v2 = :vat,
                    tdl_amount = :tdl
                WHERE id = :charge_id
            """),
            {
                "base": str(base),
                "sc": str(tax_result.service_charge.amount),
                "vat": str(tax_result.vat.amount),
                "tdl": str(tax_result.tdl.amount),
                "charge_id": charge["id"],
            },
        )

        # Insert tax_transactions per tax component
        now = datetime.now(timezone.utc)
        for tax_type, component in [
            ("service_charge", tax_result.service_charge),
            ("vat", tax_result.vat),
            ("tdl", tax_result.tdl),
        ]:
            if component.enabled and component.amount > 0:
                await db.execute(
                    text("""
                        INSERT INTO tax_transactions
                            (hotel_id, charge_id, tax_type, taxable_amount,
                             tax_rate, tax_amount, department, transaction_date)
                        VALUES
                            (:hotel_id, :charge_id, :tax_type, :taxable_amount,
                             :tax_rate, :tax_amount, :department, :tx_date)
                    """),
                    {
                        "hotel_id": hotel_id,
                        "charge_id": charge["id"],
                        "tax_type": tax_type,
                        "taxable_amount": str(base),
                        "tax_rate": str(component.rate),
                        "tax_amount": str(component.amount),
                        "department": charge["department"],
                        "tx_date": now,
                    },
                )

    grand_total = total_base + total_sc + total_vat + total_tdl

    # ── 5. Generate invoice number with retry on collision ────
    invoice_id = str(uuid4())
    invoice_number = await _generate_invoice_number(db, hotel_id)

    await db.execute(
        text("""
            INSERT INTO invoices (id, hotel_id, booking_id, invoice_number,
                                  guest_name, guest_phone, items,
                                  subtotal, tax, total, status)
            VALUES (:id, :hotel_id, :booking_id, :invoice_number,
                    :guest_name, :guest_phone, :items::jsonb,
                    :subtotal, :tax, :total, :status)
        """),
        {
            "id": invoice_id,
            "hotel_id": hotel_id,
            "booking_id": request.booking_id,
            "invoice_number": invoice_number,
            "guest_name": booking["guest_name"],
            "guest_phone": booking["guest_phone"],
            "items": _serialize_items(items),
            "subtotal": str(total_base),
            "tax": str(total_vat + total_tdl),
            "total": str(grand_total),
            "status": "paid" if Decimal(str(booking["total_paid"])) >= grand_total else "partial",
        },
    )

    # ── 6. Journal entries ────────────────────────
    if total_vat > 0:
        await _insert_journal(db, hotel_id, invoice_id, "2010", "credit", total_vat,
                              "VAT Payable", "charge")
    if total_tdl > 0:
        await _insert_journal(db, hotel_id, invoice_id, "2020", "credit", total_tdl,
                              "TDL Payable", "charge")
    if total_sc > 0:
        await _insert_journal(db, hotel_id, invoice_id, "2030", "credit", total_sc,
                              "Service Charge Payable", "charge")

    # ── 7. SINGLE COMMIT for all business writes ──
    await db.commit()

    # ── 8. Build response ─────────────────────────
    response = InvoiceResponse(
        invoice_id=invoice_id,
        invoice_number=invoice_number,
        booking_id=request.booking_id,
        guest_name=booking["guest_name"],
        guest_phone=booking["guest_phone"],
        items=items,
        subtotal=total_base,
        total_service_charge=total_sc,
        total_vat=total_vat,
        total_tdl=total_tdl,
        grand_total=grand_total,
        amount_paid=Decimal(str(booking["total_paid"])),
        balance=grand_total - Decimal(str(booking["total_paid"])),
        status="paid" if Decimal(str(booking["total_paid"])) >= grand_total else "partial",
        created_at=datetime.now(timezone.utc),
    )

    # ── 9. Non-critical post-commit: audit + idempotency ──
    # These run after the main commit. If they fail, business data
    # is already persisted. We log errors but don't rollback.
    try:
        await write_audit_log(
            db, hotel_id, user_id,
            action="invoice_generated",
            entity_type="invoice",
            entity_id=invoice_id,
            details={
                "invoice_number": invoice_number,
                "grand_total": str(grand_total),
                "vat": str(total_vat),
                "tdl": str(total_tdl),
                "booking_id": request.booking_id,
            },
        )
        await store_idempotency(db, hotel_id, request.idempotency_key, response.model_dump(mode="json"))
        await db.commit()
    except Exception as e:
        logger.error(
            "Non-critical post-commit failed (audit/idempotency): %s",
            e, exc_info=True,
        )
        # Don't re-raise — business data is already committed

    return response


# ── Helpers ───────────────────────────────────────────────────

async def _generate_invoice_number(db: AsyncSession, hotel_id: str) -> str:
    """
    Generate a unique invoice number using COUNT + retry on collision.
    Format: INV-{year}-{sequence:05d}
    """
    year = datetime.now(timezone.utc).year

    for attempt in range(_MAX_INVOICE_RETRIES):
        count_result = await db.execute(
            text("SELECT COUNT(*) FROM invoices WHERE hotel_id = :hotel_id"),
            {"hotel_id": hotel_id},
        )
        count = (count_result.scalar() or 0) + 1 + attempt
        candidate = f"INV-{year}-{count:05d}"

        # Check uniqueness
        exists = await db.execute(
            text("""
                SELECT 1 FROM invoices
                WHERE hotel_id = :hotel_id AND invoice_number = :inv_num
                LIMIT 1
            """),
            {"hotel_id": hotel_id, "inv_num": candidate},
        )
        if not exists.first():
            return candidate

    # Fallback: append UUID fragment for guaranteed uniqueness
    fallback = f"INV-{year}-{str(uuid4())[:8].upper()}"
    logger.warning("Invoice number collision after %d retries, using fallback: %s", _MAX_INVOICE_RETRIES, fallback)
    return fallback


def _serialize_items(items: list[InvoiceLineItem]) -> str:
    """Serialize invoice items to JSON string for JSONB storage."""
    import json
    return json.dumps([item.model_dump(mode="json") for item in items])


async def _insert_journal(
    db: AsyncSession,
    hotel_id: str,
    reference_id: str,
    account_code: str,
    entry_type: str,
    amount: Decimal,
    description: str,
    reference_type: str,
) -> None:
    """Insert a journal entry."""
    await db.execute(
        text("""
            INSERT INTO journal_entries
                (hotel_id, entry_date, description, account_code, entry_type,
                 amount, reference_type, reference_id)
            VALUES
                (:hotel_id, NOW(), :description, :account_code, :entry_type,
                 :amount, :reference_type, :reference_id)
        """),
        {
            "hotel_id": hotel_id,
            "description": description,
            "account_code": account_code,
            "entry_type": entry_type,
            "amount": str(amount),
            "reference_type": reference_type,
            "reference_id": reference_id,
        },
    )
