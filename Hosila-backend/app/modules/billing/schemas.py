"""
Pydantic schemas for the billing module.
"""

from decimal import Decimal
from datetime import datetime
from pydantic import BaseModel, Field


# ── Invoice Creation ──────────────────────────────────────────

class CheckoutRequest(BaseModel):
    """Request to generate an invoice at guest checkout."""
    booking_id: str = Field(..., description="The booking UUID being checked out")
    idempotency_key: str = Field(..., description="Unique key to prevent duplicate invoices")


class InvoiceLineItem(BaseModel):
    """A single line item on the invoice with tax breakdown."""
    description: str
    department: str
    base_amount: Decimal
    service_charge: Decimal
    vat: Decimal
    tdl: Decimal
    total: Decimal


class InvoiceResponse(BaseModel):
    """Full invoice response returned after checkout."""
    invoice_id: str
    invoice_number: str
    booking_id: str
    guest_name: str
    guest_phone: str | None = None
    items: list[InvoiceLineItem]
    subtotal: Decimal
    total_service_charge: Decimal
    total_vat: Decimal
    total_tdl: Decimal
    grand_total: Decimal
    amount_paid: Decimal
    balance: Decimal
    status: str
    created_at: datetime


# ── Tax Transaction (from invoice) ────────────────────────────

class TaxTransactionOut(BaseModel):
    """A tax transaction created from an invoice."""
    id: str
    tax_type: str
    taxable_amount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    department: str
    remitted: bool
