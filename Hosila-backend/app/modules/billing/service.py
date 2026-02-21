"""
Billing service — invoice generation and tax transaction recording.

This is called during guest checkout. It:
1. Fetches all charges for the booking
2. Calculates tax breakdown per charge using the tax engine
3. Generates a formal invoice document
4. Records tax_transactions for remittance tracking
5. Creates journal entries for proper accounting
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
from app.shared.idempotency import check_idempotency, store_idempotency
from app.shared.exceptions import NotFoundError, ConflictError

TWO_PLACES = Decimal("0.01")


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

    Steps:
      1. Check idempotency key (return cached response if duplicate)
      2. Fetch booking + guest details
      3. Fetch all charges for the booking
      4. Calculate tax breakdown per charge via tax engine
      5. Insert/update invoice with full tax breakdown
      6. Insert tax_transactions per tax component
      7. Insert journal entries for accounting
      8. Write audit log
      9. Store idempotency key with response
    """

    # ── 1. Idempotency check ──────────────────────
    cached = await check_idempotency(db, hotel_id, request.idempotency_key)
    if cached:
        return InvoiceResponse(**cached)

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

        # ── 6. Insert tax_transactions ────────────
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

    # ── 5. Generate invoice number + insert ───────
    count_result = await db.execute(
        text("SELECT COUNT(*) FROM invoices WHERE hotel_id = :hotel_id"),
        {"hotel_id": hotel_id},
    )
    count = count_result.scalar() or 0
    invoice_number = f"INV-{datetime.now(timezone.utc).year}-{count + 1:05d}"
    invoice_id = str(uuid4())

    # Update existing invoice or create new one
    await db.execute(
        text("""
            INSERT INTO invoices (id, hotel_id, booking_id, invoice_number,
                                  guest_name, guest_phone, items,
                                  subtotal, tax, total, status)
            VALUES (:id, :hotel_id, :booking_id, :invoice_number,
                    :guest_name, :guest_phone, :items::jsonb,
                    :subtotal, :tax, :total, :status)
            ON CONFLICT (id) DO UPDATE SET
                items = :items::jsonb,
                subtotal = :subtotal,
                tax = :tax,
                total = :total,
                status = :status
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

    # ── 7. Journal entries ────────────────────────
    # CR: VAT Payable
    if total_vat > 0:
        await _insert_journal(db, hotel_id, invoice_id, "2010", "credit", total_vat,
                              "VAT Payable", "charge")
    # CR: TDL Payable
    if total_tdl > 0:
        await _insert_journal(db, hotel_id, invoice_id, "2020", "credit", total_tdl,
                              "TDL Payable", "charge")
    # CR: Service Charge Payable
    if total_sc > 0:
        await _insert_journal(db, hotel_id, invoice_id, "2030", "credit", total_sc,
                              "Service Charge Payable", "charge")

    await db.commit()

    # ── 8. Audit log ──────────────────────────────
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
    await db.commit()

    # ── 9. Build response + store idempotency ─────
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

    await store_idempotency(db, hotel_id, request.idempotency_key, response.model_dump(mode="json"))
    await db.commit()

    return response


# ── Helpers ───────────────────────────────────────────────────

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
